const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: 1,
  use: {
    baseURL: "http://localhost:8765",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    actionTimeout: 8000,
  },
  webServer: {
    command: "npx http-server . -p 8765 -c-1 --silent",
    port: 8765,
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    {
      name: "smoke",
      testMatch: "smoke.spec.js",
    },
    {
      name: "unit",
      testMatch: "unit.spec.js",
    },
  ],
});
