import { expect, test, type Page } from '@playwright/test'

/**
 * Draft auto-save for the new-record form.
 *
 * `packages/react/src/pages/edit-page.tsx` persists a snapshot of the new
 * form to `localStorage` under `modern-admin:draft:<resourceId>` on every
 * field change. When the user revisits the new-form route, the draft is
 * restored automatically and a bottom-center sonner toast appears with an
 * "Undo" action that reverts to defaults and clears the draft.
 *
 * The draft is also cleared on successful submit so that completed records
 * never resurrect on the next visit.
 *
 * Tests target the `customers` resource (`apps/_shared`). The Name field is
 * required and free-text, which makes it a clean signal for the dirty check.
 */

const DRAFT_KEY = 'modern-admin:draft:customers'

/** Resolve the `<input>` inside the named Field-slotted wrapper. */
function fieldInput(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .locator('input')
    .first()
}

async function gotoNewCustomer(page: Page): Promise<void> {
  await page.goto('/resources/customers/new')
  await expect(fieldInput(page, /^Full name/i)).toBeVisible({ timeout: 15_000 })
}

async function clearDraftKey(page: Page): Promise<void> {
  await page.evaluate((key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }, DRAFT_KEY)
}

async function readDraft(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }, DRAFT_KEY)
}

test.describe('Draft auto-save — new record form', () => {
  test.beforeEach(async ({ page }) => {
    await gotoNewCustomer(page)
    await clearDraftKey(page)
  })

  test('persists field input to localStorage when the user types', async ({ page }) => {
    const name = `Draft Auto ${Date.now()}`
    const nameInput = fieldInput(page, /^Full name/i)
    await nameInput.fill(name)

    // The watch subscription fires synchronously, but localStorage commits
    // happen in the same tick — give the React update a beat to flush.
    await expect
      .poll(async () => (await readDraft(page))?.name, { timeout: 5_000 })
      .toBe(name)
  })

  test('restores the draft on revisit and shows a bottom-center toast with Undo', async ({ page }) => {
    const name = `Draft Revisit ${Date.now()}`
    await fieldInput(page, /^Full name/i).fill(name)
    await expect
      .poll(async () => (await readDraft(page))?.name, { timeout: 5_000 })
      .toBe(name)

    // Navigate away to the resource list — this leaves the draft in storage.
    await page.goto('/resources/customers')
    // …and back to the new form.
    await gotoNewCustomer(page)

    // Field hydrates with the stored draft.
    await expect(fieldInput(page, /^Full name/i)).toHaveValue(name, { timeout: 5_000 })

    // The toaster container has `data-sonner-toaster` and a `position`
    // attribute matching the `position` option passed to the toast.
    const toaster = page.locator('[data-sonner-toaster][data-y-position="bottom"][data-x-position="center"]')
    await expect(toaster).toHaveCount(1)

    // The toast (rendered into sonner's portal) carries the restored copy
    // plus an Undo action. Scope to the toaster so we don't match the
    // RichTextEditor toolbar's `aria-label="Undo"` button.
    const undoButton = toaster
      .getByRole('button', { name: /undo|восстан|annuler|annulla|deshacer|desfazer|rückgängig|cofnij|元に戻す/i })
      .first()
    await expect(undoButton).toBeVisible({ timeout: 5_000 })
  })

  test('Undo action reverts to defaults and clears the draft', async ({ page }) => {
    const name = `Draft Undo ${Date.now()}`
    await fieldInput(page, /^Full name/i).fill(name)
    await expect
      .poll(async () => (await readDraft(page))?.name, { timeout: 5_000 })
      .toBe(name)

    await page.goto('/resources/customers')
    await gotoNewCustomer(page)

    await expect(fieldInput(page, /^Full name/i)).toHaveValue(name, { timeout: 5_000 })

    // Click the Undo toast action. Scope to the Sonner toaster portal so we
    // don't accidentally hit the RichTextEditor's `aria-label="Undo"` button
    // that ships with the form chrome.
    const toaster = page.locator('[data-sonner-toaster]')
    const undoButton = toaster
      .getByRole('button', { name: /undo|восстан|annuler|annulla|deshacer|desfazer|rückgängig|cofnij|元に戻す/i })
      .first()
    await expect(undoButton).toBeVisible({ timeout: 5_000 })
    await expect(undoButton).toBeEnabled()
    await undoButton.click()

    // Form reverts to empty default; storage is purged.
    await expect(fieldInput(page, /^Full name/i)).toHaveValue('')
    await expect.poll(async () => readDraft(page), { timeout: 5_000 }).toBeNull()
  })

  test('restored draft survives a background TanStack Query refetch', async ({ page }) => {
    // Regression for: form gets wiped to defaults when `useResource()` does
    // a background refetch (e.g. on window focus / stale time). The
    // hydration effect re-runs with a new `defaults` reference and used to
    // call `form.reset(defaults)` unconditionally, blowing away the draft
    // that had just been restored. The init-once-per-resource guard now
    // protects the form across all subsequent dep changes.
    const name = `Draft Refetch ${Date.now()}`
    await fieldInput(page, /^Full name/i).fill(name)
    await expect
      .poll(async () => (await readDraft(page))?.name, { timeout: 5_000 })
      .toBe(name)

    // Full reload so we exercise the same restore-on-mount path the user
    // hits when reopening the new-form route.
    await page.reload()
    await expect(fieldInput(page, /^Full name/i)).toHaveValue(name, { timeout: 5_000 })

    // Trigger a background refetch by dispatching a window-focus event.
    // TanStack Query's `refetchOnWindowFocus` (default true) catches this
    // and re-runs the resource query, which used to cascade into the
    // hydration effect via a new `defaults` reference.
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.waitForTimeout(150)
    }

    // Form value must still be the restored draft — not wiped to default.
    await expect(fieldInput(page, /^Full name/i)).toHaveValue(name)
  })

  test('successful submit clears the persisted draft', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const name = `Draft Submit ${suffix}`
    const email = `draft-submit-${suffix}@example.com`

    await fieldInput(page, /^Full name/i).fill(name)
    await fieldInput(page, /^Email/).fill(email)
    await expect
      .poll(async () => (await readDraft(page))?.name, { timeout: 5_000 })
      .toBe(name)

    // Submit via the sticky save button at the bottom of the page.
    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click()

    // After the API round-trip we land on the show page; the draft key must
    // have been cleared by the success path so the next /new visit is fresh.
    await page.waitForURL(/\/resources\/customers\/[^/]+$/, { timeout: 15_000 })
    expect(await readDraft(page)).toBeNull()
  })
})
