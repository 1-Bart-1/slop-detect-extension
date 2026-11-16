import '@/src/ui/page.css';
import type { HostState } from '@/src/protocol';
import { type HostSettings, displaySettings, hostSettings } from '@/src/settings';
import { element } from '@/src/ui/dom';
import { controlHost } from '@/src/ui/host';

const showMiddle = element<HTMLInputElement>('show-middle');
const englishOnly = element<HTMLInputElement>('english-only');
const backend = element<HTMLSelectElement>('backend');
const threads = element<HTMLInputElement>('threads');
const status = element<HTMLParagraphElement>('status');
const remove = element<HTMLButtonElement>('delete');

/** Whether the model is on this computer, which is what the delete button is about. */
const PHASES: Record<HostState['phase'], string> = {
  'no-model': 'No model on this computer.',
  loading: 'The model is loading.',
  preparing: 'The model is being prepared.',
  ready: 'The model is downloaded and running.',
  error: 'The model failed to load; the log has the details.',
};

async function draw(): Promise<void> {
  const [display, host] = await Promise.all([displaySettings.get(), hostSettings.get()]);
  showMiddle.checked = display.showMiddle;
  englishOnly.checked = display.englishOnly;
  backend.value = host.backend;
  threads.value = String(host.threads);
}

const tellHost = controlHost((state) => {
  status.textContent = PHASES[state.phase];
  remove.disabled = state.phase === 'no-model';
});

showMiddle.addEventListener('change', () => void displaySettings.save({ showMiddle: showMiddle.checked }));
englishOnly.addEventListener('change', () => void displaySettings.save({ englishOnly: englishOnly.checked }));
backend.addEventListener('change', () => void hostSettings.save({ backend: backend.value as HostSettings['backend'] }));
threads.addEventListener('change', () => {
  const count = Math.min(32, Math.max(1, Math.round(Number(threads.value)) || 1));
  threads.value = String(count);
  void hostSettings.save({ threads: count });
});
remove.addEventListener('click', async () => {
  // Forgotten as well, so the model is not downloaded again without asking.
  await hostSettings.save({ modelAllowed: false });
  tellHost({ type: 'delete-model' });
});

void draw();
