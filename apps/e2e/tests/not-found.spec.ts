import { expect, test } from '@playwright/test'

/**
 * Behaviour when the user lands on a URL that doesn't resolve to data:
 *   • Existing resource + non-existent record id  → show/edit pages render an
 *     inline error card with the localized `errors:notFound` message and keep
 *     the breadcrumbs + URL intact.
 *   • Totally unmatched path → TanStack Router falls through to its default
 *     not-found component inside the authenticated shell (sidebar still
 *     visible, no resource content rendered).
 */

const NONEXISTENT_ID = '99999999'

test.describe('Not-found handling', () => {
  test('show page with a missing record renders the not-found card', async ({
    page,
  }) => {
    await page.goto(`/resources/customers/${NONEXISTENT_ID}`)

    // Header anchored to the requested id (we never throw — breadcrumb chain
    // and card chrome both render).
    await expect(
      page.getByRole('heading', {
        name: new RegExp(`customers\\s*#${NONEXISTENT_ID}`, 'i'),
      }),
    ).toBeVisible({ timeout: 10_000 })

    // Inline error block from `errors:notFound`.
    await expect(page.getByText(/^Not found\.?/i)).toBeVisible({ timeout: 10_000 })

    // No data field renders — the record's `<dl>` is omitted when the query
    // is in error state.
    await expect(page.locator('dl')).toHaveCount(0)
    await expect(page).toHaveURL(
      new RegExp(`/resources/customers/${NONEXISTENT_ID}$`),
    )
  })

  test('edit page with a missing record renders the not-found card', async ({
    page,
  }) => {
    await page.goto(`/resources/customers/${NONEXISTENT_ID}/edit`)

    // Same chrome as show-page error path — heading + inline error.
    await expect(
      page.getByRole('heading', {
        name: new RegExp(`customers\\s*#${NONEXISTENT_ID}`, 'i'),
      }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^Not found\.?/i)).toBeVisible({ timeout: 10_000 })

    // The form itself is unmounted in the error branch — no Save button.
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)

    // "Back" link to the resource list is offered.
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
  })

  test('unrouted path falls through to the router not-found page', async ({
    page,
  }) => {
    await page.goto('/this-route-does-not-exist')
    // Don't assert on TSR's internal default-component text (subject to
    // change between minor versions). Instead, assert that no expected app
    // content rendered: there's no list page, no show/edit chrome, and the
    // URL was preserved.
    await expect(page).toHaveURL(/\/this-route-does-not-exist$/)
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)

    // TanStack Router's default not-found surfaces "Not Found" — accept any
    // body text that includes it (case-insensitive) while staying loose
    // about exact markup.
    await expect(page.locator('body')).toContainText(/not found/i)
  })

  test('unknown sub-segment under a valid resource also routes to not-found', async ({
    page,
  }) => {
    // `$resourceId/$recordId/edit` is the deepest matching pattern; an
    // unknown action segment falls through.
    await page.goto('/resources/customers/1/bogus-segment')
    await expect(page).toHaveURL(/bogus-segment$/)
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await expect(page.locator('body')).toContainText(/not found/i)
  })
})
