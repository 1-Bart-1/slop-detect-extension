import { TOGGLE_COMMAND, type FromBackground, type ToBackground, type ToHost } from '@/src/protocol';
import { type DisplaySettings, displaySettings, hostQuery, hostSettings } from '@/src/settings';

/** The page that hosts the model. There is one per extension. */
const HOST_PAGE = '/host.html';

/** Where the host page runs: whether it is open, and how to open it at a URL. */
interface HostPlace {
  isOpen(): Promise<boolean>;
  open(url: string): Promise<void>;
}

/** Chrome's service worker cannot start a worker: the host is an offscreen document. */
const offscreen: HostPlace = {
  isOpen: async () =>
    (await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0,
  open: (url) =>
    browser.offscreen.createDocument({
      url,
      reasons: ['WORKERS'],
      justification: 'Runs the detection model in a worker, on the GPU or on several threads.',
    }),
};

/** Firefox's background page is persistent and has a DOM: the host is a frame in it. */
const frame: HostPlace = {
  isOpen: async () => document.querySelector(`iframe[src^="${HOST_PAGE}"]`) !== null,
  open: (url) =>
    new Promise((resolve) => {
      const host = document.createElement('iframe');
      host.addEventListener('load', () => resolve(), { once: true });
      host.src = url;
      document.body.append(host);
    }),
};

/** Hands the host the settings that decide whether it scores; without a host it goes nowhere. */
function sendScoringSettings({ enabled, onlyOnMains }: DisplaySettings): Promise<void> {
  const message: ToHost = { type: 'scoring', settings: { enabled, onlyOnMains } };
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

export default defineBackground(() => {
  const place = import.meta.env.FIREFOX ? frame : offscreen;
  /** Set while the host is being looked for or opened: two tabs can ask at the same moment. */
  let opening: Promise<void> | null = null;

  async function openUnlessOpen(): Promise<void> {
    if (await place.isOpen()) return;
    await place.open(HOST_PAGE + hostQuery(await hostSettings.get()));
    await sendScoringSettings(await displaySettings.get());
  }

  function ensureHost(): Promise<void> {
    opening ??= openUnlessOpen().finally(() => (opening = null));
    return opening;
  }

  // Nothing is scored before the model is downloaded, and the download needs a click:
  // a new install opens the page that asks for it.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });

  displaySettings.watch((settings) => void sendScoringSettings(settings));
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== TOGGLE_COMMAND) return;
    const { enabled } = await displaySettings.get();
    await displaySettings.save({ enabled: !enabled });
  });

  browser.runtime.onMessage.addListener((message: ToBackground, _sender, respond: (answer: FromBackground) => void) => {
    if (message.type !== 'ensure-host') return;
    ensureHost().then(
      () => respond({ ok: true }),
      (error) => respond({ ok: false, error: String(error) }),
    );
    return true; // the answer comes later
  });
});
