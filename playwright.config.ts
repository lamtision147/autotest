import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 6000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  retries: 2,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'https://seitrace.com',
    actionTimeout: 0,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    // {
    //   name: 'firefox',
    //   use: {
    //     browserName: 'firefox',
    //     viewport: { width: 1280, height: 720 },
    //   },
    // },
    // {
    //   name: 'webkit',
    //   use: {
    //     browserName: 'webkit',
    //     viewport: { width: 1280, height: 720 },
    //   },
    // },
  ],
};

export default config; 