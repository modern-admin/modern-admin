import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * UI-level coverage for form widgets that don't fit into the generic
 * `edit-page.spec.ts` (which only drives the customers resource — plain
 * text + enum). These tests target the `products` resource because it
 * combines the interesting form-control surface area:
 *
 *   • `accentColor` — a custom component pair (`color-picker` editor /
 *     `color-swatch` show) registered in `apps/web/src/admin-components.tsx`.
 *   • `tags` — an m2m relation rendered as the *combobox* picker (the
 *     table-dialog variant lives in `m2m-picker-dialog.spec.ts`).
 *   • `inStock` — a boolean rendered as a Radix Switch.
 *
 * Every test creates and tears down its own product fixture so the seeded
 * counts other specs assert on stay stable.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface ProductFixture {
  id: string
  name: string
}

/** Create a throw-away product row via the REST API. */
async function createProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<ProductFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `E2E Product ${suffix}`
  const res = await request.post(adminApi('/resources/products/actions/new'), {
    data: { name, currencyCode: 'USD', inStock: false, ...overrides },
  })
  expect(res.ok(), `fixture product create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name }
}

async function deleteProductSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  // Best-effort cleanup — `delete` returns 404 if the row was already wiped
  // by the test body, which is fine.
  await request.delete(adminApi(`/resources/products/records/${id}/actions/delete`))
}

async function firstTag(request: APIRequestContext): Promise<{ id: string; title: string }> {
  const res = await request.get(adminApi('/resources/tags/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.records.length).toBeGreaterThan(0)
  const r = body.records[0]
  return { id: String(r.id), title: String(r.title ?? r.params?.name ?? r.id) }
}

/** Resolve the `[data-slot="field"]` wrapper for a labelled property. */
function fieldByLabel(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .first()
}

async function openProductEdit(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/products/${id}/edit`)
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('Form UI — custom color-picker component', () => {
  test('text input edits accentColor and PATCH carries the new value', async ({
    page,
    request,
  }) => {
    const product = await createProduct(request, { accentColor: '#111111' })
    const next = '#42a5f5'
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^accent color/i)
      await expect(field).toBeVisible()
      // The custom editor renders TWO inputs side-by-side: a native
      // `type=color` swatch and a free-form text input. Native color
      // pickers are flaky to drive in headless mode, so we fill the
      // text input — both inputs share `onChange` so the change still
      // commits identically.
      const textInput = field.locator('input[placeholder="#000000"]').first()
      await expect(textInput).toBeVisible()
      await textInput.fill(next)

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/records/${product.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).click()
      const patchRes = await patchPromise
      expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBeTruthy()
      const patchBody = await patchRes.json()
      expect(String(patchBody.record.params.accentColor).toLowerCase()).toBe(next)
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })

  test('show page renders the custom color-swatch component', async ({
    page,
    request,
  }) => {
    const accent = '#22c55e'
    const product = await createProduct(request, { accentColor: accent })
    try {
      await page.goto(`/resources/products/${product.id}`)
      // The show-page swatch component renders the hex string in
      // uppercase next to a colored chip. Match the uppercased value.
      await expect(page.getByText(accent.toUpperCase()).first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })
})

test.describe('Form UI — boolean Switch editor', () => {
  test('flipping inStock persists via PATCH', async ({ page, request }) => {
    const product = await createProduct(request, { inStock: false })
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^in stock/i)
      await expect(field).toBeVisible()
      // Radix Switch exposes role="switch". State is reflected through
      // `data-state` ("checked" / "unchecked") and the `aria-checked`
      // attribute Playwright reads via `.toBeChecked()`.
      const sw = field.getByRole('switch').first()
      await expect(sw).toBeVisible()
      await expect(sw).not.toBeChecked()
      await sw.click()
      await expect(sw).toBeChecked()

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/records/${product.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).click()
      const patchRes = await patchPromise
      expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBeTruthy()
      const patchBody = await patchRes.json()
      expect(Boolean(patchBody.record.params.inStock)).toBe(true)
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })
})

test.describe('Form UI — m2m combobox picker (products.tags)', () => {
  test('picking a tag chip adds it to the relation on Save', async ({
    page,
    request,
  }) => {
    const tag = await firstTag(request)
    const product = await createProduct(request)
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^tags$/i)
      await expect(field).toBeVisible()

      // Combobox picker exposes a single button with role="combobox".
      // Opening it mounts a Radix Popover with a Command list.
      const trigger = field.getByRole('combobox').first()
      await expect(trigger).toBeVisible()
      await trigger.click()

      // The popover renders into a portal as role="dialog" or a
      // Command-list container. Match the search input by its
      // i18n'd placeholder ("Search…" / localised variant).
      const searchInput = page.locator('[cmdk-input]').first()
      await expect(searchInput).toBeVisible({ timeout: 10_000 })
      // Narrow the option list to the known tag title to avoid clicking
      // a random first row when the seeded list is long.
      await searchInput.fill(tag.title)

      // Tag titles render as "<title> <id>" — match by title prefix.
      const option = page.locator('[cmdk-item]').filter({
        hasText: new RegExp(tag.title, 'i'),
      }).first()
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()

      // Close the popover so the click on Save isn't swallowed by an
      // outside-click handler on the popover overlay.
      await page.keyboard.press('Escape')

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/records/${product.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const patchRes = await patchPromise
      expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBeTruthy()
      const patchBody = await patchRes.json()
      // After the save the response carries the hydrated m2m relation.
      // Shape: tags is an array of { id, ...extras } objects.
      const tags = patchBody.record.params.tags
      expect(Array.isArray(tags)).toBe(true)
      const ids = (tags as Array<{ id: unknown }>).map((t) => String(t.id))
      expect(ids).toContain(tag.id)
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })

  test('chip remove button clears the relation on Save', async ({
    page,
    request,
  }) => {
    const tag = await firstTag(request)
    // Pre-seed the relation through the API so we know exactly one tag
    // is attached at the start; the chip-remove flow is what the test
    // exercises.
    const product = await createProduct(request, {
      tags: [{ id: tag.id }],
    })
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^tags$/i)
      // The chip exposes an aria-label on its remove button ("Remove
      // <title>"). Match by aria-label so we don't accidentally click
      // the popover trigger.
      const removeBtn = field.getByRole('button', { name: /^remove\b/i }).first()
      await expect(removeBtn).toBeVisible({ timeout: 10_000 })
      await removeBtn.click()

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/records/${product.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const patchRes = await patchPromise
      expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBeTruthy()
      const patchBody = await patchRes.json()
      const tags = patchBody.record.params.tags
      // After removal the relation is empty (some adapters serialise it
      // as an empty array, others omit the key entirely).
      const ids = Array.isArray(tags)
        ? (tags as Array<{ id: unknown }>).map((t) => String(t.id))
        : []
      expect(ids).not.toContain(tag.id)
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })
})
