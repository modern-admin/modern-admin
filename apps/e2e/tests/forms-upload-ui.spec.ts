import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the `feature-upload` plugin via the products
 * resource (configured in `apps/_shared/src/admin/products/products.controller.ts`
 * with a `LocalUploadProvider` writing to `<cwd>/uploads`).
 *
 * Surface area exercised:
 *   • Single-value file field (`products.thumbnail`) — upload, file row
 *     appears, Save persists the storage key, show-page renders preview.
 *   • Multi-value file array (`products.gallery`) — batch upload of two
 *     files, two list rows, Save persists the key array.
 *   • Remove file before Save — pending-cancel DELETE round-trip, field
 *     clears to null after Save.
 *
 * Why this matters: the upload feature is wired into the reference app
 * but until this spec no e2e ran the controller end-to-end. Earlier
 * regressions (key generator, registry lookup) only surfaced via the
 * unit tests in `packages/feature-upload/test`.
 *
 * Fixtures: every test creates and tears down its own product through
 * the REST API so seeded counts don't drift.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

// 1×1 transparent PNG. Smallest valid payload we can synthesise inline
// without depending on `node:fs` — `setInputFiles({ buffer })` requires
// at least a non-empty body for the multipart boundary to be useful.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
const PNG_1X1 = Buffer.from(PNG_1X1_BASE64, 'base64')

interface ProductFixture {
  id: string
  name: string
}

async function createProduct(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<ProductFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `Upload Test ${suffix}`
  const res = await request.post(adminApi('/resources/products/actions/new'), {
    data: { name, currencyCode: 'USD', inStock: false, ...overrides },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name }
}

async function deleteProductSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/products/records/${id}/actions/delete`))
}

function fieldByLabel(page: Page, labelPattern: RegExp): Locator {
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

/** Wait for an in-flight upload to fully complete: the POST returns and the
 *  pending row disappears (replaced by a permanent file row). */
async function waitForUploadComplete(
  page: Page,
  field: Locator,
  _pngFilename: string,
): Promise<void> {
  // The persisted file row truncates to the storage key's basename. The
  // freshly-uploaded one keeps the original filename until the form is
  // re-loaded — match either by including the .png suffix.
  await expect(field.getByText(/\.png$/).first()).toBeVisible({ timeout: 10_000 })
  // Pending row carries an explicit progressbar that vanishes when the
  // upload settles. Avoid `toHaveCount(0)` — the row is removed from the
  // DOM, so a Locator count check is the correct readiness signal.
  await expect(field.locator('[role="progressbar"]')).toHaveCount(0, {
    timeout: 10_000,
  })
}

test.describe('Upload UI — single-value file (products.thumbnail)', () => {
  test('upload → file row appears → Save persists the storage key', async ({
    page,
    request,
  }) => {
    const product = await createProduct(request)
    try {
      await openProductEdit(page, product.id)

      // i18n'd label — see `packages/i18n/src/locales/en.ts` keys for the
      // products resource. Default label generator turns `thumbnail`
      // into "Thumbnail image" via the registered override.
      const field = fieldByLabel(page, /^thumbnail image$/i)
      await expect(field).toBeVisible()

      // The visible drop zone is purely a `role="button"`. The actual file
      // picker is a `sr-only` hidden `<input type="file">` inside the
      // field wrapper; `setInputFiles` works on hidden inputs.
      const fileInput = field.locator('input[type="file"]').first()
      const filename = `thumb-${Date.now()}.png`

      // Watch for the upload POST so we can capture the returned key
      // before the field re-renders.
      const uploadPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/actions/upload`,
          ) && res.request().method() === 'POST',
      )
      await fileInput.setInputFiles({
        name: filename,
        mimeType: 'image/png',
        buffer: PNG_1X1,
      })
      const uploadRes = await uploadPromise
      expect(uploadRes.ok(), `upload failed: ${await uploadRes.text()}`).toBeTruthy()
      const uploadBody = (await uploadRes.json()) as Array<{ key: string; url: string }>
      const uploadedKey = uploadBody[0]!.key
      expect(uploadedKey).toMatch(/products\/thumbnails\/.+\.png$/)

      await waitForUploadComplete(page, field, filename)

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
      expect(patchBody.record.params.thumbnail).toBe(uploadedKey)
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })

  test('removing the file before Save persists null', async ({ page, request }) => {
    const product = await createProduct(request)
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^thumbnail image$/i)
      const fileInput = field.locator('input[type="file"]').first()
      const filename = `to-remove-${Date.now()}.png`

      const uploadPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/actions/upload') && res.request().method() === 'POST',
      )
      await fileInput.setInputFiles({
        name: filename,
        mimeType: 'image/png',
        buffer: PNG_1X1,
      })
      await uploadPromise
      await waitForUploadComplete(page, field, filename)

      // Clicking Remove cancels the still-pending upload (DELETE) and
      // resets the field's value to null. Clicking Save after that
      // persists the null.
      const cancelPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/actions/upload') &&
          res.request().method() === 'DELETE',
      )
      await field.getByRole('button', { name: /^remove file$/i }).first().click()
      const cancelRes = await cancelPromise
      expect(cancelRes.status()).toBe(204)

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/products/records/${product.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const patchRes = await patchPromise
      expect(patchRes.ok()).toBeTruthy()
      const patchBody = await patchRes.json()
      // Adapters may persist `null` or omit the key entirely; both
      // semantically mean "no thumbnail".
      expect(patchBody.record.params.thumbnail ?? null).toBeNull()
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })

  test('show page renders an image preview for an uploaded thumbnail', async ({
    page,
    request,
  }) => {
    // Pre-seed the field with a real upload via the API so the show-page
    // assertion doesn't depend on the editor doing its job.
    const product = await createProduct(request)
    try {
      // 1. Push the file through the upload endpoint to get a real key.
      const upload = await request.post(
        adminApi('/resources/products/actions/upload?field=thumbnail'),
        {
          multipart: {
            files: {
              name: 'preview.png',
              mimeType: 'image/png',
              buffer: PNG_1X1,
            },
          },
        },
      )
      expect(upload.ok(), `upload failed: ${await upload.text()}`).toBeTruthy()
      const uploadInfo = (await upload.json()) as Array<{ key: string; url: string }>
      const key = uploadInfo[0]!.key
      // 2. Persist the key onto the product so it isn't reaped as pending.
      const patch = await request.patch(
        adminApi(`/resources/products/records/${product.id}/actions/edit`),
        { data: { thumbnail: key } },
      )
      expect(patch.ok(), `patch failed: ${await patch.text()}`).toBeTruthy()

      await page.goto(`/resources/products/${product.id}`)
      // PropertyDisplay for `type:'file'` renders a <MediaPreview>: a
      // "Preview" button next to the public URL text. The actual <img>
      // only mounts after the preview dialog is opened.
      // First — find the URL printed next to the trigger.
      await expect(page.getByText(key).first()).toBeVisible({ timeout: 10_000 })
      // Then — open the dialog and check the image renders.
      await page
        .getByRole('button', { name: /^preview$/i })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const img = dialog.locator(`img[src$="${key}"]`).first()
      await expect(img).toBeVisible({ timeout: 10_000 })
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })
})

test.describe('Upload UI — multi-value gallery (products.gallery)', () => {
  test('batch upload of two files renders two list rows and Save persists the array', async ({
    page,
    request,
  }) => {
    const product = await createProduct(request)
    try {
      await openProductEdit(page, product.id)

      const field = fieldByLabel(page, /^gallery$/i)
      await expect(field).toBeVisible()

      const fileInput = field.locator('input[type="file"]').first()
      const names = [`g1-${Date.now()}.png`, `g2-${Date.now()}.png`]

      // The frontend sends each file in its own POST; track responses
      // by awaiting until two POSTs have completed.
      const uploads: Array<Promise<unknown>> = [
        page.waitForResponse(
          (res) =>
            res.url().includes('/actions/upload') &&
            res.request().method() === 'POST',
        ),
        page.waitForResponse(
          (res) =>
            res.url().includes('/actions/upload') &&
            res.request().method() === 'POST',
          { timeout: 15_000 },
        ),
      ]
      await fileInput.setInputFiles(
        names.map((name) => ({
          name,
          mimeType: 'image/png',
          buffer: PNG_1X1,
        })),
      )
      await Promise.all(uploads)

      // Two persistent file rows should be on screen once both uploads
      // settle. The list is a <ul> of rows; each row contains the
      // filename. Match by filename suffix.
      await expect(field.locator('li').filter({ hasText: /\.png$/ })).toHaveCount(
        2,
        { timeout: 15_000 },
      )
      // No pending rows left.
      await expect(field.locator('[role="progressbar"]')).toHaveCount(0)

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
      const gallery = patchBody.record.params.gallery
      expect(Array.isArray(gallery)).toBe(true)
      expect((gallery as string[]).length).toBe(2)
      for (const key of gallery as string[]) {
        expect(key).toMatch(/products\/gallery\/.+\.png$/)
      }
    } finally {
      await deleteProductSilently(request, product.id)
    }
  })
})
