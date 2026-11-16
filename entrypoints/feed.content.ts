import type { Browser } from 'wxt/browser';
import { Scanner, type Link } from '@/src/content/scanner';
import {
  SCORE_PORT,
  type FromBackground,
  type FromHost,
  type HostState,
  type ToBackground,
  type ToHost,
} from '@/src/protocol';
import { type DisplaySettings, watchDisplaySettings } from '@/src/settings';
import { SITES, siteOf } from '@/src/sites';

/**
 * Runs on the listed sites: scans the page while the site is switched on, and keeps a port
 * to the model host while the tab is visible. A hidden tab lets go of the host, which
 * closes after a while with no tab connected.
 */
export default defineContentScript({
  matches: SITES.flatMap((site) => site.matches),
  main() {
    const found = siteOf(location.hostname);
    if (!found) return;
    const site = found;

    let settings: DisplaySettings | null = null;
    let state: HostState | null = null;
    let port: Browser.runtime.Port | null = null;
    let connecting = false;
    let scanner: Scanner | null = null;

    const post = (message: ToHost) => port?.postMessage(message);
    const link: Link = {
      score: (items) => post({ type: 'score', items }),
      cancel: (ids) => post({ type: 'cancel', ids }),
    };

    /** The site is switched on and somebody is looking at the tab. */
    const wanted = () => !!settings?.enabled && !settings.sitesOff[site.name] && !document.hidden;
    /** The host scores what it is sent, now or once the model has loaded. */
    const accepting = () => !!port && !!state && state.phase !== 'no-model' && state.phase !== 'error';

    function apply(): void {
      if (!scanner) return;
      scanner.accept(accepting());
      if (state?.phase === 'ready' && settings) scanner.display(state.bands, settings.showMiddle);
    }

    async function connect(): Promise<void> {
      if (port || connecting) return;
      connecting = true;
      try {
        const request: ToBackground = { type: 'ensure-host' };
        const answer: FromBackground = await browser.runtime.sendMessage(request);
        if (!answer.ok) throw new Error(answer.error);
        if (!wanted()) return;
        port = browser.runtime.connect({ name: SCORE_PORT });
        port.onMessage.addListener((message: FromHost) => {
          if (message.type === 'results') scanner?.results(message.results);
          else {
            state = message.state;
            apply();
          }
        });
        port.onDisconnect.addListener(() => {
          port = null;
          state = null;
          scanner?.release(false);
          apply();
        });
      } catch (error) {
        // The extension was reloaded or removed under this page: nothing left to talk to.
        console.warn('[slop detect] no model host:', error);
      } finally {
        connecting = false;
      }
    }

    function disconnect(): void {
      scanner?.release(true);
      port?.disconnect();
      port = null;
      state = null;
      apply();
    }

    function update(): void {
      const on = !!settings?.enabled && !settings.sitesOff[site.name];
      if (on && !scanner) {
        scanner = new Scanner(site, link);
        scanner.start();
      } else if (!on && scanner) {
        scanner.stop();
        scanner = null;
      }
      if (wanted()) void connect();
      else disconnect();
      apply();
    }

    watchDisplaySettings((next) => {
      settings = next;
      update();
    });
    document.addEventListener('visibilitychange', update);
  },
});
