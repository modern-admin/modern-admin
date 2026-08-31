import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * The Filters sheet is built from the **filter view**, not the table columns.
 *
 * Regression: `list-page.tsx` fed `FilterControl` the same property set it fed
 * the table, so `filterProperties` and `isVisible: { filter: … }` — both
 * computed server-side and serialised as `ResourceJSON.propertyOrder.filter` —
 * were dropped on the floor by the SPA. `filterProperties` read as working
 * config (documented, typed, Zod-validated) while being inert, a property
 * hidden from the table was silently unfilterable, and a virtual property
 * excluded from filtering still reached the adapter as a `where` clause on a
 * column that doesn't exist.
 *
 * Fixtures: `comments` declares
 * `filterProperties: ['id', 'postId', 'authorId', 'rating']`
 * (apps/_shared/src/admin/comments/comments.controller.ts) — a whitelist that
 * differs from its columns in three ways at once: it drops `body` and
 * `createdAt`, and it opts `id` back in against the default that excludes id
 * columns from filtering.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

function filtersTrigger(page: Page) {
  return page.getByRole('button', { name: /^Filters\b/i }).first()
}

function filterSheet(page: Page) {
  return page.getByRole('dialog')
}

/** Visible labels of the fields rendered in the sheet, in DOM order. */
async function filterFieldLabels(page: Page): Promise<string[]> {
  return filterSheet(page).locator('label').allInnerTexts()
}

/** Rows holding actual data — placeholder rows carry `aria-busy`. */
function dataRows(page: Page) {
  return page.locator('tbody tr:not([aria-busy="true"])')
}

async function openList(page: Page, resource: string): Promise<void> {
  await page.goto(`/resources/${resource}?perPage=50`)
  await expect(dataRows(page).first()).toBeVisible({ timeout: 15_000 })
}

async function openFilters(page: Page): Promise<void> {
  await filtersTrigger(page).click()
  await expect(filterSheet(page)).toBeVisible({ timeout: 5_000 })
}

/** Column header texts of the rendered table. */
async function columnHeaders(page: Page): Promise<string[]> {
  return page.locator('thead th').allInnerTexts()
}

async function firstCommentId(request: APIRequestContext): Promise<string> {
  const res = await request.get(adminApi('/resources/comments/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const [row] = (await res.json()).records as Array<{ id: string }>
  if (!row) throw new Error('seed fixtures must contain at least one comment')
  return String(row.id)
}

test.describe('Filter view — sheet is built from filterProperties', () => {
  test('renders exactly the whitelisted fields, in the declared order', async ({ page }) => {
    await openList(page, 'comments')
    await openFilters(page)

    // The panel mounts a few fields per frame (see FilterPanel's
    // `mountedCount`), so wait for the full set before snapshotting labels.
    await expect(filterSheet(page).locator('label')).toHaveCount(4, { timeout: 10_000 })
    // Labels are the localized ones the SPA renders, not the raw
    // `property.label` the API serialises (`postId` → "Post", etc.).
    expect(await filterFieldLabels(page)).toEqual(['Id', 'Post', 'Author', 'Rating'])
  })

  test('a column excluded from the filter view is unfilterable, not silently listed', async ({
    page,
  }) => {
    await openList(page, 'comments')
    // `body` and `createdAt` ARE table columns ("Comment text" / "Posted at"
    // once localized) — that's exactly why the old column-derived panel
    // offered them as filters.
    const headers = await columnHeaders(page)
    expect(headers).toContain('Comment text')
    expect(headers).toContain('Posted at')

    await openFilters(page)
    await expect(filterSheet(page).locator('label')).toHaveCount(4, { timeout: 10_000 })
    const labels = await filterFieldLabels(page)
    expect(labels).not.toContain('Comment text')
    expect(labels).not.toContain('Posted at')
  })

  test('the id opt-in actually filters — not just renders', async ({ page, request }) => {
    const commentId = await firstCommentId(request)
    await openList(page, 'comments')
    await openFilters(page)

    const idField = filterSheet(page).locator('xpath=.//label[normalize-space()="Id"]/parent::div')
    // A uuid column has no distinct values to offer, so the field must stay a
    // free-text input — a checkbox picker with nothing in it would make the
    // opt-in unusable however correctly the panel is built.
    const idInput = idField.locator('input').first()
    await expect(idInput).toBeVisible({ timeout: 10_000 })
    await idInput.fill(commentId)
    await filterSheet(page)
      .getByRole('button', { name: /^Apply filters$/i })
      .click()
    await expect(filterSheet(page)).toBeHidden({ timeout: 5_000 })

    await expect(dataRows(page)).toHaveCount(1, { timeout: 10_000 })
    const search = new URL(page.url()).searchParams
    expect(search.get('filters[id][operator]')).toBe('co')
    expect(search.get('filters[id][value]')).toBe(commentId)
  })

  test('without filterProperties, id is offered as a column but not as a filter', async ({
    page,
  }) => {
    // `customers` declares no filterProperties, so the filter view falls back
    // to "every visible property except id" — the server-side default. The old
    // column-derived panel offered `Id` here too.
    await openList(page, 'customers')
    expect(await columnHeaders(page)).toContain('Id')

    await openFilters(page)
    await expect(filterSheet(page).locator('label').first()).toBeVisible({
      timeout: 10_000,
    })
    await expect
      .poll(async () => (await filterFieldLabels(page)).includes('Email'), {
        timeout: 10_000,
      })
      .toBe(true)
    expect(await filterFieldLabels(page)).not.toContain('Id')
  })
})
