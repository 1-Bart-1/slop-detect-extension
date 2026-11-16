/// <reference lib="webworker" />
import type * as Ort from 'onnxruntime-web';
// ONNX Runtime's own loaders and binaries, emitted as separate files of the package. Its
// thread workers must start from the loader, not from the bundled worker script: if they
// load that they load the model again and replace the runtime's message handler, and
// session creation never returns. The WebGPU build of the runtime has its own pair
// (asyncify); the plain pair is half the size and CPU only.
import wasmLoaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import gpuLoaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import gpuBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { Backend } from '@/src/protocol';
import type { Padded } from './batch';
import type { Model } from './files';
import { WEIGHTS_NAME } from './model';
import { describe, log } from './trace';

/** The model, loaded on one backend. */
export interface Session {
  backend: Backend;
  /** One forward pass; the logit of each row. */
  run(batch: Padded): Promise<number[]>;
}

export interface SessionOptions {
  /** `webgpu` or `wasm` runs that backend only; anything else picks the best one. */
  only: string | null;
  /** WebAssembly threads. */
  threads: number;
  /** A batch to try the GPU with before any real text. */
  warmUp: Padded;
}

/** True when the browser offers a hardware WebGPU adapter. */
async function hasGpu(): Promise<boolean> {
  type Adapter = { info?: { isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean };
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  // A fallback adapter is a software rasteriser: far slower than WebAssembly.
  return !!adapter && !(adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter);
}

/** Loads the runtime build of one backend (each is fetched on demand) and the model into it. */
async function create(backend: Backend, model: Model, threads: number): Promise<Session & { release(): Promise<void> }> {
  let ort: typeof Ort;
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
  const session = await ort.InferenceSession.create(model.graph, {
    externalData: [{ path: WEIGHTS_NAME, data: model.weights }],
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 2,
  });

  async function run({ ids, mask, rows, length }: Padded): Promise<number[]> {
    const { logits } = await session.run({
      input_ids: new ort.Tensor('int64', ids, [rows, length]),
      attention_mask: new ort.Tensor('int64', mask, [rows, length]),
    });
    if (!logits) throw new Error('the model has no logits output');
    const values = Array.from(logits.data as Float32Array);
    if (values.length !== rows) throw new Error(`${values.length} logits for ${rows} texts`);
    return values;
  }
  return { backend, run, release: () => session.release() };
}

/**
 * A WebGPU session that has run once. The warm-up compiles the shaders before the first
 * real text, and proves the GPU path works: a driver that fails here sends us to
 * WebAssembly instead of failing on the user.
 */
async function createOnGpu(model: Model, warmUp: Padded): Promise<Session> {
  const session = await create('webgpu', model, 1);
  try {
    const [logit] = await session.run(warmUp);
    if (!Number.isFinite(logit)) throw new Error(`warm-up returned ${logit}`);
    return session;
  } catch (error) {
    // Frees the model's copy in this runtime's heap and its GPU buffers. The
    // WebAssembly fallback is a second runtime and loads the model again.
    await session.release().catch(() => undefined);
    throw error;
  }
}

/**
 * WebGPU when the browser has a real adapter, WebAssembly otherwise. One backend at a
 * time: given a list, the runtime falls back silently and does not say which provider
 * it picked.
 */
export async function openSession(model: Model, { only, threads, warmUp }: SessionOptions): Promise<Session> {
  if (only === 'wasm') {
    log('webgpu: skipped, wasm only');
  } else if (await hasGpu()) {
    try {
      return await createOnGpu(model, warmUp);
    } catch (error) {
      if (only === 'webgpu') throw error;
      log('webgpu: failed, falling back to wasm:', describe(error));
    }
  } else {
    log('webgpu: no hardware adapter');
  }
  return create('wasm', model, threads);
}
