import { defineConfig } from 'vitest/config';

/**
 * Contract tests that assert on the built site in dist/.
 * Run `npm run build` first; `npm run test:dist` does both.
 */
export default defineConfig({
  test: {
    include: ['tests/built/**/*.test.ts'],
  },
});
