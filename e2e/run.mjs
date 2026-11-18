// Runs the built extension in Chrome or Firefox against a page with Reddit's markup.
//
//   node e2e/run.mjs [--browser chrome|firefox] [--executable <path>]
//                    [--backend auto|webgpu|wasm] [--threads 8] [--model <dir>] [--headed] [--fresh]
//
// The model comes from a local export directory, served over HTTP as the hub serves it.
// Each browser and backend has its own profile under .profiles/, which keeps the model
// cache between runs; --fresh deletes it first.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const TIMEOUT_MS = 300_000;

const { values: args } = parseArgs({
  options: {
    browser: { type: 'string', default: 'chrome' },
    executable: { type: 'string' },
    backend: { type: 'string', default: 'auto' },
    threads: { type: 'string', default: '8' },
    model: { type: 'string', default: path.resolve(ROOT, '../slop-detector/runs/voi-slop-detect-380M/web') },
    port: { type: 'string', default: '8473' },
    headed: { type: 'boolean', default: false },
    fresh: { type: 'boolean', default: false },
  },
});
const FIREFOX = args.browser === 'firefox';
const EXTENSION = path.join(ROOT, FIREFOX ? '.output/firefox-mv2' : '.output/chrome-mv3');
/** Firefox names an extension's origin by a random id: the profile gets this one instead. */
const FIREFOX_UUID = '5e7ec7a1-51a0-4d7e-8000-000000000001';

/** Serves the export directory to the extension's origin, as the hub does (CORS open). */
function serveModel(dir) {
  const server = createServer((request, response) => {
    const file = path.join(dir, path.normalize(decodeURIComponent(request.url.split('?')[0])));
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' };
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      return response.writeHead(404, headers).end();
    }
    response.writeHead(200, { ...headers, 'Content-Length': statSync(file).size });
    createReadStream(file).pipe(response);
  });
  // A fixed port: the model is cached under its URL, and a new port would be a new model.
  return new Promise((resolve) => server.listen(Number(args.port), '127.0.0.1', () => resolve(server)));
}

/** Chrome with the extension loaded; the extension's origin. */
async function launchChrome(profile) {
  const linux = process.platform === 'linux';
  const browser = await puppeteer.launch({
    ...(args.executable ? { executablePath: args.executable } : { channel: 'chrome' }),
    headless: !args.headed,
    protocolTimeout: TIMEOUT_MS,
    userDataDir: profile,
    pipe: true,
    enableExtensions: true,
    args: [
      // A real GPU in headless Chrome on Linux: without these WebGPU is absent or SwiftShader.
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      ...(linux ? ['--enable-features=Vulkan', '--use-angle=vulkan'] : []),
      ...(linux && !args.headed ? ['--disable-vulkan-surface'] : []),
    ],
  });
  return { browser, origin: `chrome-extension://${await browser.installExtension(EXTENSION)}` };
}

/** Firefox with the extension installed as a temporary add-on; the extension's origin. */
async function launchFirefox(profile) {
  const manifest = JSON.parse(readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  const { id } = manifest.browser_specific_settings.gecko;
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: args.executable ?? 'firefox',
    headless: !args.headed,
    protocolTimeout: TIMEOUT_MS,
    userDataDir: profile,
    // WebDriver BiDi reaches extension pages only with this.
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
    extraPrefsFirefox: {
      'extensions.webextensions.uuids': JSON.stringify({ [id]: FIREFOX_UUID }),
      // Keeps the model cache of a temporary add-on, which Firefox uninstalls when it closes.
      'extensions.webextensions.keepStorageOnUninstall': true,
      'extensions.webextensions.keepUuidOnUninstall': true,
    },
  });
  await browser.installExtension(EXTENSION);
  return { browser, origin: `moz-extension://${FIREFOX_UUID}` };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Where a tab is. Firefox does not report a tab's URL until a script asks it. */
const urlOf = (tab) => tab.evaluate(() => location.href).catch(() => '');

const server = await serveModel(args.model);
const repo = `http://127.0.0.1:${server.address().port}`;
console.log(`model: ${args.model} at ${repo}`);
execFileSync('npx', ['wxt', 'build', '-b', args.browser], { cwd: ROOT, env: { ...process.env, VITE_REPO: repo }, stdio: 'inherit' });

const profile = path.join(ROOT, '.profiles', `${args.browser}-${args.backend}`);
if (args.fresh) rmSync(profile, { recursive: true, force: true });
/** A profile from an earlier run holds the model: this run must not download it again. */
const cached = existsSync(profile);
const { browser, origin } = await (FIREFOX ? launchFirefox : launchChrome)(profile);
let failed = false;

function check(what, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  failed ||= !ok;
}

/** Whether `predicate(arg)` holds in the tab within `ms`; errors while its page loads count as not yet. */
async function holdsWithin(tab, ms, predicate, arg) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await tab.evaluate(predicate, arg).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}

/** A new tab on one of the extension's pages, once it has loaded. */
async function openPage(url) {
  const tab = await browser.newPage();
  // Firefox opens an extension page but never reports the navigation finished.
  tab.goto(url).catch(() => undefined);
  const loaded = (wanted) => location.href === wanted && document.readyState === 'complete';
  if (!(await holdsWithin(tab, 30_000, loaded, url))) throw new Error(`${url} did not load`);
  return tab;
}

/** Reloads the add-on from one of its tabs and waits until it has a new background page. */
async function reloadFirefoxAddOn(tab) {
  await tab.evaluate(async () => ((await browser.runtime.getBackgroundPage()).beforeReload = true));
  tab.evaluate(() => browser.runtime.reload()).catch(() => undefined);
  const isNew = async () => {
    const background = await browser.runtime.getBackgroundPage();
    return !background.beforeReload && background.document.readyState === 'complete';
  };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    // Opening a tab fails while Firefox closes the add-on's old tabs.
    const probe = await browser.newPage().catch(() => null);
    if (!probe) {
      await sleep(100);
      continue;
    }
    probe.goto(`${origin}/manifest.json`).catch(() => undefined);
    const isBack = await holdsWithin(probe, 2000, isNew);
    await probe.close().catch(() => undefined);
    if (isBack) return;
  }
  throw new Error('the add-on did not come back from its reload');
}

const textOf = (tab, selector) => tab.$eval(selector, (element) => element.innerText);
const isShown = (tab, selector) => tab.$eval(selector, (element) => element.checkVisibility());

try {
  // Each run installs the extension, which opens the welcome page in a tab of its own.
  const welcomeUrl = `${origin}/welcome.html`;
  const deadline = Date.now() + 10_000;
  const opened = async () => (await Promise.all((await browser.pages()).map(urlOf))).includes(welcomeUrl);
  while (!(await opened()) && Date.now() < deadline) await sleep(100);
  check('a new install opens the welcome page', await opened());
  // manifest.json is an extension page that does not start the model host.
  const settings = await openPage(`${origin}/manifest.json`);
  await settings.evaluate(
    async ({ host, display }) => {
      const api = globalThis.browser ?? chrome;
      await api.storage.local.set({ host });
      await api.storage.sync.set({ display });
    },
    {
      host: { backend: args.backend, threads: Number(args.threads), modelAllowed: false },
      display: { enabled: true, sitesOff: {}, showMiddle: true },
    },
  );
  // The host the welcome page started holds the last run's settings.
  if (FIREFOX) {
    await reloadFirefoxAddOn(settings);
  } else {
    await settings.evaluate(() => chrome.offscreen.closeDocument().catch(() => undefined));
    await settings.close();
  }

  const fixture = readFileSync(path.join(ROOT, 'e2e/fixtures/thread.html'), 'utf8');
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.url().startsWith('https://www.reddit.com/')
      ? request.respond({ contentType: 'text/html; charset=utf-8', body: fixture })
      : request.continue(),
  );
  page.on('console', (message) => console.log(`page ${message.type()}: ${message.text()}`));
  await page.goto('https://www.reddit.com/r/selfhosted/comments/abc/moving/');

  const log = await openPage(`${origin}/log.html`);
  await page.bringToFront();

  /** The badge of each post and comment, by id; null where there is none, or none that is drawn. */
  const badges = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('shreddit-post, shreddit-comment')].map((item) => {
          // A reply's badge is inside its parent comment too: take the item's own.
          const own = [...item.querySelectorAll('[data-slop-detect]')].find(
            (badge) => badge.closest('shreddit-post, shreddit-comment') === item,
          );
          const drawn = own && own.getBoundingClientRect().height > 0;
          const place = own?.closest('[slot="credit-bar"], [slot="commentMeta"]') ? 'line' : 'text';
          return [item.id || item.getAttribute('thingid'), drawn ? `${own.shadowRoot.querySelector('span').textContent} (${place})` : null];
        }),
      ),
    );
  const count = (found) => Object.values(found).filter(Boolean).length;
  async function waitForBadges(wanted) {
    const deadline = Date.now() + TIMEOUT_MS;
    let found = await badges();
    while (count(found) < wanted && Date.now() < deadline) {
      await sleep(250);
      found = await badges();
    }
    return found;
  }

  // Nothing is scored, or downloaded, before the user agrees in the popup.
  const popup = await openPage(`${origin}/popup.html`);
  await popup.waitForSelector('#download');
  check('the popup offers the download', (await textOf(popup, '#status')) === 'Not downloaded yet.');
  const welcome = await openPage(welcomeUrl);
  await welcome.waitForSelector('#download');
  check('the welcome page offers the download', (await textOf(welcome, '#status')) === 'Not downloaded yet.');
  check('the welcome page names the sites', /Reddit, LinkedIn, Hacker News, and X/.test(await textOf(welcome, '#sites')));
  await page.bringToFront();
  await sleep(1000);
  check('no badges before the download is allowed', count(await badges()) === 0);
  // Clicked from a script: a tab in the background draws nothing to click on.
  await popup.$eval('#download', (button) => button.click());

  // In view: the post and comments one to three. Comment two is too short to score.
  const first = await waitForBadges(3);
  check('the popup says where the model runs', /^Ready, on the /.test(await textOf(popup, '#status')));
  check(
    'the welcome page says the model is ready and what to do next',
    /^Ready, on the /.test(await textOf(welcome, '#status')) &&
      (await isShown(welcome, '#ready-note')) &&
      !(await isShown(welcome, '#download')),
  );
  console.log('badges before scrolling:', JSON.stringify(first));
  check('the post and the two long comments in view have badges', !!first.t3_post && !!first.t1_one && !!first.t1_three);
  check('the short comment has none', first.t1_two === null);
  check('the comment far below has none yet', first.t1_four === null);
  check('the German comment has none', first.t1_german === null);
  check('the canned reply reads as AI', /^AI /.test(first.t1_three ?? ''));
  check('the personal reply reads as human', /^Human /.test(first.t1_one ?? ''));
  check(
    'the badges are on the metadata lines',
    [first.t3_post, first.t1_one, first.t1_three].every((badge) => badge?.endsWith('(line)')),
  );

  await page.$eval('shreddit-comment[thingid="t1_four"]', (comment) => comment.scrollIntoView());
  const second = await waitForBadges(4);
  console.log('badges after scrolling:', JSON.stringify(second));
  check('the comment far below has a badge after scrolling to it', !!second.t1_four);
  check('with no time on its metadata line, the badge is at the top of the text', !!second.t1_four?.endsWith('(text)'));

  const hostLog = await textOf(log, '#log');
  console.log('--- host log ---');
  console.log(hostLog);
  const fromCache = hostLog.includes('model_quantized.onnx_data: 448471040 bytes from cache');
  check(cached ? 'the model came from the cache' : 'the model was downloaded', fromCache === cached);
  const farText = await textOf(page, 'shreddit-comment[thingid="t1_four"] [slot="comment"]');
  check('the scored text is the block alone, without the badge', !/AI \d|Human \d/.test(farText));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
