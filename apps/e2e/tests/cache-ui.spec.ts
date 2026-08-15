import { expect, test } from '@playwright/test'

test.describe('Cache diagnostics — mobile', () => {
  test.use({ viewport: { width: 375, height: 700 } })

  test('renders operator controls without page-level horizontal overflow', async ({ page }) => {
    await page.goto('/cache')

    await expect(page.getByRole('heading', { name: 'Cache', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset metrics' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Resource' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invalidate cache' })).toBeVisible()
    await expect(page.getByText('Metrics by namespace')).toBeVisible()

    await page.getByRole('button', { name: 'Reset metrics' }).click()
    await expect(page.getByText('Cache metrics reset', { exact: true })).toBeVisible()
    await expect(page.getByText('cache:reset.success', { exact: true })).toHaveCount(0)
    await expect(page.getByText('No cache activity recorded yet.')).toBeVisible()

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })
})
