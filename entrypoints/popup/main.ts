import '@/src/ui/page.css';
import type { Control, HostState } from '@/src/protocol';
import { displaySettings, saveDisplaySettings, saveHostSettings } from '@/src/settings';
import { SITES } from '@/src/sites';
import { connectHost } from '@/src/ui/host';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const enabled = element<HTMLInputElement>('enabled');
const sites = element<HTMLDivElement>('sites');
const status = element<HTMLParagraphElement>('status');
const progress = element<HTMLProgressElement>('progress');
const download = element<HTMLButtonElement>('download');
const downloadNote = element<HTMLParagraphElement>('download-note');

// --- Switches ---

async function drawSwitches(): Promise<void> {
  const settings = await displaySettings();
  enabled.checked = settings.enabled;
  sites.replaceChildren(
    ...SITES.map((site) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !settings.sitesOff[site.name];
      box.disabled = !settings.enabled;
      box.addEventListener('change', async () => {
        const current = await displaySettings();
        await saveDisplaySettings({ sitesOff: { ...current.sitesOff, [site.name]: !box.checked } });
      });
      const label = document.createElement('label');
      label.className = 'indent';
      label.append(box, site.label);
      return label;
    }),
  );
}

enabled.addEventListener('change', async () => {
  await saveDisplaySettings({ enabled: enabled.checked });
  await drawSwitches();
});

// --- Model ---

const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

function describe(state: HostState): string {
  switch (state.phase) {
    case 'no-model':
      return 'Not downloaded yet.';
    case 'loading':
      return state.cached
        ? 'Reading the model from disk'
        : `Downloading: ${megabytes(state.loaded)} of ${megabytes(state.total)}`;
    case 'preparing':
      return 'Preparing the model';
    case 'ready':
      return state.backend === 'webgpu'
        ? 'Ready, on the GPU (WebGPU).'
        : `Ready, on the CPU (WebAssembly, ${state.threads} threads). Slower than a GPU.`;
    case 'error':
      return `Failed: ${state.message}`;
  }
}

function drawState(state: HostState): void {
  status.textContent = describe(state);
  status.classList.toggle('error', state.phase === 'error');
  progress.hidden = state.phase !== 'loading';
  if (state.phase === 'loading') progress.value = state.total ? state.loaded / state.total : 0;
  download.hidden = state.phase !== 'no-model' && state.phase !== 'error';
  download.textContent = state.phase === 'error' ? 'Try again' : 'Download model (450 MB)';
  downloadNote.hidden = state.phase !== 'no-model';
}

let send: ((message: Control) => void) | null = null;

download.addEventListener('click', async () => {
  // Remembered, so the next start of the host loads the model without asking.
  await saveHostSettings({ modelAllowed: true });
  send?.({ type: 'download' });
});

// --- Links ---

element('open-log').addEventListener('click', () => void browser.tabs.create({ url: browser.runtime.getURL('/log.html') }));
element('open-options').addEventListener('click', () => void browser.runtime.openOptionsPage());

void drawSwitches();
connectHost(drawState).then(
  (connected) => (send = connected),
  (error) => drawState({ phase: 'error', message: String(error) }),
);
