import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // The project's aliases and a stand-in for the `browser` API.
  plugins: [WxtVitest()],
  test: { include: ['tests/**/*.test.ts'] },
});
