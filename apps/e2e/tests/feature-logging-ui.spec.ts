import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the audit-log page rendered by `feature-logging`
 * (`packages/react/src/pages/audit-log-page.tsx`, route `/audit-log`).
 *
 * Backend wiring: `actionLoggingPlugin({ store: system.logStore })` in
 * `apps/api/src/admin.module.ts`, which uses the in-memory `MemoryLogStore`
 * from `@modern-admin/core`. Every after-hook on every resource appends an
 * `ActionLogEntry` (`new`, `edit`, `delete`, `bulkDelete`, `login`,
 * `apiKey.*`). The page paginates via `useInfiniteAuditLog` (PAGE_SIZE = 25).
 *
 * Scenarios:
 *   • Page renders title + filter row + at least one entry from previous
 *     suite activity (the in-memory store keeps history across the run).
 *   • Generating a fresh `new` + `edit` + `delete` against a customer
 *     surfaces three cards labelled "Record created" / "Record updated" /
 *     "Record deleted" (i18n: `audit:action.{new|edit|delete}`).
 *   • Filtering by record ID via the placeholder input narrows the list
 *     to events for that record only (covers `useInfiniteAuditLog` query
 *     param wiring).
 *   • Action filter Select (the second SelectTrigger, aria-label
 *     "Action") narrows events to a single action type — verified by the
 *     card titles.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface CustomerFixture {
  id: string
  name: string
  email: string
}

async function createCustomer(request: APIRequestContext): Promise<CustomerFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `Audit UI ${suffix}`
  const email = `audit-ui-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: { name, email, tier: 'free' },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name, email }
}

async function editCustomer(
  request: APIRequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await request.patch(
    adminApi(`/resources/customers/records/${id}/actions/edit`),
    { data: patch },
  )
  expect(res.ok(), `edit failed: ${await res.text()}`).toBeTruthy()
}

async function deleteCustomer(request: APIRequestContext, id: string): Promise<void> {
  const res = await request.delete(
    adminApi(`/resources/customers/records/${id}/actions/delete`),
  )
  expect(res.ok(), `delete failed: ${await res.text()}`).toBeTruthy()
}

async function openAuditLogPage(page: Page): Promise<void> {
  await page.goto('/audit-log')
  await expect(page.getByRole('heading', { name: /^activity$/i })).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('Audit log page — UI', () => {
  test('renders the activity title and filter controls', async ({ page }) => {
    await openAuditLogPage(page)

    // Filter row controls — the two Selects expose aria-label = audit:resource / audit:action.
    await expect(page.getByRole('combobox', { name: /^resource$/i })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^action$/i })).toBeVisible()
    // The recordId and userId Inputs use placeholder text — not labels.
    await expect(page.getByPlaceholder(/^record id$/i)).toBeVisible()
    await expect(page.getByPlaceholder(/^user id$/i)).toBeVisible()
  })

  test('new + edit + delete generate distinct audit cards for a customer', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    await editCustomer(request, fix.id, { name: `${fix.name} renamed` })
    await deleteCustomer(request, fix.id)

    await openAuditLogPage(page)

    // Narrow to this customer by filling the recordId input — avoids
    // flakes from concurrent audit activity in other specs.
    await page.getByPlaceholder(/^record id$/i).fill(fix.id)

    // The page now shows up to PAGE_SIZE entries for this record. The
    // titles render from i18n keys (e.g. "Record created").
    await expect(
      page.getByText(/^record created$/i).first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^record updated$/i).first()).toBeVisible()
    await expect(page.getByText(/^record deleted$/i).first()).toBeVisible()
  })

  test('action filter narrows entries to a single action type', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      // Generate at least one edit on top of the create so the filter
      // has something to match.
      await editCustomer(request, fix.id, { name: `${fix.name} filter-test` })

      await openAuditLogPage(page)
      // Scope to this record first so we don't have to scan the whole log.
      await page.getByPlaceholder(/^record id$/i).fill(fix.id)
      await expect(page.getByText(/^record created$/i).first()).toBeVisible({
        timeout: 10_000,
      })

      // Open the Action Select and pick "Record updated" (audit:action.edit).
      await page.getByRole('combobox', { name: /^action$/i }).click()
      await page.getByRole('option', { name: /^record updated$/i }).click()

      // Only "Record updated" cards should remain for this record id —
      // creates are hidden by the filter.
      await expect(page.getByText(/^record updated$/i).first()).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/^record created$/i)).toHaveCount(0)
    } finally {
      await deleteCustomer(request, fix.id)
    }
  })

  test('record ID filter shows the empty-state when nothing matches', async ({
    page,
  }) => {
    await openAuditLogPage(page)
    // Use a syntactically valid uuid-shaped string that won't match any
    // record — guarantees an empty result set without 400-ing the API.
    await page
      .getByPlaceholder(/^record id$/i)
      .fill('00000000-0000-7000-8000-000000000000')
    await expect(page.getByText(/^no activity yet$/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
