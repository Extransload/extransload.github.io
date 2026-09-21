import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/e2e/release.spec.ts'],
    exclude: ['tests/e2e/layout.spec.ts', 'tests/built/**'],
  },
});
