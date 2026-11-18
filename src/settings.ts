import type { Backend } from './protocol';

/** One object of settings in extension storage, read with its defaults filled in. */
function stored<T extends object>(area: 'local' | 'sync', key: string, defaults: T) {
  const get = async (): Promise<T> => {
    const found = await browser.storage[area].get(key);
    return { ...defaults, ...(found[key] as Partial<T> | undefined) };
  };
  return {
    get,
    async save(change: Partial<T>): Promise<void> {
      await browser.storage[area].set({ [key]: { ...(await get()), ...change } });
    },
    /** Calls back with the settings now and after every change. */
    watch(listener: (settings: T) => void): void {
      void get().then(listener);
      browser.storage[area].onChanged.addListener((changes) => {
        if (key in changes) void get().then(listener);
      });
    },
  };
}

/**
 * How the model host runs. The background hands these to the host as a query string when
 * it starts it; a change applies to the next start.
 */
export interface HostSettings {
  /** `auto` tries WebGPU and falls back to WebAssembly; the other two run that backend only. */
  backend: 'auto' | Backend;
  /** Upper limit of WebAssembly threads; the machine's core count caps it too. */
  threads: number;
  /** True once the user has agreed to the model download. */
  modelAllowed: boolean;
}

export const hostSettings = stored<HostSettings>('local', 'host', {
  backend: 'auto',
  threads: 8,
  modelAllowed: false,
});

/** The settings as the query string of the host page, which hands it on to its worker. */
export function hostQuery(settings: HostSettings): string {
  const query = new URLSearchParams({ threads: String(settings.threads) });
  if (settings.backend !== 'auto') query.set('backend', settings.backend);
  if (settings.modelAllowed) query.set('model', 'allowed');
  return `?${query}`;
}

/** What the pages show. Synced with the user's browser profile. */
export interface DisplaySettings {
  /** Off: no page is scanned. */
  enabled: boolean;
  /** On: nothing is scored while the computer runs on battery. */
  onlyOnMains: boolean;
  /** Site name to off; a site that is not listed is on. */
  sitesOff: Record<string, boolean>;
  /** Badges for the scores between the human and the AI band as well. */
  showMiddle: boolean;
  /** Texts in another language are not scored: the model was trained on English. */
  englishOnly: boolean;
}

export const displaySettings = stored<DisplaySettings>('sync', 'display', {
  enabled: true,
  onlyOnMains: true,
  sitesOff: {},
  showMiddle: false,
  englishOnly: true,
});
