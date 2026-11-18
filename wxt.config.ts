import { defineConfig } from 'wxt';

/** What only Chrome's manifest has: the model host there is an offscreen document. */
const CHROME = {
  // runtime.getContexts, which the background finds the model host with.
  minimum_chrome_version: '116',
  permissions: ['offscreen'],
  // Cross-origin isolation for the extension's pages: without it the offscreen document
  // has no SharedArrayBuffer and the WebAssembly fallback runs on one thread.
  cross_origin_embedder_policy: { value: 'require-corp' },
  cross_origin_opener_policy: { value: 'same-origin' },
};

/** What only Firefox's manifest has: the model host there is the background page. */
const FIREFOX = {
  permissions: [],
  browser_specific_settings: {
    gecko: {
      id: 'slop-detect@1-bart-1.github.io',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] },
    },
  },
};

export default defineConfig({
  manifest: ({ browser }) => {
    const { permissions, ...specific } = browser === 'firefox' ? FIREFOX : CHROME;
    return {
      name: 'Slop Detect',
      // No host permissions: the content script's match patterns (src/sites) are all the
      // access to pages the extension has.
      permissions: [...permissions, 'storage', 'unlimitedStorage'],
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      },
      ...specific,
    };
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
