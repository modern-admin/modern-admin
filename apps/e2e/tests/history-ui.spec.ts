import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the revisions UI surfaced by `feature-history` —
 * the `RevisionsButton` mounted in the show-page header
 * (`packages/react/src/components/revisions-button.tsx`).
 *
 * REST + revert plumbing is already exercised by `history-api.spec.ts`;
 * this spec drives the same controller through the actual UI:
 *   • Click the "Revisions" button → Radix Sheet opens with timeline + diff.
 *   • Pick an older revision in the timeline.
 *   • Click "Revert" → AlertDialog confirm → POST to /…/history/:id/revert
 *     succeeds and the show-page reflects the reverted snapshot.
 *
 * Uses customers because:
 *   1. it has cheap required fields (name + email + tier);
 *   2. `tests/edit-page.spec.ts` already proves the edit pipeline works on it,
 *      so any failure here is owned by the revisions UI, not by edits.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface CustomerFixture {
  id: string
  originalName: string
  renamedName: string
}

/**
 * Fixture: a customer with two persisted revisions — `create` and an `edit`
 * that renames it. The revert flow then has at least one older snapshot
 * to roll back to.
 */
async function createCustomerWithEdit(
  request: APIRequestContext,
): Promise<CustomerFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const originalName = `History Original ${suffix}`
  const renamedName = `History Renamed ${suffix}`
  const create = await request.post(
    adminApi('/resources/customers/actions/new'),
    {
      data: {
        name: originalName,
        email: `history-ui-${suffix}@example.com`,
        tier: 'free',
      },
    },
  )
  expect(create.ok(), `create failed: ${await create.text()}`).toBeTruthy()
  const body = await create.json()
  const id = String(body.record.id)

  const patch = await request.patch(
    adminApi(`/resources/customers/records/${id}/actions/edit`),
    { data: { name: renamedName } },
  )
  expect(patch.ok(), `rename failed: ${await patch.text()}`).toBeTruthy()
  return { id, originalName, renamedName }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

async function openShowPage(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/customers/${id}`)
  // The header buttons (incl. Revisions) only mount once the record load
  // resolves — `Revisions` is sourced from `useResource(...)?.actions`.
  await expect(
    page.getByRole('button', { name: /^revisions$/i }).first(),
  ).toBeVisible({ timeout: 15_000 })
}

test.describe('Revisions UI — `feature-history`', () => {
  test('clicking Revisions opens a sheet listing every edit', async ({
    page,
    request,
  }) => {
    const fix = await createCustomerWithEdit(request)
    try {
      await openShowPage(page, fix.id)

      await page.getByRole('button', { name: /^revisions$/i }).first().click()

      // The Sheet is a portal-mounted `role="dialog"` whose title text is
      // the i18n'd "Revisions" label. Match the dialog explicitly so we
      // don't pick up the trigger button by accident.
      const sheet = page.getByRole('dialog').filter({ hasText: /^revisions/i }).first()
      await expect(sheet).toBeVisible()

      // The timeline renders one button per revision. Two edits (create +
      // edit) produce at least two entries.
      // The timeline lives in the left column; each entry is a <button>
      // tagged with op label ("Created" / "Updated" / "Deleted") +
      // change-count + author + formatted date.
      await expect
        .poll(async () => sheet.locator('button:has-text("Updated")').count(), {
          timeout: 10_000,
        })
        .toBeGreaterThanOrEqual(1)
      await expect
        .poll(async () => sheet.locator('button:has-text("Created")').count())
        .toBeGreaterThanOrEqual(1)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('selecting an older revision and clicking Revert restores its snapshot', async ({
    page,
    request,
  }) => {
    const fix = await createCustomerWithEdit(request)
    try {
      await openShowPage(page, fix.id)
      // Sanity check — show-page currently shows the renamed value.
      await expect(page.getByText(fix.renamedName).first()).toBeVisible({
        timeout: 10_000,
      })

      await page.getByRole('button', { name: /^revisions$/i }).first().click()
      const sheet = page.getByRole('dialog').filter({ hasText: /^revisions/i }).first()
      await expect(sheet).toBeVisible()

      // "Revert" undoes a revision by restoring its `snapshotBefore`. The
      // "Created" entry has no prior state and the controller rejects it
      // with 400. To roll back to the original snapshot we pick the
      // "Updated" entry — reverting it restores the pre-rename state.
      const updatedEntry = sheet.locator('button:has-text("Updated")').first()
      await expect(updatedEntry).toBeVisible({ timeout: 10_000 })
      await updatedEntry.click()

      // Click Revert → confirm AlertDialog appears.
      const revertButton = sheet.getByRole('button', { name: /^revert$/i })
      await expect(revertButton).toBeVisible()

      // The AlertDialog is a separate role="alertdialog" portal; the confirm
      // button inside re-uses the localised "Revert" label.
      const revertPromise = page.waitForResponse(
        (res) =>
          /\/admin\/api\/resources\/customers\/records\/[^/]+\/history\/[^/]+\/revert/.test(
            res.url(),
          ) && res.request().method() === 'POST',
      )
      await revertButton.click()
      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: /^revert$/i }).click()

      const revertRes = await revertPromise
      expect(
        revertRes.ok(),
        `revert request failed: ${await revertRes.text()}`,
      ).toBeTruthy()

      // After revert, TanStack Query invalidates the record and the show
      // page renders the original name again. The Sheet auto-closes
      // (handleRevert calls setOpen(false)).
      await expect(page.getByText(fix.originalName).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(fix.renamedName)).toHaveCount(0)

      // Server-side double-check — the record is back to the original name.
      const after = await request.get(
        adminApi(
          `/resources/customers/records/${fix.id}/actions/show`,
        ),
      )
      expect(after.ok()).toBeTruthy()
      const afterBody = await after.json()
      expect(afterBody.record.params.name).toBe(fix.originalName)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('Cancel on the revert confirm dialog leaves the record untouched', async ({
    page,
    request,
  }) => {
    const fix = await createCustomerWithEdit(request)
    try {
      await openShowPage(page, fix.id)
      await page.getByRole('button', { name: /^revisions$/i }).first().click()
      const sheet = page.getByRole('dialog').filter({ hasText: /^revisions/i }).first()
      await expect(sheet).toBeVisible()

      const updatedEntry = sheet.locator('button:has-text("Updated")').first()
      await expect(updatedEntry).toBeVisible({ timeout: 10_000 })
      await updatedEntry.click()
      await sheet.getByRole('button', { name: /^revert$/i }).click()

      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible()

      // Make sure no revert POST fires when the user cancels.
      const revertShouldNotFire = page
        .waitForRequest(
          (req) =>
            /\/history\/[^/]+\/revert/.test(req.url()) &&
            req.method() === 'POST',
          { timeout: 1500 },
        )
        .catch(() => null)
      await confirmDialog.getByRole('button', { name: /^cancel$/i }).click()
      const fired = await revertShouldNotFire
      expect(fired, 'no revert POST should fire on Cancel').toBeNull()

      // Record still carries the renamed value.
      const after = await request.get(
        adminApi(
          `/resources/customers/records/${fix.id}/actions/show`,
        ),
      )
      expect(after.ok()).toBeTruthy()
      const afterBody = await after.json()
      expect(afterBody.record.params.name).toBe(fix.renamedName)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })
})
