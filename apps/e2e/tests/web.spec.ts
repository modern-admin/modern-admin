import { test, expect } from '@playwright/test'

/**
 * Frontend smoke test — verifies the SPA mounts, fetches the resource
 * config, renders the home page with the resource list, and navigates
 * into a resource list view.
 */
test.describe('Web SPA', () => {
  test('home page lists registered resources', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toContainText(/users|posts/i)
  })

  test('navigates to the users resource list', async ({ page }) => {
    await page.goto('/#/resources/users')
    // Wait for the table to mount with at least one seeded row.
    await expect(page.getByText('ada@example.com')).toBeVisible({ timeout: 10_000 })
  })
})
