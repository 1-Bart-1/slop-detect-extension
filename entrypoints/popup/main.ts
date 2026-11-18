import '@/src/ui/page.css';
import { describeState } from '@/src/host/state';
import { type Verdict, describeVerdict } from '@/src/power';
import type { HostState } from '@/src/protocol';
import { type DisplaySettings, displaySettings, hostSettings } from '@/src/settings';
import { SITES } from '@/src/sites';
import { element } from '@/src/ui/dom';
import { controlHost } from '@/src/ui/host';

const enabled = element<HTMLInputElement>('enabled');
const sites = element<HTMLDivElement>('sites');
const onlyOnMains = element<HTMLInputElement>('only-on-mains');
const verdictNote = element<HTMLParagraphElement>('verdict');
const status = element<HTMLParagraphElement>('status');
const progress = element<HTMLProgressElement>('progress');
const download = element<HTMLButtonElement>('download');
const downloadNote = element<HTMLParagraphElement>('download-note');

function drawSwitches(settings: DisplaySettings): void {
  enabled.checked = settings.enabled;
  onlyOnMains.checked = settings.onlyOnMains;
  onlyOnMains.disabled = !settings.enabled;
  sites.replaceChildren(
    ...SITES.map((site) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !settings.sitesOff[site.name];
      box.disabled = !settings.enabled;
      box.addEventListener('change', async () => {
        const current = await displaySettings.get();
        await displaySettings.save({ sitesOff: { ...current.sitesOff, [site.name]: !box.checked } });
      });
      const label = document.createElement('label');
      label.className = 'indent';
      label.append(box, site.label);
      return label;
    }),
  );
}

function drawState(state: HostState): void {
  status.textContent = describeState(state);
  status.classList.toggle('error', state.phase === 'error');
  progress.hidden = state.phase !== 'loading';
  if (state.phase === 'loading') progress.value = state.total ? state.loaded / state.total : 0;
  download.hidden = state.phase !== 'no-model' && state.phase !== 'error';
  download.textContent = state.phase === 'error' ? 'Try again' : 'Download model (450 MB)';
  downloadNote.hidden = state.phase !== 'no-model';
}

function drawVerdict(verdict: Verdict): void {
  verdictNote.textContent = describeVerdict(verdict);
  verdictNote.hidden = !verdictNote.textContent;
}

const tellHost = controlHost(drawState, drawVerdict);

enabled.addEventListener('change', () => void displaySettings.save({ enabled: enabled.checked }));
onlyOnMains.addEventListener('change', () => void displaySettings.save({ onlyOnMains: onlyOnMains.checked }));
download.addEventListener('click', async () => {
  // Remembered, so the next start of the host loads the model without asking.
  await hostSettings.save({ modelAllowed: true });
  tellHost({ type: 'download' });
});
element('open-log').addEventListener('click', () => void browser.tabs.create({ url: browser.runtime.getURL('/log.html') }));
element('open-options').addEventListener('click', () => void browser.runtime.openOptionsPage());

// The shortcut flips the master switch while the popup may be open.
displaySettings.watch(drawSwitches);
