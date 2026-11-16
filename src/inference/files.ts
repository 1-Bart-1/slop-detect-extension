import type { Bands } from '@/src/protocol';
import { CACHE_NAME, REPO, WEIGHTS_BYTES, WEIGHTS_NAME } from './model';
import { describe, log } from './trace';

type Bytes = Uint8Array<ArrayBuffer>;
export type Progress = (loaded: number, total: number, cached: boolean) => void;

/** The model as the runtime takes it: the graph, and the weights the graph refers to. */
export interface Model {
  graph: Bytes;
  weights: Bytes;
}

/** Everything the worker needs from the model directory. */
export interface ModelFiles {
  model: Model;
  tokenizer: object;
  tokenizerConfig: object;
  bands: Bands;
}

/** Reads a response body into one buffer, reporting progress as it goes. */
async function read(response: Response, expected: number, cached: boolean, progress?: Progress): Promise<Bytes> {
  const total = Number(response.headers.get('Content-Length')) || expected;
  let buffer = new Uint8Array(total);
  let loaded = 0;
  let lastReport = 0;

  const reader = response.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > buffer.length) {
      // The size estimate was too small: grow.
      const grown = new Uint8Array(Math.max(buffer.length * 2, loaded + value.length));
      grown.set(buffer.subarray(0, loaded));
      buffer = grown;
    }
    buffer.set(value, loaded);
    loaded += value.length;

    const now = performance.now();
    if (now - lastReport > 50) {
      lastReport = now;
      progress?.(loaded, Math.max(total, loaded), cached);
    }
  }
  progress?.(loaded, loaded, cached);
  return buffer.subarray(0, loaded);
}

/** One file of the model directory, from the cache when it is there and from the network otherwise. */
async function loadFile(cache: Cache | null, path: string, expected: number, progress?: Progress): Promise<Bytes> {
  const url = `${REPO}/${path}`;
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit?.body) {
    const bytes = await read(hit, expected, true, progress);
    log(`${path}: ${bytes.length} bytes from cache`);
    return bytes;
  }

  log(`${path}: downloading`, url);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${path}: HTTP ${response.status}`);
  const bytes = await read(response, expected, false, progress);
  log(`${path}: ${bytes.length} bytes downloaded`);

  // Awaited: the cache write holds a second copy of the file, which must be gone before
  // the session is created, where memory peaks. From the buffer, not a stream of the
  // download: Chrome fails Cache.put() on a streamed body of this size. A quota error
  // only means the next start downloads again.
  await cache?.put(url, new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } })).then(
    () => log(`${path}: stored in cache`),
    (error) => log(`${path}: could not be cached:`, describe(error)),
  );
  return bytes;
}

const json = (bytes: Bytes) => JSON.parse(new TextDecoder().decode(bytes)) as object;

/** Downloads the model directory, or reads it back from the Cache API on later starts. */
export async function loadModelFiles(progress: Progress): Promise<ModelFiles> {
  // The Cache API can be missing or throw (blocked storage).
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  log('cache storage', cache ? 'available' : 'unavailable');

  const small = 1 << 20;
  const [tokenizer, tokenizerConfig, bands, graph] = await Promise.all([
    loadFile(cache, 'tokenizer.json', small).then(json),
    loadFile(cache, 'tokenizer_config.json', small).then(json),
    loadFile(cache, 'bands.json', small).then((bytes) => json(bytes) as Bands),
    loadFile(cache, 'onnx/model_quantized.onnx', small),
  ]);
  // Alone and last: the only file with a progress bar.
  const weights = await loadFile(cache, `onnx/${WEIGHTS_NAME}`, WEIGHTS_BYTES, progress);
  return { model: { graph, weights }, tokenizer, tokenizerConfig, bands };
}
