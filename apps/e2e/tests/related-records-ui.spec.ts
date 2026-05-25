import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the `RelatedRecordsTabs` component mounted on the
 * show page (`packages/react/src/pages/show-page.tsx:208`,
 * `packages/react/src/components/related-records-tabs.tsx`).
 *
 * The customers resource opts in explicitly via
 * `relatedResources: [{ resourceId: 'posts', foreignKey: 'authorId' }, …]`
 * (`apps/_shared/src/admin/customers/customers.controller.ts`). The card
 * mounts below the property card and embeds a full `ResourceListPage`
 * inside each Radix Tabs panel — filtered to `{authorId: <customerId>}` so
 * the table shows only that customer's records.
 *
 * Scenarios:
 *   • The Related-records card renders with both Posts and Comments tabs.
 *   • Posts tab is active by default and shows a table with ≥ 1 row.
 *   • Switching to Comments swaps the active panel.
 *   • The embedded list paginates: clicking "Next page" inside the active
 *     panel advances by one (verified by the records counter staying put
 *     while the row order changes — we capture the first row id before
 *     and after and assert they differ).
 *
 * Customer #1 is used because the demo seed reliably wires plenty of
 * posts + comments to it (see `apps/api-prisma/src/seed-demo.ts`), so
 * the tests don't have to fixture data first.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** Pick a seeded customer that has at least one related post and one comment.
 *  In practice #1 always satisfies this, but we look it up so the spec
 *  doesn't break if the seeder ever shuffles. */
async function customerWithRelations(request: APIRequestContext): Promise<string> {
  const res = await request.get(adminApi('/resources/customers/actions/list?perPage=10'))
  expect(res.ok()).toBeTruthy()
  const customers = (await res.json()).records as Array<{ id: string }>
  for (const c of customers) {
    const posts = await request.get(
      adminApi(`/resources/posts/actions/list?perPage=1&filters[authorId]=${c.id}`),
    )
    const comments = await request.get(
      adminApi(`/resources/comments/actions/list?perPage=1&filters[authorId]=${c.id}`),
    )
    if (posts.ok() && comments.ok()) {
      const postsBody = await posts.json()
      const commentsBody = await comments.json()
      if (postsBody.records.length > 0 && commentsBody.records.length > 0) {
        return String(c.id)
      }
    }
  }
  throw new Error('no seeded customer with both posts and comments — adjust seed')
}

async function openCustomerShow(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/customers/${id}`)
  await expect(page.getByText(/^related records$/i)).toBeVisible({ timeout: 15_000 })
}

/** Active tab panel inside the Related-records card. Radix Tabs marks the
 *  visible panel with `data-state="active"`. */
function activeRelatedPanel(page: Page) {
  return page.locator('[role="tabpanel"][data-state="active"]')
}

test.describe('RelatedRecordsTabs — customers show page', () => {
  test('renders both Posts and Comments tabs with Posts active', async ({
    page,
    request,
  }) => {
    const customerId = await customerWithRelations(request)
    await openCustomerShow(page, customerId)

    const postsTab = page.getByRole('tab', { name: /^posts$/i })
    const commentsTab = page.getByRole('tab', { name: /^comments$/i })
    await expect(postsTab).toBeVisible()
    await expect(commentsTab).toBeVisible()
    await expect(postsTab).toHaveAttribute('data-state', 'active')

    // The default active panel = Posts, and the embedded list shows
    // at least one row (we already verified the customer has posts).
    const panel = activeRelatedPanel(page)
    await expect(panel.locator('tbody tr')).not.toHaveCount(0, { timeout: 15_000 })
  })

  test('switching to Comments activates the Comments panel', async ({
    page,
    request,
  }) => {
    const customerId = await customerWithRelations(request)
    await openCustomerShow(page, customerId)

    await page.getByRole('tab', { name: /^comments$/i }).click()
    await expect(page.getByRole('tab', { name: /^comments$/i })).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 5_000 },
    )

    const panel = activeRelatedPanel(page)
    // Comments table also has at least one row (verified above).
    await expect(panel.locator('tbody tr')).not.toHaveCount(0, { timeout: 15_000 })
  })

  test('foreign-key filter is strict equality, not substring', async ({
    request,
  }) => {
    // Regression: an earlier in-memory matcher used to fall back to a
    // case-insensitive `String.includes()` for any string-typed needle,
    // regardless of property type. With numeric-string FK ids that
    // makes `filters[authorId]=1` also match authorId="10", "11", "12",
    // …, "21" — so a customer's "Related Posts" tab leaked every post
    // whose authorId merely *contained* the customer id. The Prisma
    // adapter routes FK columns through strict equality; this spec
    // pins that contract.
    //
    // The fix should treat reference / id columns as strict equality
    // (substring match is only meaningful for free-text string fields
    // like `title`). This test pins that contract from the API surface.
    const res = await request.get(
      adminApi('/resources/posts/actions/list?perPage=200&filters[authorId]=1'),
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const records = body.records as Array<{ params: { authorId: string } }>
    const distinct = Array.from(new Set(records.map((r) => r.params.authorId)))
    expect(distinct, `expected only authorId "1", got ${distinct.join(', ')}`).toEqual(['1'])
    expect(body.meta.total).toBe(records.length)
  })

  test('related posts tab only shows posts authored by this customer', async ({
    page,
    request,
  }) => {
    // End-to-end version of the regression above: navigate to a
    // customer's show page and assert every row in the embedded Posts
    // table actually belongs to that customer.
    const customerId = await customerWithRelations(request)
    await openCustomerShow(page, customerId)

    const panel = activeRelatedPanel(page)
    await expect(panel.locator('tbody tr')).not.toHaveCount(0, { timeout: 15_000 })

    // Cross-check the embedded list count with the API count for the
    // same filter — they must agree, otherwise the table is leaking
    // (or hiding) records.
    const apiRes = await request.get(
      adminApi(`/resources/posts/actions/list?perPage=200&filters[authorId]=${customerId}`),
    )
    const apiBody = await apiRes.json()
    const apiAuthors = Array.from(
      new Set((apiBody.records as Array<{ params: { authorId: string } }>).map(
        (r) => r.params.authorId,
      )),
    )
    expect(
      apiAuthors,
      `API returned posts whose authorId ≠ ${customerId}: ${apiAuthors.join(', ')}`,
    ).toEqual([customerId])

    // The visible Posts table shouldn't claim a higher total than the
    // strictly-filtered API count (which it would if the contains-match
    // bug crept back in — the table would happily show 81 records for
    // customer "1" while the strict API count is 3).
    const pageSize = Math.min(10, apiBody.records.length)
    await expect(panel.locator('tbody tr')).toHaveCount(pageSize, { timeout: 15_000 })
  })

  test('Posts tab paginates next page inside the embedded list', async ({
    page,
    request,
  }) => {
    const customerId = await customerWithRelations(request)
    // Skip the test if there aren't enough posts to span two pages
    // (perPage in related tabs defaults to 10).
    const posts = await request.get(
      adminApi(`/resources/posts/actions/list?perPage=20&filters[authorId]=${customerId}`),
    )
    const total = (await posts.json()).meta.total as number
    if (total <= 10) {
      test.skip(true, 'customer has ≤ 10 posts; pagination not testable')
      return
    }

    await openCustomerShow(page, customerId)
    const panel = activeRelatedPanel(page)

    // First-row id text captured before page change.
    const firstRowBefore = await panel.locator('tbody tr').first().innerText()
    expect(firstRowBefore.length).toBeGreaterThan(0)

    // The list-page pagination renders the page-N controls as plain
    // numbered buttons (no aria-label on the chevrons). Click the
    // "2" button to advance one page — guaranteed to exist because
    // we just checked total > 10 and perPage defaults to 10.
    const page2 = panel.getByRole('button', { name: /^2$/ }).first()
    await expect(page2).toBeVisible()
    await page2.click()

    // After advancing, the first row should now show a different record.
    await expect
      .poll(async () => (await panel.locator('tbody tr').first().innerText()) !== firstRowBefore, {
        timeout: 10_000,
      })
      .toBeTruthy()
  })
})
