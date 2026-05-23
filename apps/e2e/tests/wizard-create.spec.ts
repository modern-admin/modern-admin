import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Wizard-style create page — `/resources/products/new` is wired in
 * `packages/react/src/admin-router.tsx` (`ProductsNewPage`) to render
 * `<ResourceWizardCreatePage>` with three steps:
 *
 *   1. Basic info     — name, sku, inStock
 *   2. Pricing        — price, currencyCode, quantity
 *   3. Media & tags   — catch-all for everything else
 *
 * Verifies:
 *   • The first step renders and "Next" advances only after the step's
 *     fields validate.
 *   • Clicking "Create" on the final step fires a POST to the canonical
 *     resource action URL and lands on the new record's show page.
 *
 * Created products are cleaned up via the API in `finally`.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** Resolve the input inside the named Field-slotted wrapper. */
function fieldInput(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .locator('input')
    .first()
}

test.describe('Wizard create page (/resources/products/new)', () => {
  test('renders the three-step indicator on first paint', async ({ page }) => {
    await page.goto('/resources/products/new')
    // The step labels are the i18n keys `wizard:products.step{1,2,3}` —
    // rendered above the form. They are only shown on `sm:` and up, so
    // assert against the desktop viewport which Playwright uses by default.
    // `exact: true` keeps us off the mobile-only "Step 1 of 3 · Basic info"
    // summary that lives in the same DOM tree.
    await expect(
      page.getByText('Basic info', { exact: true }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Pricing', { exact: true })).toBeVisible()
    await expect(page.getByText('Media & tags', { exact: true })).toBeVisible()

    // First-step controls present. The i18n label for the `name` property is
    // "Product name" (see apps/web/src/locales/en.ts).
    await expect(fieldInput(page, /Product name/i)).toBeVisible()

    // Final-step "Create" button isn't rendered yet — only "Next" + "Cancel".
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toHaveCount(0)
  })

  test('Next blocks advancement when the current step has invalid fields', async ({ page }) => {
    await page.goto('/resources/products/new')
    await expect(fieldInput(page, /Product name/i)).toBeVisible({ timeout: 10_000 })

    // Click Next without filling the required Name → validation fails,
    // step indicator stays on step 1 (Pricing fields stay hidden).
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText(/is required/i).first()).toBeVisible({ timeout: 5_000 })
    // Pricing fields belong to step 2 — they must NOT be in the DOM yet.
    await expect(fieldInput(page, /^Price/i)).toHaveCount(0)
  })

  test('walks through every step and creates a product', async ({ page, request }) => {
    await page.goto('/resources/products/new')
    await expect(fieldInput(page, /Product name/i)).toBeVisible({ timeout: 10_000 })

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `Wizard ${suffix}`
    let createdId: string | null = null

    try {
      // ── Step 1: Basic info ────────────────────────────────────────────
      await fieldInput(page, /Product name/i).fill(name)
      await page.getByRole('button', { name: 'Next' }).click()

      // ── Step 2: Pricing ───────────────────────────────────────────────
      const priceInput = fieldInput(page, /^Price/i)
      await expect(priceInput).toBeVisible({ timeout: 5_000 })
      await priceInput.fill('19.99')
      await page.getByRole('button', { name: 'Next' }).click()

      // ── Step 3: Media & tags (catch-all — nothing strictly required) ──
      const createBtn = page.getByRole('button', { name: 'Create' })
      await expect(createBtn).toBeVisible({ timeout: 5_000 })

      const postPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/admin/api/resources/products/actions/new') &&
          res.request().method() === 'POST',
        { timeout: 10_000 },
      )
      await createBtn.click()

      const postRes = await postPromise
      expect(postRes.ok(), `POST failed: ${await postRes.text().catch(() => '')}`).toBeTruthy()
      const body = await postRes.json()
      createdId = String(body.record.id)
      expect(body.record.params.name).toBe(name)
      expect(Number(body.record.params.price)).toBeCloseTo(19.99, 2)

      // Show-page redirect after a successful create.
      await expect(page).toHaveURL(
        new RegExp(`/resources/products/${createdId}$`),
        { timeout: 10_000 },
      )
    } finally {
      if (createdId) {
        await cleanupProduct(request, createdId)
      }
    }
  })
})

async function cleanupProduct(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(adminApi(`/resources/products/records/${id}/actions/delete`))
}
