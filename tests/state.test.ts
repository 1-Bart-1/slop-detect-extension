import { expect, test } from 'vitest';
import { describeState } from '@/src/host/state';

const bands = { human_max: 0.15, flag_min: 0.43, generated_min: 0.75 };

test('says how many WebAssembly threads the model runs on, one in the singular', () => {
  expect(describeState({ phase: 'ready', bands, backend: 'wasm', threads: 1 })).toBe(
    'Ready, on the CPU (WebAssembly, 1 thread). Slower than a GPU.',
  );
  expect(describeState({ phase: 'ready', bands, backend: 'wasm', threads: 8 })).toBe(
    'Ready, on the CPU (WebAssembly, 8 threads). Slower than a GPU.',
  );
});
