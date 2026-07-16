import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'

/**
 * End-to-end coverage for `feature-password`
 * (`packages/feature-password/src/passwords-feature.ts`).
 *
 * The reference customers controller opts in to the feature with
 *   passwordsFeature({
 *     properties: { encryptedPassword: 'password', password: 'newPassword' },
 *     hash: (plain) => Bun.password.hash(plain, 'argon2id'),
 *   })
 * (`apps/_shared/src/admin/customers/customers.controller.ts`).
 *
 * The plugin:
 *   1. Hides the encrypted `password` column from list / show / edit / filter.
 *   2. Surfaces a virtual `newPassword` field as `type: 'password'`
 *      (rendered by `PropertyEditor` → `PasswordInput`, an
 *      `<input type="password">` with a visibility toggle button).
 *   3. Installs `before` hooks on `new` / `edit` that hash the virtual value,
 *      write it to the encrypted column, and strip the virtual field from
 *      the payload before it reaches the adapter.
 *   4. Empty virtual value on `edit` is treated as "don't change" — the
 *      existing hash stays untouched.
 *
 * Scenarios:
 *   • Edit page renders the `newPassword` field as a password input.
 *   • The encrypted `password` field is NOT rendered on the edit page.
 *   • The encrypted `password` field is NOT rendered on the show page.
 *   • Submitting the form with a new password value: PATCH succeeds, the
 *     server-side hash for that customer changes (we read the raw record via
 *     the REST `show` endpoint — the visibility flag only suppresses the UI,
 *     the value still travels in the JSON).
 *   • Submitting the form leaving `newPassword` empty does NOT overwrite the
 *     existing hash.
 *   • Re-opening the edit page after a successful save shows an empty
 *     `newPassword` input — the plaintext value is never echoed.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

// The encrypted `password` column is `isAccessible: false`, so the API never
// serialises it (by design — the hash must not ship in record JSON, history,
// or realtime payloads). To assert the hash actually changes (or doesn't), we
// read the column straight from Postgres. `DATABASE_URL` is set by CI and
// resolved from `apps/api-prisma/.env` for local runs (see playwright.config).
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error(
    'feature-password-ui.spec needs DATABASE_URL to read the hashed password ' +
      'column directly (the API intentionally never exposes it).',
  )
}
// Strip Prisma-only query params (`?schema=…`) that postgres.js would forward
// as unknown startup parameters and reject.
const pgUrl = new URL(DATABASE_URL)
pgUrl.searchParams.delete('schema')
const sql = postgres(pgUrl.toString(), { max: 2 })
test.afterAll(async () => {
  await sql.end({ timeout: 5 })
})

interface CustomerFixture {
  id: string
  email: string
  initialHash: string
}

/** Create a customer with a known initial password so we can later assert
 *  the encrypted column actually changes (or doesn't) after each save. */
async function createCustomer(request: APIRequestContext): Promise<CustomerFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `password-fixture-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: {
      name: `Password Fixture ${suffix}`,
      email,
      tier: 'free',
      // Goes through the same `passwordsFeature` before hook on `new`, so the
      // adapter stores an argon2id hash, not the plaintext literal.
      newPassword: 'OriginalSecret123!',
    },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  const id = String(body.record.id)
  const initialHash = await readPasswordHash(id)
  // Sanity: the feature hook ran and an argon2id hash landed in the column.
  expect(initialHash.length).toBeGreaterThan(0)
  expect(initialHash).not.toBe('OriginalSecret123!')
  return { id, email, initialHash }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

/** Read the argon2id hash straight from the `customer.password` column. The
 *  API never exposes it (`isAccessible: false`), so a direct DB read is the
 *  only way to assert the stored hash mutates correctly. Returns '' when the
 *  column is null/absent. */
async function readPasswordHash(id: string): Promise<string> {
  const rows = await sql<{ password: string | null }[]>`
    SELECT password FROM customer WHERE id = ${id}
  `
  const raw = rows[0]?.password
  return typeof raw === 'string' ? raw : ''
}

async function openCustomerEdit(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/customers/${id}/edit`)
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

async function openCustomerShow(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/customers/${id}`)
  // Show page mounts the header buttons (Edit, Delete) once the record is loaded.
  await expect(page.getByRole('link', { name: /^edit$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

/** Find a Field wrapper by its visible label. Inputs in the generated form
 *  carry no `name`/`id` attributes, so we scope by the surrounding
 *  `[data-slot="field"]` whose label matches. Trailing `*` is the required
 *  indicator added by edit-page when `isRequired` is true. */
function fieldByLabel(page: Page, label: RegExp): Locator {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: label }),
    })
    .first()
}

test.describe('feature-password — UI surface', () => {
  test('edit page renders newPassword as a password input', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerEdit(page, fix.id)

      const newPwField = fieldByLabel(page, /^new\s*password\*?$/i)
      await expect(newPwField).toBeVisible({ timeout: 5_000 })

      // PasswordInput renders <input type="password"> by default — the
      // visibility toggle flips it to "text" only when the user clicks the
      // eye button.
      const input = newPwField.locator('input').first()
      await expect(input).toHaveAttribute('type', 'password')

      // Toggle button is part of the PasswordInput component — its
      // accessible name is the i18n'd "Show password" label.
      const toggle = newPwField.getByRole('button', { name: /show password/i })
      await expect(toggle).toBeVisible()
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('encrypted password field is absent from edit page', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerEdit(page, fix.id)

      // No field-label should be just "Password" — only "New password".
      // The feature flips `isVisible.edit = false` on the encrypted column.
      const passwordLabels = page
        .locator('[data-slot="field-label"]')
        .filter({ hasText: /^password\*?$/i })
      await expect(passwordLabels).toHaveCount(0)

      // And no <input type="password"> sourced from the encrypted column
      // should leak the hash — the only password-typed input is the empty
      // newPassword virtual field.
      const allPasswordInputs = page.locator('input[type="password"]')
      const count = await allPasswordInputs.count()
      for (let i = 0; i < count; i++) {
        await expect(allPasswordInputs.nth(i)).toHaveValue('')
      }
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('encrypted password field is absent from show page', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerShow(page, fix.id)

      // Show page never renders the encrypted column. The argon2 hash starts
      // with "$argon2id$" — make absolutely sure that sequence doesn't appear
      // anywhere on the page.
      const main = page.locator('main').first()
      await expect(main).not.toContainText('$argon2id$', { timeout: 5_000 })
      // newPassword has isVisible.show = false too (virtual fields aren't
      // shown), so there's no "New password" header on the show page either.
      const passwordHeadings = main.getByText(/^(new\s*)?password$/i)
      await expect(passwordHeadings).toHaveCount(0)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('submitting newPassword changes the stored hash', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerEdit(page, fix.id)

      const newPwField = fieldByLabel(page, /^new\s*password\*?$/i)
      const input = newPwField.locator('input').first()
      await input.fill('BrandNewSecret456!')

      // Wait for the PATCH to settle, then double-check the hash changed
      // server-side. Save is the first button labelled exactly "Save".
      const savePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/resources/customers/records/${fix.id}/actions/edit`) &&
          res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const saveRes = await savePromise
      expect(
        saveRes.ok(),
        `save failed: ${saveRes.status()} ${await saveRes.text()}`,
      ).toBeTruthy()

      // The before-hook strips `newPassword` from the payload, so the echoed
      // record never carries the plaintext value — and the encrypted hash is
      // `isAccessible: false`, so it isn't in the response either.
      const body = await saveRes.json()
      expect(body.record.params.newPassword).toBeUndefined()
      expect(body.record.params.password).toBeUndefined()

      // Read the stored hash straight from the column: it must be a fresh
      // argon2id hash, not the old one and never the plaintext.
      const newHash = await readPasswordHash(fix.id)
      expect(newHash.length).toBeGreaterThan(0)
      expect(newHash).not.toBe(fix.initialHash)
      expect(newHash).not.toBe('BrandNewSecret456!')
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('saving with empty newPassword leaves existing hash untouched', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerEdit(page, fix.id)

      // Don't touch newPassword — just tweak the bio so the form is "dirty"
      // and the Save button posts something. The before-hook treats empty
      // newPassword as "don't change the hash".
      // Dirty the form by appending to the Full name field — it's a plain
      // text input, far less fragile than the richtext Bio editor. We do
      // NOT touch newPassword, so the password-hook's "empty → don't change
      // hash" branch is the one under test.
      const nameField = fieldByLabel(page, /^full name\*?$/i)
      const nameInput = nameField.locator('input').first()
      await nameInput.click()
      await page.keyboard.press('End')
      await page.keyboard.type(' (edited)')

      const savePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/resources/customers/records/${fix.id}/actions/edit`) &&
          res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      const saveRes = await savePromise
      expect(saveRes.ok()).toBeTruthy()

      const afterHash = await readPasswordHash(fix.id)
      // The hook deletes the encrypted column from the payload when the
      // virtual field is empty, so the adapter leaves the stored hash alone.
      expect(afterHash).toBe(fix.initialHash)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('re-opening the edit page after save shows an empty newPassword input', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      // First save: change the password through the UI.
      await openCustomerEdit(page, fix.id)
      const firstInput = fieldByLabel(page, /^new\s*password\*?$/i)
        .locator('input')
        .first()
      await firstInput.fill('RoundTripSecret789!')
      const savePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/resources/customers/records/${fix.id}/actions/edit`) &&
          res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /^save$/i }).first().click()
      expect((await savePromise).ok()).toBeTruthy()

      // Hard reload the edit page — virtual field has no DB column to read
      // from, so the input must come up empty even though a hash is stored.
      await page.goto(`/resources/customers/${fix.id}/edit`)
      await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
        timeout: 15_000,
      })
      const reopened = fieldByLabel(page, /^new\s*password\*?$/i)
        .locator('input')
        .first()
      await expect(reopened).toHaveValue('')
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })
})
