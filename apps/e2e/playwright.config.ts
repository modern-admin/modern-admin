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
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
