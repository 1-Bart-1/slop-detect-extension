// Runs the built extension in Chromium against a page with Reddit's markup.
//
//   node e2e/run.mjs [--backend auto|webgpu|wasm] [--threads 8] [--model <dir>] [--headed] [--fresh]
//
// The model comes from a local export directory, served over HTTP as the hub serves it.
// Each backend has its own Chromium profile under .profiles/, which keeps the model
// cache between runs; --fresh deletes it first.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTENSION = path.join(ROOT, '.output/chrome-mv3');
const TIMEOUT_MS = 300_000;

const { values: args } = parseArgs({
  options: {
    backend: { type: 'string', default: 'auto' },
    threads: { type: 'string', default: '8' },
    model: { type: 'string', default: path.resolve(ROOT, '../slop-detector/runs/voi-slop-detect-380M/web') },
    port: { type: 'string', default: '8473' },
    headed: { type: 'boolean', default: false },
    fresh: { type: 'boolean', default: false },
  },
});

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

function launch(profile) {
  const linux = process.platform === 'linux';
  return chromium.launchPersistentContext(profile, {
    // Chromium, not Chrome: branded Chrome no longer loads unpacked extensions from a flag.
    channel: 'chromium',
    headless: !args.headed,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      // A real GPU in headless Chromium on Linux: without these WebGPU is absent or SwiftShader.
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      ...(linux ? ['--enable-features=Vulkan', '--use-angle=vulkan'] : []),
      ...(linux && !args.headed ? ['--disable-vulkan-surface'] : []),
    ],
  });
}

const server = await serveModel(args.model);
const repo = `http://127.0.0.1:${server.address().port}`;
console.log(`model: ${args.model} at ${repo}`);
execFileSync('npx', ['wxt', 'build'], { cwd: ROOT, env: { ...process.env, VITE_REPO: repo }, stdio: 'inherit' });

const profile = path.join(ROOT, '.profiles', args.backend);
if (args.fresh) rmSync(profile, { recursive: true, force: true });
/** A profile from an earlier run holds the model: this run must not download it again. */
const cached = existsSync(profile);
const context = await launch(profile);
let failed = false;
try {
  const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Node gives a chrome-extension: URL the origin "null": build it from the host, the extension's id.
  const origin = `chrome-extension://${new URL(background.url()).host}`;
  // The download is not allowed yet, and every band gets a badge, so each scored block shows one.
  await background.evaluate(
    async ({ host, display }) => {
      await chrome.storage.local.set({ host });
      await chrome.storage.sync.set({ display });
    },
    {
      host: { backend: args.backend, threads: Number(args.threads), modelAllowed: false },
      display: { enabled: true, sitesOff: {}, showMiddle: true },
    },
  );

  const fixture = readFileSync(path.join(ROOT, 'e2e/fixtures/thread.html'), 'utf8');
  await context.route('https://www.reddit.com/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }),
  );

  const page = await context.newPage();
  page.on('console', (message) => console.log(`page ${message.type()}: ${message.text()}`));
  await page.goto('https://www.reddit.com/r/selfhosted/comments/abc/moving/');

  const log = await context.newPage();
  await log.goto(`${origin}/log.html`);
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
          return [item.id || item.getAttribute('thingid'), drawn ? own.shadowRoot.querySelector('span').textContent : null];
        }),
      ),
    );
  const count = (found) => Object.values(found).filter(Boolean).length;
  async function waitForBadges(wanted) {
    const deadline = Date.now() + TIMEOUT_MS;
    let found = await badges();
    while (count(found) < wanted && Date.now() < deadline) {
      await page.waitForTimeout(250);
      found = await badges();
    }
    return found;
  }
  function check(what, ok) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    failed ||= !ok;
  }

  // Nothing is scored, or downloaded, before the user agrees in the popup.
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await popup.locator('#download').waitFor();
  check('the popup offers the download', (await popup.locator('#status').innerText()) === 'Not downloaded yet.');
  await page.bringToFront();
  await page.waitForTimeout(1000);
  check('no badges before the download is allowed', count(await badges()) === 0);
  await popup.locator('#download').click();

  // In view: the post and comments one to three. Comment two is too short to score.
  const first = await waitForBadges(3);
  check('the popup says where the model runs', /^Ready, on the /.test(await popup.locator('#status').innerText()));
  console.log('badges before scrolling:', JSON.stringify(first));
  check('the post and the two long comments in view have badges', !!first.t3_post && !!first.t1_one && !!first.t1_three);
  check('the short comment has none', first.t1_two === null);
  check('the comment far below has none yet', first.t1_four === null);
  check('the canned reply reads as AI', /^AI: /.test(first.t1_three ?? ''));
  check('the personal reply reads as human', /^Human: /.test(first.t1_one ?? ''));

  await page.locator('shreddit-comment[thingid="t1_four"]').scrollIntoViewIfNeeded();
  const second = await waitForBadges(4);
  console.log('badges after scrolling:', JSON.stringify(second));
  check('the comment far below has a badge after scrolling to it', !!second.t1_four);

  const hostLog = await log.locator('#log').innerText();
  console.log('--- host log ---');
  console.log(hostLog);
  const fromCache = hostLog.includes('model_quantized.onnx_data: 448471040 bytes from cache');
  check(cached ? 'the model came from the cache' : 'the model was downloaded', fromCache === cached);
  check('the scored text is the block alone, without the badge', !/AI: |Human: /.test(await page.locator('[slot="comment"]').first().innerText()));
} finally {
  await context.close();
  server.close();
}
process.exit(failed ? 1 : 0);
