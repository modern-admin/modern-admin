import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the Webhooks section of the settings page
 * (`packages/react/src/pages/settings-page.tsx` → `WebhooksSection`,
 * mounted at `/settings/webhooks`).
 *
 * Backend wiring lives in `packages/nest/src/webhooks.controller.ts`:
 *   • GET    /admin/api/webhooks
 *   • POST   /admin/api/webhooks
 *   • PATCH  /admin/api/webhooks/:id
 *   • DELETE /admin/api/webhooks/:id
 *   • POST   /admin/api/webhooks/:id/test
 *   • GET    /admin/api/webhooks/:id/deliveries
 *
 * The reference in-memory backend wires `system.webhookStore` (an
 * in-memory implementation from `@modern-admin/core` → `createMemorySystem`)
 * so the controller is fully functional — no Redis / dispatcher required.
 *
 * Scenarios:
 *   • Empty state — the section renders the "No webhooks yet" placeholder
 *     when the store is empty (we delete every webhook before the test).
 *   • Create flow — click "New webhook", fill name + URL, save → row
 *     appears in the table with the correct name / URL / event badges.
 *   • Test dispatch — click "Test" on a row → POST .../test fires, success
 *     toast appears, the deliveries card mounts with the test entry.
 *   • Edit flow — click the pencil button on a row → editor opens
 *     pre-populated, change the name, save → row updates.
 *   • Delete flow — click the trash button → confirm dialog → DELETE fires
 *     and the row disappears.
 *
 * Webhook fixtures are created/deleted via the same REST endpoints the UI
 * uses, so no positional ordering assumptions are needed.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface WebhookRecord {
  id: string
  name: string
  url: string
}

/** Delete every webhook in the store. Useful for hermetic empty-state tests
 *  and for general cleanup of leftovers from previous runs. */
async function purgeWebhooks(request: APIRequestContext): Promise<void> {
  const res = await request.get(adminApi('/webhooks'))
  if (!res.ok()) return
  const body = await res.json()
  const items: WebhookRecord[] = body.webhooks ?? []
  for (const item of items) {
    await request.delete(adminApi(`/webhooks/${encodeURIComponent(item.id)}`))
  }
}

async function createWebhookFixture(
  request: APIRequestContext,
  suffix: string,
): Promise<WebhookRecord> {
  const name = `Fixture Webhook ${suffix}`
  const res = await request.post(adminApi('/webhooks'), {
    data: {
      name,
      url: `https://example.com/hook/${suffix}`,
      events: ['record.created', 'record.updated'],
      enabled: true,
      headers: {},
      filters: {},
      payloadFields: [],
    },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return {
    id: String(body.webhook.id),
    name: body.webhook.name,
    url: body.webhook.url,
  }
}

async function deleteWebhookSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/webhooks/${encodeURIComponent(id)}`))
}

async function openWebhooksSection(page: Page): Promise<void> {
  await page.goto('/settings/webhooks')
  await expect(
    page.getByRole('heading', { name: 'Webhooks', exact: true }),
  ).toBeVisible({ timeout: 15_000 })
}

test.describe('Webhooks settings — UI', () => {
  test('empty-state renders when no webhooks exist', async ({ page, request }) => {
    await purgeWebhooks(request)
    await openWebhooksSection(page)

    // `settings:webhooks.empty.title` = "No webhooks yet".
    await expect(page.getByText(/^no webhooks yet$/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/create a webhook to notify/i)).toBeVisible()

    // The "New webhook" trigger is the only primary button in the section.
    await expect(
      page.getByRole('button', { name: /^new webhook$/i }),
    ).toBeVisible()
  })

  test('create flow adds a row to the table', async ({ page, request }) => {
    await purgeWebhooks(request)
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `UI Created ${suffix}`
    const url = `https://example.com/created/${suffix}`
    let createdId: string | null = null

    try {
      await openWebhooksSection(page)
      await page.getByRole('button', { name: /^new webhook$/i }).click()

      // The editor opens as a Radix Dialog. The title differs for create vs edit.
      const dialog = page.getByRole('dialog', { name: /^new webhook$/i })
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // The form inputs in the dialog don't expose labels via `for=`, so we
      // locate by the position within the wrapping `<div class="space-y-1.5">`.
      // Name = first text input, URL = first url input.
      await dialog.locator('input[type="text"]').first().fill(name)
      await dialog.locator('input[type="url"]').first().fill(url)

      // Defaults: events `record.created` + `record.updated` are pre-checked.
      // No need to touch them.
      const createPromise = page.waitForResponse(
        (res) => res.url().endsWith('/admin/api/webhooks') && res.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: /^save$/i }).click()
      const createRes = await createPromise
      expect(
        createRes.ok(),
        `create webhook failed: ${createRes.status()} ${await createRes.text()}`,
      ).toBeTruthy()
      const created = await createRes.json()
      createdId = String(created.webhook.id)

      // Dialog auto-closes on success.
      await expect(dialog).toBeHidden({ timeout: 5_000 })

      // The new row is in the table — find by unique name.
      const row = page.locator('tbody tr').filter({ hasText: name })
      await expect(row).toHaveCount(1, { timeout: 5_000 })
      await expect(row).toContainText(url)
      await expect(row).toContainText('record.created')
      await expect(row).toContainText('record.updated')
    } finally {
      if (createdId) await deleteWebhookSilently(request, createdId)
    }
  })

  test('test button enqueues a delivery and shows the recent deliveries card', async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const fix = await createWebhookFixture(request, suffix)
    try {
      await openWebhooksSection(page)
      const row = page.locator('tbody tr').filter({ hasText: fix.name })
      await expect(row).toHaveCount(1, { timeout: 5_000 })

      // Row's action cell hosts: [Test, Edit (icon), Delete (icon)].
      // "Test" is the only one with a visible text label.
      const testPromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/api/webhooks/${fix.id}/test`) &&
          res.request().method() === 'POST',
      )
      await row.getByRole('button', { name: /^test$/i }).click()
      const testRes = await testPromise
      expect(
        testRes.ok(),
        `test dispatch failed: ${testRes.status()} ${await testRes.text()}`,
      ).toBeTruthy()

      // Success toast — `settings:webhooks.notice.testQueued`.
      await expect(page.getByText(/test notification queued/i).first()).toBeVisible({
        timeout: 5_000,
      })

      // Clicking the row's name opens the deliveries card. The card title
      // comes from `settings:webhooks.deliveries.title` = "Recent deliveries".
      await row.getByRole('button', { name: fix.name }).click()
      await expect(page.getByText(/^recent deliveries$/i)).toBeVisible({
        timeout: 5_000,
      })
    } finally {
      await deleteWebhookSilently(request, fix.id)
    }
  })

  test('edit flow updates the webhook name', async ({ page, request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const fix = await createWebhookFixture(request, suffix)
    const renamed = `${fix.name} — renamed`
    try {
      await openWebhooksSection(page)
      const row = page.locator('tbody tr').filter({ hasText: fix.name })
      await expect(row).toHaveCount(1, { timeout: 5_000 })

      // Action buttons: [Test, Edit, Delete] — the Edit (Pencil) and Delete
      // (Trash) buttons are icon-only with no aria-label, so we locate by
      // position. They're the 2nd and 3rd buttons in the row's actions cell.
      const actionButtons = row.locator('td').last().getByRole('button')
      await actionButtons.nth(1).click()

      // Editor opens with the "Edit webhook" title.
      const dialog = page.getByRole('dialog', { name: /^edit webhook$/i })
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Name input is pre-populated; replace its value.
      const nameInput = dialog.locator('input[type="text"]').first()
      await expect(nameInput).toHaveValue(fix.name)
      await nameInput.fill(renamed)

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/api/webhooks/${fix.id}`) &&
          res.request().method() === 'PATCH',
      )
      await dialog.getByRole('button', { name: /^save$/i }).click()
      const patchRes = await patchPromise
      expect(patchRes.ok()).toBeTruthy()
      await expect(dialog).toBeHidden({ timeout: 5_000 })

      // Row reflects the new name.
      await expect(
        page.locator('tbody tr').filter({ hasText: renamed }),
      ).toHaveCount(1, { timeout: 5_000 })
    } finally {
      await deleteWebhookSilently(request, fix.id)
    }
  })

  test('delete flow removes the row after confirmation', async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const fix = await createWebhookFixture(request, suffix)
    try {
      await openWebhooksSection(page)
      const row = page.locator('tbody tr').filter({ hasText: fix.name })
      await expect(row).toHaveCount(1, { timeout: 5_000 })

      const actionButtons = row.locator('td').last().getByRole('button')
      // 3rd button (Trash) — delete.
      await actionButtons.nth(2).click()

      // Confirm dialog — `settings:webhooks.confirmDelete.title` = "Delete webhook".
      const confirm = page.getByRole('alertdialog', { name: /^delete webhook$/i })
      await expect(confirm).toBeVisible({ timeout: 5_000 })

      const deletePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/api/webhooks/${fix.id}`) &&
          res.request().method() === 'DELETE',
      )
      await confirm.getByRole('button', { name: /^delete$/i }).click()
      const deleteRes = await deletePromise
      expect(deleteRes.ok()).toBeTruthy()

      await expect(confirm).toBeHidden({ timeout: 5_000 })
      // Row vanishes after the success toast invalidates the list query.
      await expect(
        page.locator('tbody tr').filter({ hasText: fix.name }),
      ).toHaveCount(0, { timeout: 5_000 })
    } finally {
      // Best-effort cleanup in case delete failed mid-run.
      await deleteWebhookSilently(request, fix.id)
    }
  })
})
