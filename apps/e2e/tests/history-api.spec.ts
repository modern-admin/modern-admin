import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Record-level revision history exposed by `feature-history`.
 *
 * The reference api wires `historyPlugin({ store: PrismaHistoryStore })`
 * in `apps/api-prisma/src/admin.module.ts`, so every `edit` action
 * appends a revision to `MaHistoryEntry`. The history controller
 * exposes:
 *
 *   GET  /admin/api/resources/:id/records/:recordId/history
 *   GET  /admin/api/resources/:id/records/:recordId/history/:revisionId
 *   POST /admin/api/resources/:id/records/:recordId/history/:revisionId/revert
 *
 * All routes are gated by the `admin` role (default `historyRoles`).
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

type Revision = { id: string; op: 'create' | 'update' | 'delete'; snapshot: Record<string, unknown> }

async function listRevisions(request: APIRequestContext, id: string): Promise<Revision[]> {
  const res = await request.get(admin(`/resources/customers/records/${id}/history`))
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
  const body = (await res.json()) as { revisions: Revision[] }
  expect(Array.isArray(body.revisions)).toBe(true)
  return body.revisions
}

/**
 * `feature-history` persists revisions off the hot path (fire-and-forget:
 * the mutation response returns before the append settles), so a read taken
 * immediately after an edit is eventually-consistent. Poll until the
 * predicate holds rather than asserting synchronously.
 */
async function waitForRevisions(
  request: APIRequestContext,
  id: string,
  predicate: (revs: Revision[]) => boolean,
): Promise<Revision[]> {
  let latest: Revision[] = []
  await expect
    .poll(async () => {
      latest = await listRevisions(request, id)
      return predicate(latest)
    }, { timeout: 10_000 })
    .toBe(true)
  return latest
}

async function createCustomer(request: APIRequestContext): Promise<{ id: string; name: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const name = `History ${suffix}`
  const res = await request.post(admin('/resources/customers/actions/new'), {
    data: { email: `history-${suffix}@example.com`, name, tier: 'free' },
  })
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name }
}

async function editCustomer(
  request: APIRequestContext,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await request.patch(
    admin(`/resources/customers/records/${id}/actions/edit`),
    { data: payload },
  )
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
}

test.describe('Record history endpoint', () => {
  test('list returns revisions for every edit', async ({ request }) => {
    const customer = await createCustomer(request)
    try {
      await editCustomer(request, customer.id, { name: `${customer.name} v2` })
      await editCustomer(request, customer.id, { name: `${customer.name} v3` })

      // historyPlugin writes `op: 'update'` for `edit` actions. Poll until
      // both background appends have settled.
      const revisions = await waitForRevisions(
        request,
        customer.id,
        (revs) => revs.filter((r) => r.op === 'update').length >= 2,
      )
      expect(revisions.length).toBeGreaterThanOrEqual(2)
      const editRevisions = revisions.filter((r) => r.op === 'update')
      expect(editRevisions.length).toBeGreaterThanOrEqual(2)
    } finally {
      await request.delete(admin(`/resources/customers/records/${customer.id}/actions/delete`))
    }
  })

  test('individual revision is fetchable by id', async ({ request }) => {
    const customer = await createCustomer(request)
    try {
      await editCustomer(request, customer.id, { name: `${customer.name} once` })

      const list = await waitForRevisions(request, customer.id, (revs) => revs.length >= 1)
      const revisionId = list[0]!.id
      expect(revisionId).toBeTruthy()

      const singleRes = await request.get(
        admin(`/resources/customers/records/${customer.id}/history/${revisionId}`),
      )
      expect(singleRes.ok()).toBeTruthy()
      const single = (await singleRes.json()) as { revision: { id: string } }
      expect(single.revision.id).toBe(revisionId)
    } finally {
      await request.delete(admin(`/resources/customers/records/${customer.id}/actions/delete`))
    }
  })

  test('revert restores the prior snapshot', async ({ request }) => {
    const customer = await createCustomer(request)
    try {
      const original = customer.name
      const renamed = `${original} CHANGED`
      await editCustomer(request, customer.id, { name: renamed })

      // Grab the most recent edit revision (the one we want to undo). Poll
      // until the background append of the update revision has settled.
      const list = await waitForRevisions(
        request,
        customer.id,
        (revs) => revs.some((r) => r.op === 'update'),
      )
      const editRev = list.find((r) => r.op === 'update')
      expect(editRev, 'expected at least one update revision').toBeDefined()

      // Confirm current name is the renamed value.
      const showBefore = await request.get(
        admin(`/resources/customers/records/${customer.id}/actions/show`),
      )
      expect(((await showBefore.json()).record.params.name as string)).toBe(renamed)

      // Revert the edit revision → record name should snap back to `original`.
      const revertRes = await request.post(
        admin(`/resources/customers/records/${customer.id}/history/${editRev!.id}/revert`),
        { data: { reason: 'e2e revert' } },
      )
      expect(revertRes.ok(), await revertRes.text().catch(() => '')).toBeTruthy()

      const showAfter = await request.get(
        admin(`/resources/customers/records/${customer.id}/actions/show`),
      )
      const afterParams = (await showAfter.json()).record.params as { name: string }
      expect(afterParams.name).toBe(original)
    } finally {
      await request.delete(admin(`/resources/customers/records/${customer.id}/actions/delete`))
    }
  })
})
