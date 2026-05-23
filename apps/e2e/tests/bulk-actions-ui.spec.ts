import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the list-page bulk-action bar
 * (`packages/react/src/pages/list-page.tsx` ≈ L1048–1104). The bar is
 * mounted above the list as soon as at least one row checkbox is ticked.
 * It exposes:
 *   • "{count} selected" counter
 *   • "Clear selection" ghost button
 *   • "Actions" dropdown listing every `actionType: 'bulk'` custom action
 *   • "Delete selected" destructive button (covered by `list-crud.spec.ts`)
 *
 * The reference app registers a bulk custom action on `posts` named
 * `publishMany` with a custom label `Publish selected`
 * (`apps/_shared/src/admin/posts/posts.controller.ts`). The REST endpoint
 * is exercised by `custom-actions-api.spec.ts`; this spec drives the same
 * controller through the actual UI:
 *   • Create two unpublished posts via the API (fixtures with unique titles).
 *   • Open the posts list, tick both checkboxes by row → assert
 *     "2 selected" appears in the bulk-action bar.
 *   • Open the "Actions" dropdown → click "Publish selected".
 *   • Wait for the `POST /…/posts/actions/publishMany` request to settle.
 *   • Verify via the API both fixtures now report `published: true`.
 *   • Cleanup: delete the two fixtures.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface PostFixture {
  id: string
  title: string
}

async function firstAuthorId(request: APIRequestContext): Promise<string> {
  const res = await request.get(adminApi('/resources/customers/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.records.length).toBeGreaterThan(0)
  return String(body.records[0].id)
}

async function createUnpublishedPost(
  request: APIRequestContext,
  authorId: string,
  suffix: string,
): Promise<PostFixture> {
  const title = `Bulk Action Fixture ${suffix}`
  const res = await request.post(adminApi('/resources/posts/actions/new'), {
    data: { title, authorId, published: false },
  })
  expect(res.ok(), `post create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), title }
}

async function deletePostSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/posts/records/${id}/actions/delete`))
}

async function readPostPublished(
  request: APIRequestContext,
  id: string,
): Promise<boolean> {
  const res = await request.get(adminApi(`/resources/posts/records/${id}/actions/show`))
  expect(res.ok()).toBeTruthy()
  return Boolean((await res.json()).record.params.published)
}

/** Tick the selection checkbox on the row containing `cellText`. The title
 *  column renders a link wrapper + truncated text, so the accessible name
 *  isn't an exact match — locate the row by any `tbody tr` that contains
 *  the title text and use the row's `Select row` checkbox. */
async function selectRowByCell(page: Page, cellText: string): Promise<void> {
  const row = page.locator('tbody tr').filter({ hasText: cellText })
  await expect(row).toHaveCount(1, { timeout: 10_000 })
  await row.getByRole('checkbox', { name: /^select row$/i }).check()
}

test.describe('Bulk-action UI — posts.publishMany', () => {
  test('selecting two unpublished rows and running Publish selected flips both', async ({
    page,
    request,
  }) => {
    const authorId = await firstAuthorId(request)
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const fixtures = [
      await createUnpublishedPost(request, authorId, `${suffix}-a`),
      await createUnpublishedPost(request, authorId, `${suffix}-b`),
    ]
    try {
      // Posts has no createdAt — sort isn't useful. Bumping `perPage=200`
      // (the server cap) keeps the freshly-inserted fixtures on a single
      // page so they're always reachable by title lookup.
      // UUID v7 ids are time-ordered, so sorting `id` desc surfaces the
      // freshest fixtures at the top of page 1 regardless of how many
      // seed rows already exist. `perPage=200` is the server cap.
      await page.goto('/resources/posts?perPage=200&sortBy=id&direction=desc')
      await expect(
        page.getByRole('heading', { name: /posts/i }).first(),
      ).toBeVisible({ timeout: 15_000 })

      for (const fix of fixtures) {
        await selectRowByCell(page, fix.title)
      }

      // The bulk bar renders "{n} selected" from `common:selectedCount`.
      await expect(page.getByText(/^2 selected$/i)).toBeVisible({ timeout: 5_000 })

      // The custom-actions dropdown is the only ActionMenu mounted in the
      // bulk bar — its trigger is labelled "Actions" via i18n.
      await page.getByRole('button', { name: /^actions$/i }).first().click()

      // Wait for the publishMany POST while clicking the menu item.
      const publishPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/admin/api/resources/posts/actions/publishMany') &&
          res.request().method() === 'POST',
      )
      await page
        .getByRole('menuitem', { name: /publish selected/i })
        .click()
      const publishRes = await publishPromise
      expect(
        publishRes.ok(),
        `publishMany request failed: ${await publishRes.text()}`,
      ).toBeTruthy()

      // After the bulk action settles the bar clears (rowSelection reset
      // by the onSuccess handler), so the counter disappears.
      await expect(page.getByText(/^2 selected$/i)).toBeHidden({ timeout: 5_000 })

      // Server-side double-check.
      for (const fix of fixtures) {
        expect(await readPostPublished(request, fix.id)).toBe(true)
      }
    } finally {
      for (const fix of fixtures) {
        await deletePostSilently(request, fix.id)
      }
    }
  })

  test('Clear selection button empties the bulk bar', async ({
    page,
    request,
  }) => {
    const authorId = await firstAuthorId(request)
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const fix = await createUnpublishedPost(request, authorId, `clear-${suffix}`)
    try {
      // UUID v7 ids are time-ordered, so sorting `id` desc surfaces the
      // freshest fixtures at the top of page 1 regardless of how many
      // seed rows already exist. `perPage=200` is the server cap.
      await page.goto('/resources/posts?perPage=200&sortBy=id&direction=desc')
      await expect(
        page.getByRole('heading', { name: /posts/i }).first(),
      ).toBeVisible({ timeout: 15_000 })

      await selectRowByCell(page, fix.title)
      await expect(page.getByText(/^1 selected$/i)).toBeVisible()

      // The "Clear selection" button is the only ghost-variant button in
      // the bulk bar; match it by its translated label.
      await page.getByRole('button', { name: /^clear selection$/i }).click()
      await expect(page.getByText(/^1 selected$/i)).toBeHidden()
    } finally {
      await deletePostSilently(request, fix.id)
    }
  })
})
