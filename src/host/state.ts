import type { HostState } from '@/src/protocol';

const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** The host's state in words, for the popup and the log. */
export function describeState(state: HostState): string {
  switch (state.phase) {
    case 'no-model':
      return 'Not downloaded yet.';
    case 'loading':
      return state.cached
        ? 'Reading the model from disk'
        : `Downloading: ${megabytes(state.loaded)} of ${megabytes(state.total)}`;
    case 'preparing':
      return 'Preparing the model';
    case 'ready':
      return state.backend === 'webgpu'
        ? 'Ready, on the GPU (WebGPU).'
        : `Ready, on the CPU (WebAssembly, ${state.threads} threads). Slower than a GPU.`;
    case 'error':
      return `Failed: ${state.message}`;
  }
}
