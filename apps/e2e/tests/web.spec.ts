import { test, expect } from '@playwright/test'

/**
 * Frontend smoke test — verifies the SPA mounts, fetches the resource
 * config, renders the home page with the resource list, and navigates
 * into a resource list view. Auth comes from the `setup` project
 * (`tests/auth.setup.ts`), which logs in once and shares a storage state.
 */
test.describe('Web SPA', () => {
  test('home page lists registered resources', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toContainText(/customers|posts/i)
  })

  test('navigates to the customers resource list', async ({ page }) => {
    await page.goto('/resources/customers')
    // Wait for the table to mount with at least one seeded row. The data
    // cell ("Ada Lovelace" — customer #1 per apps/api-prisma/src/seed-demo.ts) is
    // wrapped in a `<span class="overflow-hidden break-words">`, which makes
    // bare `getByText` racy on `toBeVisible`. Match the ARIA cell role
    // (stable, normalized text) and require at least one to render.
    await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toHaveCount(1, {
      timeout: 10_000,
    })
  })
})
