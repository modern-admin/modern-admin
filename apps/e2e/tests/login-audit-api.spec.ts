import { test, expect } from '@playwright/test'

/**
 * Login events are recorded server-side by Better Auth's
 * `session.create.after` hook (see `apps/_shared/src/auth/build-better-auth.ts`).
 * The hook fires on every successful sign-in — email/password, OAuth,
 * passkey, or api-key-synthesised session — and writes one entry to the
 * action log:
 *
 *   { resourceId: '__auth__', action: 'login', userId, at }
 *
 * This spec drives a fresh email/password sign-in through Better Auth and
 * then queries the audit-log endpoint to assert the entry landed. It runs
 * under the `api` Playwright project, which reuses the storageState
 * captured by `auth.setup.ts` so the GET is authenticated.
 */

// `apps/api`'s in-memory log store is created at module-load time and
// lives for the lifetime of the dev server (no DB). That gives us a
// stable surface to read from across the spec without seeding anything.
const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'admin12345'

interface ActionLogEntry {
  id?: string
  resourceId: string
  action: string
  userId?: string
  at: number
}

interface AuditLogResponse {
  events: ActionLogEntry[]
}

test.describe('login → audit-log', () => {
  test('email/password sign-in writes a `login` entry to the audit log', async ({ request }) => {
    // Take a snapshot of the latest login `at` BEFORE we sign in again,
    // so we can prove the upcoming hook fired even when the demo server
    // has accumulated unrelated login events from other tests.
    const beforeRes = await request.get(admin('/audit-log?actions=login&limit=1'))
    expect(beforeRes.ok(), await beforeRes.text().catch(() => '')).toBeTruthy()
    const beforeBody = (await beforeRes.json()) as AuditLogResponse
    const previousLatestAt = beforeBody.events[0]?.at ?? 0

    // Force a fresh login round-trip. Better Auth's email handler sets a
    // session cookie; the `session.create.after` hook fires synchronously
    // and persists the audit entry before the HTTP response is returned.
    //
    // Note: `apps/api`'s `bootstrap.ts` mounts the Better Auth handler at
    // `/api/auth`, not `/admin/api/auth`. The SPA client config (in
    // `apps/web/src/main.tsx`) reflects that with `authBasePath: '/api/auth'`.
    // Better Auth requires an Origin header that matches `trustedOrigins`
    // (CSRF protection). The api app is booted with
    // `WEB_ORIGIN=http://localhost:5173` by `playwright.config.ts`.
    const loginRes = await request.post(`${API}/api/auth/sign-in/email`, {
      data: { email: EMAIL, password: PASSWORD },
      headers: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' },
    })
    expect(loginRes.ok(), await loginRes.text().catch(() => '')).toBeTruthy()

    // The store is in-memory and ordered by `at` desc by the controller's
    // default. Pull the latest login event and assert (a) it postdates the
    // pre-snapshot and (b) carries the expected shape.
    const afterRes = await request.get(admin('/audit-log?actions=login&limit=5'))
    expect(afterRes.ok()).toBeTruthy()
    const afterBody = (await afterRes.json()) as AuditLogResponse

    expect(afterBody.events.length).toBeGreaterThan(0)
    const newest = afterBody.events[0]!
    expect(newest.resourceId).toBe('__auth__')
    expect(newest.action).toBe('login')
    expect(typeof newest.userId).toBe('string')
    expect(newest.userId!.length).toBeGreaterThan(0)
    expect(newest.at).toBeGreaterThan(previousLatestAt)
    // Hook generates ids via `uuidv7()` — non-empty string is enough here.
    expect(typeof newest.id).toBe('string')
    expect(newest.id!.length).toBeGreaterThan(0)
  })
})
