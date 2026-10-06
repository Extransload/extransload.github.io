import { defineConfig } from '@playwright/test';

// Overridable so a preview server already running on the default port (or a
// concurrent task) does not block the suite.
const port = Number(process.env.PREVIEW_PORT ?? 4321);
const host = '127.0.0.1';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/release.spec.ts', '**/comments.spec.ts'],
  // The CI runner uses CPU-based WebGL; concurrent 3D pages contend for the same cores.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npm run preview -- --host ${host} --port ${port}`,
    env: {
      ...process.env,
      TZ: 'UTC',
    },
    port,
    reuseExistingServer: false,
  },
});
