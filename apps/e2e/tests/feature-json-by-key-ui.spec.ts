import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/**
 * End-to-end coverage for `feature-json-by-key`
 * (`packages/feature-json-by-key/src/json-by-key-feature.ts`).
 *
 * The reference `regionalContent` resource opts in with:
 *
 *   jsonByKeyFeature({
 *     controlField: 'region',
 *     keys: ['eu', 'us', 'asia'],
 *     defaultKey: 'eu',
 *     properties: {
 *       titles:   { child: { type: 'string', isRequired: true },
 *                   label: (key) => `Title — ${REGION_LABELS[key] ?? key}` },
 *       previews: { child: { type: 'file', upload: {...} },
 *                   label: (key) => `Preview — ${REGION_LABELS[key] ?? key}` },
 *     },
 *   })
 *
 * (`apps/_shared/src/admin/regional/regional-content.controller.ts`).
 *
 * Behaviour exercised:
 *   • The raw JSON `titles` / `previews` properties are hidden — only the
 *     virtual `titles__eu`, `previews__us`, … fields are rendered.
 *   • `showWhen` makes only the virtuals matching the currently-selected
 *     region visible. Switching the region Select swaps the rendered
 *     virtual fields.
 *   • Pre-existing JSON values (`titles.eu`) round-trip to the edit form's
 *     "Title — Europe" input.
 *   • Saving a new value through the visible virtual collapses back into
 *     the JSON column server-side (verified via the show endpoint), and
 *     other keys in the same column are preserved (no zero-out).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface RegionalFixture {
  id: string
  name: string
  initialEuTitle: string
  initialUsTitle: string
  initialAsiaTitle: string
}

async function createRegionalContent(
  request: APIRequestContext,
): Promise<RegionalFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `JsonByKey Fixture ${suffix}`
  const initialEuTitle = `EU initial ${suffix}`
  const initialUsTitle = `US initial ${suffix}`
  const initialAsiaTitle = `Asia initial ${suffix}`
  const res = await request.post(adminApi('/resources/regionalContent/actions/new'), {
    data: {
      name,
      region: 'eu',
      titles: {
        eu: initialEuTitle,
        us: initialUsTitle,
        asia: initialAsiaTitle,
      },
    },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return {
    id: String(body.record.id),
    name,
    initialEuTitle,
    initialUsTitle,
    initialAsiaTitle,
  }
}

async function deleteRegionalSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/regionalContent/records/${id}/actions/delete`))
}

async function readTitles(
  request: APIRequestContext,
  id: string,
): Promise<Record<string, string>> {
  const res = await request.get(
    adminApi(`/resources/regionalContent/records/${id}/actions/show`),
  )
  expect(res.ok(), `read titles failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  const raw = body.record.params.titles
  return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {}
}

async function openRegionalEdit(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/regionalContent/${id}/edit`)
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

/** Same label-scoped selector pattern as the other UI specs — form inputs
 *  in the generated form carry no `name`/`id` attribute, so we locate by
 *  the surrounding `[data-slot="field"]` whose label matches. */
function fieldByLabel(page: Page, label: RegExp): Locator {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: label }),
    })
    .first()
}

test.describe('feature-json-by-key — UI', () => {
  test('only the eu virtuals are visible on initial load (defaultKey="eu")', async ({
    page,
    request,
  }) => {
    const fix = await createRegionalContent(request)
    try {
      await openRegionalEdit(page, fix.id)

      // "Title — Europe" is rendered and pre-populated with the JSON value.
      const euTitleField = fieldByLabel(page, /^title — europe\*?$/i)
      await expect(euTitleField).toBeVisible({ timeout: 5_000 })
      await expect(euTitleField.locator('input').first()).toHaveValue(
        fix.initialEuTitle,
      )

      // The other-region virtuals are unmounted by `showWhen` — their
      // field labels must not be present in the DOM at all.
      await expect(
        page.locator('[data-slot="field-label"]').filter({ hasText: /^title — united states\*?$/i }),
      ).toHaveCount(0)
      await expect(
        page.locator('[data-slot="field-label"]').filter({ hasText: /^title — asia-pacific\*?$/i }),
      ).toHaveCount(0)
    } finally {
      await deleteRegionalSilently(request, fix.id)
    }
  })

  test('raw JSON `titles` / `previews` properties are hidden from the form', async ({
    page,
    request,
  }) => {
    const fix = await createRegionalContent(request)
    try {
      await openRegionalEdit(page, fix.id)

      // `isVisible: false` on the source properties — no field-label may
      // surface just "Titles" or "Previews" in the form.
      await expect(
        page.locator('[data-slot="field-label"]').filter({ hasText: /^titles\*?$/i }),
      ).toHaveCount(0)
      await expect(
        page.locator('[data-slot="field-label"]').filter({ hasText: /^previews\*?$/i }),
      ).toHaveCount(0)
    } finally {
      await deleteRegionalSilently(request, fix.id)
    }
  })

  test('switching the region Select swaps which virtual fields are visible', async ({
    page,
    request,
  }) => {
    const fix = await createRegionalContent(request)
    try {
      await openRegionalEdit(page, fix.id)

      // The region enum is rendered as a shadcn Select trigger inside the
      // Field whose label is "Region". The Select trigger uses
      // `role=combobox`.
      const regionField = fieldByLabel(page, /^region\*?$/i)
      await regionField.getByRole('combobox').click()
      // Option labels render from the enum values directly ("us").
      await page.getByRole('option', { name: /^us$/i }).click()

      // "Title — United States" should now be present and pre-populated;
      // the eu field disappears.
      const usTitleField = fieldByLabel(page, /^title — united states\*?$/i)
      await expect(usTitleField).toBeVisible({ timeout: 5_000 })
      await expect(usTitleField.locator('input').first()).toHaveValue(
        fix.initialUsTitle,
      )
      await expect(
        page.locator('[data-slot="field-label"]').filter({ hasText: /^title — europe\*?$/i }),
      ).toHaveCount(0)
    } finally {
      await deleteRegionalSilently(request, fix.id)
    }
  })

  test('saving a virtual collapses back into the JSON column without losing other keys', async ({
    page,
    request,
  }) => {
    const fix = await createRegionalContent(request)
    const newEuTitle = `EU updated ${Date.now()}`
    try {
      await openRegionalEdit(page, fix.id)
      const euTitleField = fieldByLabel(page, /^title — europe\*?$/i)
      await euTitleField.locator('input').first().fill(newEuTitle)

      const savePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/resources/regionalContent/records/${fix.id}/actions/edit`) &&
          res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const saveRes = await savePromise
      expect(
        saveRes.ok(),
        `save failed: ${saveRes.status()} ${await saveRes.text()}`,
      ).toBeTruthy()

      // Server-side check: the JSON column now has the new value AND the
      // untouched keys (us/asia) are preserved by the writeBeforeHook —
      // proving the feature's collapse logic merges rather than overwrites.
      const titles = await readTitles(request, fix.id)
      expect(titles.eu).toBe(newEuTitle)
      expect(titles.us).toBe(fix.initialUsTitle)
      expect(titles.asia).toBe(fix.initialAsiaTitle)
    } finally {
      await deleteRegionalSilently(request, fix.id)
    }
  })
})
