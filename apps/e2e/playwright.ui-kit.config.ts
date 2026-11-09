import { defineConfig, devices } from '@playwright/test'

// A backend-free suite: only the component gallery and one browser worker.
export default defineConfig({
  testDir: './tests',
  testMatch: 'ui-kit.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5191',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run --cwd ../web dev --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191/ui.html',
    reuseExistingServer: false,
  },
})
