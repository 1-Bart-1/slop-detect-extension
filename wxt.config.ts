import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Slop Detect',
    // runtime.getContexts, which the background finds the model host with.
    minimum_chrome_version: '116',
    // No host permissions: the content script's match patterns (src/sites) are all the
    // access to pages the extension has.
    permissions: ['offscreen', 'storage', 'unlimitedStorage'],
    // Cross-origin isolation for the extension's pages: without it the offscreen document
    // has no SharedArrayBuffer and the WebAssembly fallback runs on one thread.
    cross_origin_embedder_policy: { value: 'require-corp' },
    cross_origin_opener_policy: { value: 'same-origin' },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
  hooks: {
    // The inference worker is type-checked with the rest of the project.
    'prepare:tsconfig': (_wxt, { tsconfig }) => {
      tsconfig.compilerOptions.lib.push('WebWorker');
    },
  },
  vite: () => ({
    worker: { format: 'es' },
    // ONNX Runtime locates its own .mjs and .wasm files: pre-bundling breaks that.
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    build: { target: 'es2022' },
  }),
});
