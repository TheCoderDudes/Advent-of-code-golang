import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Everything in this app is Las Vegas time; pin the browser somewhere else
    // on purpose so any accidental device-timezone dependency shows up.
    timezoneId: 'America/New_York',
    trace: 'off',
  },
  projects: [
    {
      // Chromium at iPhone dimensions — WebKit isn't available in this
      // container, and everything under test is DOM/state logic, not engine
      // specific.
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        // Use the Chromium already on the box rather than downloading one.
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
