import '@/src/ui/page.css';
import { describeState } from '@/src/host/state';
import type { HostState } from '@/src/protocol';
import { hostSettings } from '@/src/settings';
import { SITES } from '@/src/sites';
import { element } from '@/src/ui/dom';
import { controlHost } from '@/src/ui/host';

const status = element<HTMLParagraphElement>('status');
const progress = element<HTMLProgressElement>('progress');
const download = element<HTMLButtonElement>('download');
const readyNote = element<HTMLParagraphElement>('ready-note');

element('sites').textContent = new Intl.ListFormat('en', { type: 'conjunction' }).format(
  SITES.map((site) => site.label),
);

function drawState(state: HostState): void {
  status.textContent = describeState(state);
  status.classList.toggle('error', state.phase === 'error');
  progress.hidden = state.phase !== 'loading';
  if (state.phase === 'loading') progress.value = state.total ? state.loaded / state.total : 0;
  download.hidden = state.phase !== 'no-model' && state.phase !== 'error';
  download.textContent = state.phase === 'error' ? 'Try again' : 'Download model (450 MB)';
  readyNote.hidden = state.phase !== 'ready';
}

const tellHost = controlHost(drawState);

download.addEventListener('click', async () => {
  // Remembered, so the next start of the host loads the model without asking.
  await hostSettings.save({ modelAllowed: true });
  tellHost({ type: 'download' });
});
element('open-options').addEventListener('click', () => void browser.runtime.openOptionsPage());
