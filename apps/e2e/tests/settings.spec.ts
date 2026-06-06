import { expect, test, type Page } from '@playwright/test'

/**
 * Settings page — `packages/react/src/pages/settings-page.tsx`.
 *
 * Routes:
 *   • `/settings`                       → defaults to the `api-keys` section
 *   • `/settings/api-keys`              → API key management (table + dialogs)
 *   • `/settings/webhooks`              → webhook subscriptions
 *   • `/settings/ai-assistant`          → AI assistant configuration
 *
 * On desktop the section selector is rendered as a sidebar `<nav>` of
 * `<Link>` items (one per `SECTIONS[i]`). Each link's accessible name
 * comes from the resolved i18n label.
 */

test.describe('Settings page', () => {
  test('navigating to /settings lands on the API keys section', async ({ page }) => {
    await page.goto('/settings')
    // The API keys section renders an `h3` card title with the translated
    // string and a "New API key" action button. `exact: true` keeps us off
    // the empty-state heading ("No API keys yet") that shares the same prefix.
    await expect(
      page.getByRole('heading', { name: 'API keys', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /New API key/i })).toBeVisible()
  })

  test('sidebar nav switches between sections', async ({ page }) => {
    await page.goto('/settings')
    // Sidebar nav is only rendered at `md:` and above. Playwright's default
    // viewport (1280x720) qualifies, so the links must be present.
    await expect(
      page.getByRole('heading', { name: 'API keys', exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await sidebarLink(page, /^Webhooks$/i).click()
    await expect(page).toHaveURL(/\/settings\/webhooks$/)
    await expect(
      page.getByRole('heading', { name: 'Webhooks', exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await sidebarLink(page, /AI Assistant/i).click()
    await expect(page).toHaveURL(/\/settings\/ai-assistant$/)
    // The AI assistant section heading uses the `aiAssistant:title` key.
    await expect(
      page.getByRole('heading', { name: 'AI Assistant', exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    // Back to API keys via the sidebar link.
    await sidebarLink(page, /^API keys$/i).click()
    await expect(page).toHaveURL(/\/settings\/api-keys$/)
    await expect(
      page.getByRole('heading', { name: 'API keys', exact: true }),
    ).toBeVisible()
  })

  test('deep-linking to /settings/webhooks renders the webhooks section directly', async ({
    page,
  }) => {
    await page.goto('/settings/webhooks')
    await expect(
      page.getByRole('heading', { name: 'Webhooks', exact: true }),
    ).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * Sidebar links live in the desktop-only `<aside>`. Scoping to that aside
 * avoids matching the mobile-only `<Select>` items that share the same
 * label text but are hidden via Tailwind utilities (still in DOM).
 */
function sidebarLink(page: Page, name: RegExp) {
  return page.locator('aside').getByRole('link', { name })
}
