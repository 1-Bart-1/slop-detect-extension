/// <reference lib="webworker" />
import type * as Ort from 'onnxruntime-web';
import { Tokenizer } from '@huggingface/tokenizers';
// ONNX Runtime's own loaders and binaries, emitted as separate files of the package. Its
// thread workers must start from the loader, not from this bundled script: if they load
// this file they run init() again and replace the runtime's message handler, and session
// creation never returns. The WebGPU build of the runtime has its own pair (asyncify);
// the plain pair is half the size and CPU only.
import wasmLoaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import gpuLoaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import gpuBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { Backend, FromWorker, Item, Scored, ToWorker } from '@/src/protocol';
import { type Waiting, pad, takeBatch } from './batch';
import { type Model, loadModelFiles } from './files';
import { WEIGHTS_NAME } from './model';
import { modelInput } from './text';
import { describe, log } from './trace';

const MAX_TOKENS = 512;
/** Shorter texts are outside what the model was trained on and are not scored. */
const MIN_TOKENS = 30;
/**
 * The most padded tokens in one run. A run takes about 20 ms plus 0.23 ms per token on
 * WebGPU and 2.4 ms per token on eight WebAssembly threads (RFC 015 F6): these keep it
 * near 250 and 600 ms, so the texts the reader scrolls to next do not wait long.
 */
const PADDED_TOKENS: Record<Backend, number> = { webgpu: 1024, wasm: 256 };

const post = (message: FromWorker) => self.postMessage(message);

/**
 * The host page's query string, which it passes as the worker's name. For testing:
 * ?backend=wasm or ?backend=webgpu runs that backend only, ?threads=2 caps the threads.
 */
const options = new URLSearchParams(self.name);

let tokenizer: Tokenizer;
/** The runtime build of the backend in use; the two builds are loaded on demand. */
let ort: typeof Ort;
let session: Ort.InferenceSession;
/** How many special tokens the tokenizer adds to every text. */
let specialTokens = 0;
/** The token that fills a batch's shorter rows. */
let padId = 0;
let active: Backend;

/** A text that is waiting for the model, with what its answer needs. */
interface Text extends Waiting {
  tokens: number;
}

/** Oldest first. Filled while the model loads too. */
const queue: Text[] = [];

function halfToNumber(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const fraction = half & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/** The values of a float tensor. The q8 graph may emit float16 logits. */
function values(tensor: Ort.Tensor): number[] {
  const data = tensor.data as ArrayLike<number | bigint>;
  // Older runtimes hand float16 back as raw bits in a Uint16Array.
  if (tensor.type === 'float16' && data instanceof Uint16Array) return Array.from(data, halfToNumber);
  return Array.from(data, Number);
}

/** One forward pass over a batch; the logit of each text, in the batch's order. */
async function infer(batch: Waiting[]): Promise<number[]> {
  const { ids, mask, rows, length } = pad(batch, padId);
  const output = await session.run({
    input_ids: new ort.Tensor('int64', ids, [rows, length]),
    attention_mask: new ort.Tensor('int64', mask, [rows, length]),
  });
  const logits = output.logits;
  if (!logits) throw new Error(`the model has no logits output, only ${Object.keys(output).join(', ')}`);
  const out = values(logits);
  if (out.length !== rows) throw new Error(`${out.length} logits for ${rows} texts`);
  return out;
}

/** True when the browser offers a hardware WebGPU adapter. */
async function hasGpu(): Promise<boolean> {
  type Adapter = { info?: { isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean };
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  // A fallback adapter is a software rasteriser: far slower than WebAssembly.
  return !!adapter && !(adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter);
}

/** Loads the runtime build of one backend and creates the session on it. */
async function createSession(backend: Backend, model: Model, threads: number): Promise<void> {
  if (backend === 'webgpu') {
    ort = await import('onnxruntime-web/webgpu');
    ort.env.wasm.wasmPaths = { mjs: gpuLoaderUrl, wasm: gpuBinaryUrl };
  } else {
    ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = { mjs: wasmLoaderUrl, wasm: wasmBinaryUrl };
  }
  // The GPU does the work on WebGPU: one thread, so no shared memory or thread workers.
  ort.env.wasm.numThreads = backend === 'webgpu' ? 1 : threads;
  // The runtime's warnings and errors go to the log; its info level is 200 lines per start.
  ort.env.logLevel = 'warning';
  session = await ort.InferenceSession.create(model.graph, {
    externalData: [{ path: WEIGHTS_NAME, data: model.weights }],
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 2,
  });
  if (backend === 'webgpu') {
    // Compiles the shaders before the first real text, and proves the GPU path runs:
    // a driver that fails here sends us to WebAssembly instead of failing on the user.
    try {
      const [logit] = await infer([{ id: -1, ids: new Array<number>(MIN_TOKENS).fill(padId) }]);
      if (!Number.isFinite(logit)) throw new Error(`warm-up returned ${logit}`);
    } catch (error) {
      // Frees the model's copy in this runtime's heap and its GPU buffers. The
      // WebAssembly fallback is a second runtime and loads the model again.
      await session.release().catch(() => undefined);
      throw error;
    }
  }
}

/**
 * WebGPU when the browser has a real adapter, WebAssembly otherwise. One backend
 * at a time: given a list, the runtime falls back silently and does not say which
 * provider it picked.
 */
async function createSessionOnBestBackend(model: Model, threads: number): Promise<Backend> {
  const forced = options.get('backend');
  if (forced === 'wasm') {
    log('webgpu: skipped, ?backend=wasm');
  } else if (await hasGpu()) {
    try {
      await createSession('webgpu', model, threads);
      return 'webgpu';
    } catch (error) {
      if (forced === 'webgpu') throw error;
      log('webgpu: failed, falling back to wasm:', describe(error));
    }
  } else {
    log('webgpu: no hardware adapter');
  }
  await createSession('wasm', model, threads);
  return 'wasm';
}

/** Tokenizes new texts: the short ones are answered at once, the rest wait for the model. */
function accept(items: Item[]): void {
  const short: Scored[] = [];
  for (const { id, text } of items) {
    const all = tokenizer.encode(modelInput(text)).ids;
    const tokens = all.length - specialTokens;
    // The only special token is the leading <|endoftext|>, so plain truncation
    // matches what the Python tokenizer does with max_length=512.
    if (tokens < MIN_TOKENS) short.push({ id, tokens, score: null });
    else queue.push({ id, tokens, ids: all.slice(0, MAX_TOKENS) });
  }
  if (short.length) post({ type: 'results', results: short });
}

let running = false;

/** Runs batches until nothing waits. New texts and cancellations arrive between two runs. */
async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const batch = takeBatch(queue, PADDED_TOKENS[active]);
      if (!batch.length) break;
      const started = performance.now();
      const logits = await infer(batch);
      const longest = Math.max(...batch.map((text) => text.ids.length));
      const results = batch.map(({ id, tokens }, row) => ({ id, tokens, score: 1 / (1 + Math.exp(-logits[row]!)) }));
      log(
        `scored ${batch.length} texts, ${batch.length * longest} padded tokens,`,
        `in ${Math.round(performance.now() - started)} ms; ${queue.length} waiting;`,
        `scores ${results.map((result) => result.score.toFixed(2)).join(' ')}`,
      );
      post({ type: 'results', results });
    }
  } finally {
    running = false;
  }
}

async function init(): Promise<void> {
  const wanted = Number(options.get('threads')) || 8;
  const threads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 1, wanted) : 1;
  log(
    `start: crossOriginIsolated=${self.crossOriginIsolated},`,
    `hardwareConcurrency=${navigator.hardwareConcurrency}, threads=${threads},`,
    `navigator.gpu=${'gpu' in navigator}`,
  );

  const files = await loadModelFiles((loaded, total, cached) => post({ type: 'progress', loaded, total, cached }));
  log('model files loaded', files.bands);

  post({ type: 'compiling' });
  tokenizer = new Tokenizer(files.tokenizer, files.tokenizerConfig);
  // An empty text is its special tokens alone: one <|endoftext|>, which is the padding token too.
  const empty = tokenizer.encode('').ids;
  specialTokens = empty.length;
  padId = empty[0] ?? 0;
  const sessionStart = performance.now();
  active = await createSessionOnBestBackend(files.model, threads);
  log(
    `session created on ${active} in ${Math.round(performance.now() - sessionStart)} ms;`,
    `inputs ${session.inputNames.join(', ')}; outputs ${session.outputNames.join(', ')}`,
  );

  post({ type: 'ready', bands: files.bands, backend: active, threads });
}

const ready = init();
ready.catch((error) => {
  console.error('[slop] loading failed', error);
  post({ type: 'error', message: describe(error) });
});

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  // After loading, and so in the order the messages came: a cancel follows its score.
  ready
    .then(() => {
      if (message.type === 'score') {
        accept(message.items);
        return drain();
      }
      const cancelled = new Set(message.ids);
      for (let i = queue.length - 1; i >= 0; i--) if (cancelled.has(queue[i]!.id)) queue.splice(i, 1);
    })
    .catch((error) => post({ type: 'error', message: describe(error) }));
};
