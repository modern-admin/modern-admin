import { defineConfig, devices } from '@playwright/test'

const API_PORT = 3001
const WEB_PORT = 5173

/**
 * Playwright config for the Modern Admin reference apps. Two web servers
 * boot in parallel: the NestJS API in `apps/api-prisma` (port 3001,
 * Prisma 7 + Postgres) and the Vite-served React SPA in `apps/web`
 * (port 5173). Tests target the SPA URL.
 *
 * The Postgres database is provisioned via `bun run docker:up` (see
 * `docker-compose.yml`) and migrated with `bun run --cwd apps/api-prisma
 * prisma:migrate`. `SEED_DEMO=1` populates fixture rows used by the
 * specs (idempotent — re-runs upsert in place).
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
      command: 'bun run --cwd ../api-prisma dev',
      url: `http://localhost:${API_PORT}/admin/api/config`,
      reuseExistingServer: !process.env.CI,
      // CI runners are 2-vCPU; the API (cold NestJS compile via bun) and the
      // web server (cold vite optimizeDeps) boot in parallel and contend for
      // the same cores, so first-ready can exceed the default 60s even though
      // a warm local boot is ~4s. Give both a wider ceiling.
      timeout: 120_000,
      env: {
        API_PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        // Force the in-process MemoryCacheProvider so the caching e2e spec
        // can observe HIT/MISS/BYPASS without a Redis dependency.
        CACHE_BACKEND: 'memory',
        // Idempotent fixture seed used by every spec (mirrors the volumes
        // the legacy `apps/api` in-memory adapter used to ship).
        SEED_DEMO: '1',
      },
    },
    {
      command: 'bun run --cwd ../web dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
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
    // API/GraphQL tests use APIRequestContext only (no browser) but the
    // backend now sits behind the Better Auth guard, so the project loads the
    // same authenticated `storageState` produced by the `setup` project.
    // Playwright's request fixture replays the stored cookies on every call,
    // which is enough to satisfy the cookie-session guard on /admin/api/*.
    {
      name: 'api',
      testMatch: /(api|graphql|graphql-mutations|openapi|global-search-api|history-api|custom-actions-api|date-filter-api|forms-api|timeseries-api|caching-api|login-audit-api)\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        storageState: 'playwright/.auth/admin.json',
      },
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
      testIgnore: /(api|graphql|graphql-mutations|openapi|global-search-api|history-api|custom-actions-api|date-filter-api|forms-api|timeseries-api|caching-api|login-audit-api)\.spec\.ts$/,
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
