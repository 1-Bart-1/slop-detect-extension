import { onlyEnglish } from '@/src/content/language';
import { type Link, Scanner } from '@/src/content/scanner';
import { type Port, connectHost, post } from '@/src/ports';
import { SCORE_PORT, type FromHost, type HostState, type Item, type ScoreRequest } from '@/src/protocol';
import { type DisplaySettings, displaySettings } from '@/src/settings';
import { SITES, siteOf } from '@/src/sites';
import type { Site } from '@/src/sites/types';

export default defineContentScript({
  matches: SITES.flatMap((site) => site.matches),
  main() {
    const site = siteOf(location.hostname);
    if (site) run(site);
  },
});

/**
 * Scans the page while the site is switched on, and keeps a port to the model host while
 * the tab is visible too. A hidden tab lets go of the host, which closes after a while
 * with no tab connected.
 */
function run(site: Site): void {
  let settings: DisplaySettings | null = null;
  let scanner: Scanner | null = null;
  let port: Port | null = null;
  let connecting = false;
  /** The host's state, while connected. */
  let state: HostState | null = null;

  /** The language setting the scanner was started with. */
  let englishOnly = true;

  const send = (request: ScoreRequest) => port && post(port, request);
  /** A text in another language is never sent, and stays without an answer. */
  async function score(items: Item[]): Promise<void> {
    const taken = englishOnly ? await onlyEnglish(items) : items;
    if (taken.length) send({ type: 'score', items: taken });
  }
  const link: Link = {
    score: (items) => void score(items),
    cancel: (ids) => send({ type: 'cancel', ids }),
  };

  const switchedOn = () => !!settings?.enabled && !settings.sitesOff[site.name];
  /** Switched on, and somebody is looking at the tab. */
  const wanted = () => switchedOn() && !document.hidden;

  /** Hands the scanner what the host says: whether it takes texts, and the thresholds. */
  function inform(): void {
    if (!scanner) return;
    // The host scores what it is sent, now or once the model has loaded.
    scanner.accept(!!state && state.phase !== 'no-model' && state.phase !== 'error' && state.phase !== 'paused');
    if (state?.phase === 'ready' && settings) scanner.display(state.bands, settings.showMiddle);
  }

  function onMessage(message: FromHost): void {
    if (message.type === 'results') return scanner?.results(message.results);
    if (message.type === 'verdict') return;
    state = message.state;
    // A paused host has dropped what it had from this page.
    if (state.phase === 'paused') scanner?.release();
    inform();
  }

  function onDisconnected(): void {
    port = null;
    state = null;
    scanner?.release();
    inform();
  }

  async function connect(): Promise<void> {
    if (port || connecting) return;
    connecting = true;
    try {
      port = await connectHost(SCORE_PORT, onMessage);
      port.onDisconnect.addListener(onDisconnected);
    } catch (error) {
      // The extension was reloaded or removed under this page: nothing left to talk to.
      console.warn('[slop detect] no model host:', error);
    } finally {
      connecting = false;
    }
    if (!wanted()) disconnect(); // the tab was hidden while the host started
  }

  function disconnect(): void {
    if (!port) return;
    port.disconnect();
    onDisconnected();
  }

  function update(): void {
    const on = switchedOn();
    if (scanner && settings && settings.englishOnly !== englishOnly) {
      // Other texts are wanted now: start over, the host still has the scores.
      scanner.stop();
      scanner = null;
    }
    if (on && !scanner) {
      englishOnly = settings!.englishOnly;
      scanner = new Scanner(site, link);
      scanner.start();
    } else if (!on && scanner) {
      scanner.stop();
      scanner = null;
    }
    if (wanted()) void connect();
    else disconnect();
    inform();
  }

  displaySettings.watch((next) => {
    settings = next;
    update();
  });
  document.addEventListener('visibilitychange', update);
}
