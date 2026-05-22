import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Regression coverage for the m2m table-dialog picker
 * (`ReferenceMultiTableDialog`).
 *
 * The picker replaces the legacy combobox for `type: 'm2m'` properties: it
 * opens a Radix Dialog containing the full embedded list page of the
 * referenced resource (here: tags) with row-level multi-select, sorting,
 * pagination, and column filters. The new component lives in
 * `packages/react/src/components/reference-multi-table-dialog.tsx` and is
 * wired into `M2MPropertyEditor` in `property-renderer.tsx`.
 *
 * Tests target the `posts` resource, whose `tags` virtual property is
 * registered by `m2mFeature({ property: 'tags', through: 'postTags', ... })`
 * in `apps/_shared/src/admin/posts/posts.controller.ts`.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

async function firstPostId(request: APIRequestContext): Promise<string> {
  const res = await request.get(adminApi('/resources/posts/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.records.length).toBeGreaterThan(0)
  return String(body.records[0].id)
}

async function openPostEdit(page: Page, request: APIRequestContext): Promise<void> {
  const id = await firstPostId(request)
  await page.goto(`/resources/posts/${id}/edit`)
  // Wait for the form to finish hydrating — the submit button is rendered
  // after the post payload arrives.
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

/** Resolve the field wrapper for a labelled property (e.g. "Tags"). */
function fieldByLabel(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .first()
}

test.describe('m2m picker — table dialog', () => {
  test('clicking the trigger opens a dialog with the related-resource table', async ({ page, request }) => {
    await openPostEdit(page, request)

    const tags = fieldByLabel(page, /^tags$/i)
    await expect(tags).toBeVisible()

    // The picker exposes a single trigger button. Tagged as a regular button
    // — no combobox role — so we match by role + accessible text.
    const trigger = tags.getByRole('button').filter({ hasText: /pick|manage/i }).first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    // Radix Dialog renders into a portal. Match by role with the
    // resource-specific title text.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/tags/i)

    // The dialog body must contain a real table with header + rows. The
    // embedded list page lazy-loads — wait for the first body row.
    await expect(dialog.locator('thead tr').first()).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  })

  test('selecting a row updates the staged count and Save commits a chip', async ({ page, request }) => {
    await openPostEdit(page, request)
    const tags = fieldByLabel(page, /^tags$/i)
    const trigger = tags.getByRole('button').filter({ hasText: /pick|manage/i }).first()
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // Selection state pre-Save: read the staged count label in the footer,
    // toggle one row's checkbox, expect the count to bump.
    const stagedBefore = (await dialog.locator('text=/\\d+\\s*selected/i').first().innerText()).trim()
    const beforeMatch = stagedBefore.match(/(\d+)/)
    const before = beforeMatch ? Number(beforeMatch[1]) : 0

    // Click the row itself (picker mode routes row clicks → toggle selection).
    await dialog.locator('tbody tr').first().click()

    await expect
      .poll(async () => {
        const txt = (await dialog.locator('text=/\\d+\\s*selected/i').first().innerText()).trim()
        const m = txt.match(/(\d+)/)
        return m ? Number(m[1]) : 0
      })
      .toBe(before + 1)

    // Commit selection — dialog closes and a chip appears in the Tags field.
    await dialog.getByRole('button', { name: /^save$/i }).click()
    await expect(dialog).toBeHidden()

    // After commit the trigger label switches to "Manage selection (N)" with
    // the new count baked in.
    const tagsAfter = fieldByLabel(page, /^tags$/i)
    await expect(
      tagsAfter.getByRole('button').filter({ hasText: /manage/i }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Cancel discards the staged selection', async ({ page, request }) => {
    await openPostEdit(page, request)
    const tags = fieldByLabel(page, /^tags$/i)

    // Capture the trigger label before opening — it carries the current
    // committed count ("Manage selection (N)" or "Pick records").
    const beforeLabel = (
      await tags.getByRole('button').filter({ hasText: /pick|manage/i }).first().innerText()
    ).trim()

    const trigger = tags.getByRole('button').filter({ hasText: /pick|manage/i }).first()
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // Stage a new selection by clicking a row, then Cancel.
    await dialog.locator('tbody tr').first().click()
    await dialog.getByRole('button', { name: /^cancel$/i }).click()
    await expect(dialog).toBeHidden()

    // Committed value unchanged — trigger label still carries the same count.
    const afterLabel = (
      await tags.getByRole('button').filter({ hasText: /pick|manage/i }).first().innerText()
    ).trim()
    expect(afterLabel).toEqual(beforeLabel)
  })
})
