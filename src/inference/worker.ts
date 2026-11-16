/// <reference lib="webworker" />
import { Tokenizer } from '@huggingface/tokenizers';
import type { Backend, FromWorker, HostState, Item, ScoreRequest, Scored } from '@/src/protocol';
import { type Waiting, pad, takeBatch } from './batch';
import { loadModelFiles } from './files';
import { type Session, openSession } from './session';
import { modelInput } from './text';
import { describe, log } from './trace';

/**
 * The model's worker: loads the model once, then scores the texts the host sends, the
 * newest first. Its options are the host page's query string, passed as the worker's
 * name: ?backend=wasm or ?backend=webgpu runs that backend only, ?threads=2 caps the threads.
 */

const MAX_TOKENS = 512;
/** Shorter texts are outside what the model was trained on and are not scored. */
const MIN_TOKENS = 30;
/**
 * The most padded tokens in one run. A run takes about 20 ms plus 0.23 ms per token on
 * WebGPU and 2.4 ms per token on eight WebAssembly threads (RFC 015 F6): these keep it
 * near 250 and 600 ms, so the texts the reader scrolls to next do not wait long.
 */
const PADDED_TOKENS: Record<Backend, number> = { webgpu: 1024, wasm: 256 };

const options = new URLSearchParams(self.name);

const post = (message: FromWorker) => self.postMessage(message);
const setState = (state: HostState) => post({ type: 'state', state });

/** A text that is waiting for the model, with what its answer needs. */
interface Text extends Waiting {
  tokens: number;
}

/** The loaded model. */
interface Scorer {
  session: Session;
  padId: number;
  /** The token ids of a text, cut to the model's window, and how many it had before the cut. */
  encode(text: string): { ids: number[]; tokens: number };
}

/** Oldest first. */
const queue: Text[] = [];

async function load(): Promise<Scorer> {
  const wanted = Number(options.get('threads')) || 8;
  const threads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 1, wanted) : 1;
  log(
    `start: crossOriginIsolated=${self.crossOriginIsolated},`,
    `hardwareConcurrency=${navigator.hardwareConcurrency}, threads=${threads},`,
    `navigator.gpu=${'gpu' in navigator}`,
  );

  const files = await loadModelFiles((loaded, total, cached) => setState({ phase: 'loading', loaded, total, cached }));
  log('model files loaded', files.bands);
  setState({ phase: 'preparing' });

  const tokenizer = new Tokenizer(files.tokenizer, files.tokenizerConfig);
  // An empty text is its special tokens alone: one <|endoftext|>, which is the padding token too.
  const special = tokenizer.encode('').ids;
  const padId = special[0] ?? 0;

  const started = performance.now();
  const session = await openSession(files.model, {
    only: options.get('backend'),
    threads,
    warmUp: pad([{ id: -1, ids: new Array<number>(MIN_TOKENS).fill(padId) }], padId),
  });
  log(`session created on ${session.backend} in ${Math.round(performance.now() - started)} ms`);
  setState({ phase: 'ready', bands: files.bands, backend: session.backend, threads });

  return {
    session,
    padId,
    encode(text) {
      const ids = tokenizer.encode(modelInput(text)).ids;
      // The only special token is the leading <|endoftext|>, so plain truncation
      // matches what the Python tokenizer does with max_length=512.
      return { ids: ids.slice(0, MAX_TOKENS), tokens: ids.length - special.length };
    },
  };
}

/** Tokenizes new texts: the short ones are answered at once, the rest wait for the model. */
function accept(scorer: Scorer, items: Item[]): void {
  const short: Scored[] = [];
  for (const { id, text } of items) {
    const { ids, tokens } = scorer.encode(text);
    if (tokens < MIN_TOKENS) short.push({ id, tokens, score: null });
    else queue.push({ id, tokens, ids });
  }
  if (short.length) post({ type: 'results', results: short });
}

let running = false;

/** Runs batches until nothing waits. New texts and cancellations arrive between two runs. */
async function drain({ session, padId }: Scorer): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const batch = takeBatch(queue, PADDED_TOKENS[session.backend]);
      if (!batch.length) break;
      const started = performance.now();
      const padded = pad(batch, padId);
      const logits = await session.run(padded);
      const results = batch.map(({ id, tokens }, row) => ({ id, tokens, score: 1 / (1 + Math.exp(-logits[row]!)) }));
      log(
        `scored ${batch.length} texts, ${padded.rows * padded.length} padded tokens,`,
        `in ${Math.round(performance.now() - started)} ms; ${queue.length} waiting;`,
        `scores ${results.map((result) => result.score.toFixed(2)).join(' ')}`,
      );
      post({ type: 'results', results });
    }
  } finally {
    running = false;
  }
}

function cancel(ids: number[]): void {
  const cancelled = new Set(ids);
  for (let i = queue.length - 1; i >= 0; i--) if (cancelled.has(queue[i]!.id)) queue.splice(i, 1);
}

const loaded = load();
loaded.catch((error) => {
  console.error('[slop] loading failed', error);
  setState({ phase: 'error', message: describe(error) });
});

self.onmessage = ({ data: message }: MessageEvent<ScoreRequest>) => {
  // After loading, and so in the order the messages came: a cancel follows its score.
  loaded
    .then((scorer) => {
      if (message.type === 'cancel') return cancel(message.ids);
      accept(scorer, message.items);
      return drain(scorer);
    })
    .catch((error) => setState({ phase: 'error', message: describe(error) }));
};
