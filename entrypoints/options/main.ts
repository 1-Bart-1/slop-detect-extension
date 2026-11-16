import '@/src/ui/page.css';
import type { Control, HostState } from '@/src/protocol';
import {
  type HostSettings,
  displaySettings,
  hostSettings,
  saveDisplaySettings,
  saveHostSettings,
} from '@/src/settings';
import { connectHost } from '@/src/ui/host';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const showMiddle = element<HTMLInputElement>('show-middle');
const backend = element<HTMLSelectElement>('backend');
const threads = element<HTMLInputElement>('threads');
const status = element<HTMLParagraphElement>('status');
const remove = element<HTMLButtonElement>('delete');

async function draw(): Promise<void> {
  const [display, host] = await Promise.all([displaySettings(), hostSettings()]);
  showMiddle.checked = display.showMiddle;
  backend.value = host.backend;
  threads.value = String(host.threads);
}

showMiddle.addEventListener('change', () => void saveDisplaySettings({ showMiddle: showMiddle.checked }));
backend.addEventListener('change', () => void saveHostSettings({ backend: backend.value as HostSettings['backend'] }));
threads.addEventListener('change', () => {
  const count = Math.min(32, Math.max(1, Math.round(Number(threads.value)) || 1));
  threads.value = String(count);
  void saveHostSettings({ threads: count });
});

const PHASES: Record<HostState['phase'], string> = {
  'no-model': 'No model on this computer.',
  loading: 'The model is loading.',
  preparing: 'The model is being prepared.',
  ready: 'The model is downloaded and running.',
  error: 'The model failed to load; the log has the details.',
};

let send: ((message: Control) => void) | null = null;

remove.addEventListener('click', async () => {
  // Forgotten as well, so the model is not downloaded again without asking.
  await saveHostSettings({ modelAllowed: false });
  send?.({ type: 'delete-model' });
});

void draw();
connectHost((state) => {
  status.textContent = PHASES[state.phase];
  remove.disabled = state.phase === 'no-model';
}).then(
  (connected) => (send = connected),
  (error) => (status.textContent = `The model host did not start: ${error}`),
);
