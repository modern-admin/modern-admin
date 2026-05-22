import { defineConfig, devices } from '@playwright/test'

const API_PORT = 3001
const WEB_PORT = 5173

/**
 * Playwright config for the Modern Admin reference apps. Two web servers
 * boot in parallel: the NestJS API in `apps/api` (port 3001) and the
 * Vite-served React SPA in `apps/web` (port 5173). Tests target the SPA
 * URL and assume the in-memory demo adapter — no real database required.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: [
    {
      command: 'bun run --cwd ../api dev',
      url: `http://localhost:${API_PORT}/admin/api/config`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        API_PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: 'bun run --cwd ../web dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // `apps/web/vite.config.ts` reads `WEB_PORT` (defaults to 3000) and
        // `VITE_API_URL` is consumed by the SPA. Without `WEB_PORT` set,
        // vite picks port 3000 which collides with the docs dev server.
        WEB_PORT: String(WEB_PORT),
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],

  projects: [
    // API/GraphQL tests only need an APIRequestContext — no browser, no auth.
    // Splitting them into their own project keeps the browser projects free of
    // the login dependency and lets you run them with --project=api in CI.
    {
      name: 'api',
      testMatch: /(api|graphql)\.spec\.ts$/,
    },
    // One-shot login that captures storage state. Browser projects depend on
    // it so they start already authenticated.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
    {
      name: 'chromium',
      testIgnore: /(api|graphql)\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
        // Allow switching to a system-installed Chrome/Chromium via env var
        // (`PLAYWRIGHT_CHANNEL=chrome` etc.). Useful on platforms where
        // Playwright's bundled chromium binaries aren't published (e.g.
        // pre-release Ubuntu) and a locally-installed browser is available.
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
})
