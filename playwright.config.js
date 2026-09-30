const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 1000 }
  },
  webServer: {
    command: 'npx http-server . -p 4173 -c-1',
    port: 4173,
    reuseExistingServer: false,
    timeout: 30000
  }
});
