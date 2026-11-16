import type { Backend } from './protocol';

/**
 * How the model host runs. The host is an offscreen document and cannot read storage, so
 * the background hands it these in its URL when it starts; a change applies to the next start.
 */
export interface HostSettings {
  /** `auto` tries WebGPU and falls back to WebAssembly; the other two run that backend only. */
  backend: 'auto' | Backend;
  /** Upper limit of WebAssembly threads; the machine's core count caps it too. */
  threads: number;
  /** True once the user has agreed to the model download. */
  modelAllowed: boolean;
}

const HOST_KEY = 'host';
const HOST_DEFAULTS: HostSettings = { backend: 'auto', threads: 8, modelAllowed: false };

export async function hostSettings(): Promise<HostSettings> {
  const stored = await browser.storage.local.get(HOST_KEY);
  return { ...HOST_DEFAULTS, ...(stored[HOST_KEY] as Partial<HostSettings> | undefined) };
}

export async function saveHostSettings(change: Partial<HostSettings>): Promise<void> {
  await browser.storage.local.set({ [HOST_KEY]: { ...(await hostSettings()), ...change } });
}

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
  /** Site name to off; a site that is not listed is on. */
  sitesOff: Record<string, boolean>;
  /** Badges for the scores between the human and the AI band as well. */
  showMiddle: boolean;
}

const DISPLAY_KEY = 'display';
const DISPLAY_DEFAULTS: DisplaySettings = { enabled: true, sitesOff: {}, showMiddle: false };

export async function displaySettings(): Promise<DisplaySettings> {
  const stored = await browser.storage.sync.get(DISPLAY_KEY);
  return { ...DISPLAY_DEFAULTS, ...(stored[DISPLAY_KEY] as Partial<DisplaySettings> | undefined) };
}

export async function saveDisplaySettings(change: Partial<DisplaySettings>): Promise<void> {
  await browser.storage.sync.set({ [DISPLAY_KEY]: { ...(await displaySettings()), ...change } });
}

/** Calls back with the display settings now and after every change. */
export function watchDisplaySettings(listener: (settings: DisplaySettings) => void): void {
  void displaySettings().then(listener);
  browser.storage.sync.onChanged.addListener((changes) => {
    if (DISPLAY_KEY in changes) void displaySettings().then(listener);
  });
}
