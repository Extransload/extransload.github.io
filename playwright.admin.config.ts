import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e-admin',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4327',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4327',
    port: 4327,
    reuseExistingServer: !process.env.CI,
  },
});
