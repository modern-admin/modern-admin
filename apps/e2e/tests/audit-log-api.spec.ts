import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Audit-log endpoint exposed by `feature-logging`.
 *
 * The reference api wires `actionLoggingPlugin({ store: system.logStore })`
 * in `apps/api/src/admin.module.ts`, where `system.logStore` defaults to the
 * in-memory `MemoryActionLogStore` from `@modern-admin/core`. That store
 * captures one `ActionLogEntry` per after-hook firing on every resource:
 *
 *   GET /admin/api/audit-log[?resourceId=&recordId=&actions=&from=&to=&limit=&offset=]
 *
 * Access is gated by `auditLogRoles` (default `['admin']`). The query
 * parameters are Zod-validated, so invalid input must surface as a 400.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

interface ActionLogEntry {
  id?: string
  resourceId: string
  action: string
  recordId?: string
  recordIds?: string[]
  userId?: string
  at: number
}

interface AuditLogResponse {
  events: ActionLogEntry[]
}

async function createCustomer(request: APIRequestContext): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await request.post(admin('/resources/customers/actions/new'), {
    data: {
      email: `audit-${suffix}@example.com`,
      name: `Audit ${suffix}`,
      tier: 'free',
    },
  })
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
  const body = await res.json()
  return String(body.record.id)
}

test.describe('GET /admin/api/audit-log', () => {
  test('records new + edit + delete actions for a customer', async ({ request }) => {
    const id = await createCustomer(request)

    // Edit the record so we have a second event for the same recordId.
    const editRes = await request.patch(
      admin(`/resources/customers/records/${id}/actions/edit`),
      { data: { name: `Audit renamed ${id}` } },
    )
    expect(editRes.ok()).toBeTruthy()

    // Delete to cover the `delete` action.
    const delRes = await request.delete(
      admin(`/resources/customers/records/${id}/actions/delete`),
    )
    expect(delRes.ok()).toBeTruthy()

    // Read back the log scoped to this record. Filtering by recordId means
    // we only see events triggered by *this* test — no flakiness from
    // parallel activity in other specs.
    const res = await request.get(
      admin(`/audit-log?resourceId=customers&recordId=${id}&limit=50`),
    )
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
    const body = (await res.json()) as AuditLogResponse
    expect(Array.isArray(body.events)).toBe(true)

    const actions = new Set(body.events.map((e) => e.action))
    expect(actions.has('new')).toBe(true)
    expect(actions.has('edit')).toBe(true)
    expect(actions.has('delete')).toBe(true)
    for (const ev of body.events) {
      expect(ev.resourceId).toBe('customers')
      expect(typeof ev.at).toBe('number')
    }
  })

  test('filters by `actions` (comma-separated allow-list)', async ({ request }) => {
    // Generate at least one edit so the filter has something to match.
    const id = await createCustomer(request)
    try {
      await request.patch(
        admin(`/resources/customers/records/${id}/actions/edit`),
        { data: { name: `Audit filter ${id}` } },
      )

      const res = await request.get(
        admin(`/audit-log?resourceId=customers&recordId=${id}&actions=edit&limit=20`),
      )
      expect(res.ok()).toBeTruthy()
      const body = (await res.json()) as AuditLogResponse
      expect(body.events.length).toBeGreaterThan(0)
      for (const ev of body.events) {
        expect(ev.action).toBe('edit')
      }
    } finally {
      await request.delete(admin(`/resources/customers/records/${id}/actions/delete`))
    }
  })

  test('honours the `limit` cap', async ({ request }) => {
    const res = await request.get(admin('/audit-log?limit=3'))
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as AuditLogResponse
    expect(body.events.length).toBeLessThanOrEqual(3)
  })

  test('rejects out-of-range limit (Zod 400)', async ({ request }) => {
    // Schema enforces 1..200; 500 must blow up at validation time.
    const res = await request.get(admin('/audit-log?limit=500'))
    expect(res.status()).toBe(400)
  })
})
