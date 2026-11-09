const { defineConfig } = require('@playwright/test');
const baseURL = process.env.ROOMIE_TEST_BASE_URL || 'http://127.0.0.1:8876';
module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'browser-buttons.spec.cjs',
  workers: 1,
  reporter: 'list',
  use: { baseURL, screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: process.env.ROOMIE_TEST_BASE_URL ? undefined : {
    command: 'python3 -m http.server 8876 --bind 127.0.0.1 --directory Remind_Roomie',
    url: baseURL + '/tasks.html',
    reuseExistingServer: false
  }
});
