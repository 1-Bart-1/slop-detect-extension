import workerUrl from '@/src/inference/worker.ts?worker&url';
import { follow, note } from '@/src/host/log';
import { watchPower } from '@/src/host/power';
import { Requests } from '@/src/host/requests';
import { describeState } from '@/src/host/state';
import { CACHE_NAME } from '@/src/inference/model';
import { type Port, post } from '@/src/ports';
import { type Power, type ScoringSettings, type Verdict, mayScore } from '@/src/power';
import {
  CONTROL_PORT,
  LOG_PORT,
  SCORE_PORT,
  type Control,
  type FromHost,
  type FromWorker,
  type HostState,
  type Item,
  type ScoreRequest,
  type ToHost,
} from '@/src/protocol';

/**
 * The model host: one worker with the model, shared by every tab. Content scripts open a
 * port here and send text blocks; the scores go back over the same port. The page is
 * Chrome's offscreen document, which has no extension API but messaging, or a frame in
 * Firefox's background page; its settings arrive in its URL, and the worker reads them
 * from there too. The settings that decide whether texts are scored come from the
 * background, and the worker runs only while they and the power source allow it.
 */

/** With no tab, popup or log page connected for this long the host closes and frees the model. */
const IDLE_MS = 5 * 60_000;

/** True once the user has agreed to the model download. */
let modelAllowed = new URLSearchParams(location.search).get('model') === 'allowed';
let state: HostState = { phase: modelAllowed ? 'preparing' : 'no-model' };
let worker: Worker | null = null;
/** What the tabs sent before the worker existed. */
let held: ScoreRequest[] = [];
const requests = new Requests<Port>(5000);
/** The tabs and pages that are told the host's state and verdict. */
const watchers = new Set<Port>();
/** Null until the background and the power source have reported. */
let settings: ScoringSettings | null = null;
let power: Power | null = null;
let verdict: Verdict | null = null;

function setState(next: HostState): void {
  // A download reports twenty times a second: one line when it starts is enough.
  if (next.phase !== 'loading' || state.phase !== 'loading') note(`host: ${describeState(next)}`);
  state = next;
  for (const port of watchers) post<FromHost>(port, { type: 'state', state });
}

function startWorker(): void {
  if (worker) return;
  worker = new Worker(workerUrl, { type: 'module', name: location.search });
  worker.onmessage = ({ data: message }: MessageEvent<FromWorker>) => {
    if (message.type === 'log') note(message.line);
    else if (message.type === 'state') setState(message.state);
    else for (const [port, results] of requests.settle(message.results)) post<FromHost>(port, { type: 'results', results });
  };
  worker.onerror = (event) => setState({ phase: 'error', message: event.message || 'the model worker stopped' });
  setState({ phase: 'preparing' });
  for (const message of held) worker.postMessage(message);
  held = [];
}

function stopWorker(): void {
  worker?.terminate();
  worker = null;
  requests.clear();
}

/** Starts or stops the worker after a change of the settings, the power source or the download permission. */
function decide(): void {
  if (!settings || !power) return;
  const next = mayScore(settings, power);
  if (next.scoring !== verdict?.scoring || next.batterySetting !== verdict.batterySetting) {
    verdict = next;
    note(`host: ${verdict.scoring}, power ${power}`);
    for (const port of watchers) post<FromHost>(port, { type: 'verdict', verdict });
  }
  if (verdict.scoring !== 'score') {
    if (state.phase === 'paused') return;
    stopWorker();
    held = [];
    setState({ phase: 'paused' });
  } else if (modelAllowed) startWorker();
  else if (state.phase !== 'no-model') setState({ phase: 'no-model' });
}

function toWorker(message: ScoreRequest): void {
  if (worker) worker.postMessage(message);
  else held.push(message);
}

function score(port: Port, items: Item[]): void {
  const { known, fresh } = requests.accept(port, items);
  note(`host: ${items.length} texts from a tab, ${known.length} already scored`);
  if (known.length) post<FromHost>(port, { type: 'results', results: known });
  if (fresh.length) toWorker({ type: 'score', items: fresh });
}

/** Drops a tab's unanswered texts: the ones with these ids, or all of them. */
function cancel(port: Port, ids?: number[]): void {
  const cancelled = requests.cancel(port, ids);
  if (cancelled.length) toWorker({ type: 'cancel', ids: cancelled });
}

async function control(message: Control): Promise<void> {
  if (message.type === 'download') {
    // After a failure this starts over with a new worker.
    if (state.phase === 'error') stopWorker();
    modelAllowed = true;
    decide();
    return;
  }
  stopWorker();
  held = [];
  modelAllowed = false;
  const deleted = await caches.delete(CACHE_NAME).catch(() => false);
  note(`host: model files ${deleted ? 'deleted' : 'were not in the cache'}`);
  setState({ phase: 'no-model' });
}

let connected = 0;
let idle: ReturnType<typeof setTimeout> | undefined;

function closeWhenIdle(): void {
  clearTimeout(idle);
  if (connected === 0) idle = setTimeout(close, IDLE_MS);
}

/** An offscreen document closes itself; a frame is taken out of the page that holds it. */
function close(): void {
  if (window.frameElement) window.frameElement.remove();
  else window.close();
}

function watch(port: Port): void {
  watchers.add(port);
  port.onDisconnect.addListener(() => watchers.delete(port));
  post<FromHost>(port, { type: 'state', state });
  if (verdict) post<FromHost>(port, { type: 'verdict', verdict });
}

browser.runtime.onConnect.addListener((port) => {
  connected++;
  closeWhenIdle();
  port.onDisconnect.addListener(() => {
    connected--;
    closeWhenIdle();
  });

  switch (port.name) {
    case SCORE_PORT:
      watch(port);
      port.onMessage.addListener((message: ScoreRequest) =>
        message.type === 'score' ? score(port, message.items) : cancel(port, message.ids),
      );
      port.onDisconnect.addListener(() => cancel(port));
      break;
    case CONTROL_PORT:
      watch(port);
      port.onMessage.addListener((message: Control) => void control(message));
      break;
    case LOG_PORT:
      follow(port);
      break;
  }
});

browser.runtime.onMessage.addListener((message: ToHost) => {
  if (message.type !== 'scoring') return;
  settings = message.settings;
  decide();
});
void watchPower((next) => {
  power = next;
  decide();
});

note(`host: started (${location.search || 'default settings'})`);
closeWhenIdle();
