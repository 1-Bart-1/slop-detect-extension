import type { Browser } from 'wxt/browser';
import workerUrl from '@/src/inference/worker.ts?worker&url';
import { ScoreCache } from '@/src/host/cache';
import { CACHE_NAME } from '@/src/inference/model';
import {
  CONTROL_PORT,
  LOG_PORT,
  SCORE_PORT,
  type Control,
  type FromHost,
  type FromWorker,
  type HostState,
  type LogLines,
  type Scored,
  type StateMessage,
  type ToHost,
  type ToWorker,
} from '@/src/protocol';

/**
 * The model host: one worker with the model, shared by every tab. Content scripts open a
 * port here and send text blocks; the scores go back over the same port. An offscreen
 * document has no extension API but messaging, so its settings arrive in its URL.
 */

type Port = Browser.runtime.Port;

/** With no tab, popup or log page connected for this long the host closes and frees the model. */
const IDLE_MS = 5 * 60_000;
const LOG_LINES = 2000;

const query = new URLSearchParams(location.search);

let state: HostState = { phase: 'no-model' };
let worker: Worker | null = null;
/** What the tabs sent before the worker existed. */
let held: ToWorker[] = [];

/** A text in the worker: which tab asked, under which of its ids. */
interface Pending {
  port: Port;
  id: number;
  text: string;
}
const pending = new Map<number, Pending>();
let nextId = 0;
const scores = new ScoreCache<Omit<Scored, 'id'>>(5000);

const scorers = new Set<Port>();
const controls = new Set<Port>();
const readers = new Set<Port>();

// --- Log ---

const lines: string[] = [];
const clock = () => new Date().toLocaleTimeString('en-GB');

/** One line of the log the user reads on the log page. Lost when the host closes. */
function note(line: string): void {
  const stamped = `${clock()} ${line}`;
  lines.push(stamped);
  if (lines.length > LOG_LINES) lines.shift();
  const message: LogLines = { type: 'lines', lines: [stamped] };
  for (const reader of readers) reader.postMessage(message);
}

// --- State ---

function setState(next: HostState): void {
  // A download reports twenty times a second: one line when it starts is enough.
  if (next.phase !== 'loading' || state.phase !== 'loading') note(`host: ${describe(next)}`);
  state = next;
  const message: StateMessage = { type: 'state', state };
  for (const port of [...scorers, ...controls]) port.postMessage(message);
}

function describe(next: HostState): string {
  switch (next.phase) {
    case 'no-model':
      return 'waiting for the model download to be allowed';
    case 'loading':
      return next.cached ? 'reading the model from the cache' : 'downloading the model';
    case 'preparing':
      return 'preparing the model';
    case 'ready':
      return `ready on ${next.backend === 'webgpu' ? 'the GPU (WebGPU)' : `the CPU (WebAssembly, ${next.threads} threads)`}`;
    case 'error':
      return `failed: ${next.message}`;
  }
}

// --- Worker ---

function startWorker(): void {
  if (worker) return;
  worker = new Worker(workerUrl, { type: 'module', name: location.search });
  worker.onmessage = (event: MessageEvent<FromWorker>) => onWorkerMessage(event.data);
  worker.onerror = (event) => setState({ phase: 'error', message: event.message || 'the model worker stopped' });
  setState({ phase: 'preparing' });
  for (const message of held) worker.postMessage(message);
  held = [];
}

function stopWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
  scores.clear();
}

function toWorker(message: ToWorker): void {
  if (worker) worker.postMessage(message);
  else held.push(message);
}

function onWorkerMessage(message: FromWorker): void {
  switch (message.type) {
    case 'log':
      note(message.line);
      break;
    case 'progress':
      setState({ phase: 'loading', loaded: message.loaded, total: message.total, cached: message.cached });
      break;
    case 'compiling':
      setState({ phase: 'preparing' });
      break;
    case 'ready':
      setState({ phase: 'ready', bands: message.bands, backend: message.backend, threads: message.threads });
      break;
    case 'error':
      setState({ phase: 'error', message: message.message });
      break;
    case 'results':
      deliver(message.results);
      break;
  }
}

/** Sends the worker's scores to the tabs that asked, and remembers them. */
function deliver(results: Scored[]): void {
  const replies = new Map<Port, Scored[]>();
  for (const { id, tokens, score } of results) {
    const origin = pending.get(id);
    if (!origin) continue; // cancelled, or the tab is gone
    pending.delete(id);
    scores.set(origin.text, { tokens, score });
    const reply = replies.get(origin.port) ?? [];
    reply.push({ id: origin.id, tokens, score });
    replies.set(origin.port, reply);
  }
  for (const [port, reply] of replies) send(port, { type: 'results', results: reply });
}

const send = (port: Port, message: FromHost) => port.postMessage(message);

// --- Tabs ---

function onTabMessage(port: Port, message: ToHost): void {
  if (message.type === 'cancel') {
    const cancelled = new Set(message.ids);
    const ids = [...pending].filter(([, origin]) => origin.port === port && cancelled.has(origin.id)).map(([id]) => id);
    for (const id of ids) pending.delete(id);
    if (ids.length) toWorker({ type: 'cancel', ids });
    return;
  }

  const known: Scored[] = [];
  const request: ToWorker = { type: 'score', items: [] };
  for (const { id, text } of message.items) {
    const hit = scores.get(text);
    if (hit) {
      known.push({ id, ...hit });
      continue;
    }
    pending.set(nextId, { port, id, text });
    request.items.push({ id: nextId++, text });
  }
  note(`host: ${message.items.length} texts from a tab, ${known.length} already scored`);
  if (known.length) send(port, { type: 'results', results: known });
  if (request.items.length) toWorker(request);
}

function forget(port: Port): void {
  const ids = [...pending].filter(([, origin]) => origin.port === port).map(([id]) => id);
  for (const id of ids) pending.delete(id);
  if (ids.length) toWorker({ type: 'cancel', ids });
}

// --- Popup and options ---

async function onControl(message: Control): Promise<void> {
  if (message.type === 'download') {
    // After a failure this starts over with a new worker.
    if (state.phase === 'error') stopWorker();
    startWorker();
    return;
  }
  stopWorker();
  held = [];
  const deleted = await caches.delete(CACHE_NAME).catch(() => false);
  note(`host: model files ${deleted ? 'deleted' : 'were not in the cache'}`);
  setState({ phase: 'no-model' });
}

// --- Ports ---

let idle: ReturnType<typeof setTimeout> | undefined;

/** Closes the host once nothing has been connected to it for a while. */
function watchIdle(): void {
  clearTimeout(idle);
  if (scorers.size + controls.size + readers.size > 0) return;
  idle = setTimeout(() => window.close(), IDLE_MS);
}

function track(ports: Set<Port>, port: Port, onGone?: () => void): void {
  ports.add(port);
  watchIdle();
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    onGone?.();
    watchIdle();
  });
}

browser.runtime.onConnect.addListener((port) => {
  const current: StateMessage = { type: 'state', state };
  switch (port.name) {
    case SCORE_PORT:
      track(scorers, port, () => forget(port));
      port.postMessage(current);
      port.onMessage.addListener((message: ToHost) => onTabMessage(port, message));
      break;
    case CONTROL_PORT:
      track(controls, port);
      port.postMessage(current);
      port.onMessage.addListener((message: Control) => void onControl(message));
      break;
    case LOG_PORT: {
      track(readers, port);
      const backlog: LogLines = { type: 'lines', lines };
      port.postMessage(backlog);
      break;
    }
  }
});

note(`host: started (${location.search || 'default settings'})`);
if (query.get('model') === 'allowed') startWorker();
else setState({ phase: 'no-model' });
watchIdle();
