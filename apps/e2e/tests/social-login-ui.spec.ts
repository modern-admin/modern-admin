import { test, expect, type Page, type BrowserContext } from '@playwright/test'

/**
 * Social login — login-page UI + /admin/api/auth/ui-props API.
 *
 * OAuth flows redirect to external providers (Google, GitHub, Apple) and
 * cannot be completed in a headless e2e test. Coverage targets:
 *
 *  1. GET /admin/api/auth/ui-props — response shape: providers string[],
 *     emailAndPassword boolean. Demo config has no social providers.
 *  2. Login page shows only the email form when providers is empty.
 *  3. Social buttons render with the correct label per provider when the
 *     API is mocked to return a provider list.
 *  4. Separator "Or continue with" appears only when social + email/password
 *     are both active simultaneously.
 *  5. Email form is hidden when emailAndPassword is false.
 *  6. Unknown provider id falls back to a capitalised label and Globe icon
 *     (no crash, no missing button).
 *  7. Clicking a social button fires a POST to Better Auth's sign-in/social
 *     endpoint with the correct provider id and a non-empty callbackURL.
 *
 * Each Playwright test receives a fresh browser context seeded from the
 * project storageState, so clearing cookies in one test never leaks into
 * the next. The `page.route()` intercepts are scoped to the page instance
 * and are torn down automatically at the end of each test.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

// The `chromium` project's `request` fixture uses `baseURL: http://localhost:5173`
// (the Vite SPA). API endpoints must be called on the NestJS server directly.
const API = process.env.E2E_API_URL ?? 'http://localhost:3001'

// LocalStorage key used by AdminClient's persistDemoSession feature. The
// storageState injected by the `chromium` project includes this key, so
// clearing cookies alone is not enough — the client would auto-relogin on
// the first 401 response. We clear it via an initScript before each
// unauthenticated navigation.
const DEMO_SESSION_KEY = 'modern-admin:demo-session:v1'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Registers an initScript that removes the demo-session localStorage entry
 * before the SPA boots, then clears cookies and navigates to `/` so the app
 * lands on the login page. Waits for the `<h1>` heading to confirm the login
 * screen is mounted before returning.
 *
 * The initScript approach is necessary because `context.clearCookies()` alone
 * leaves the localStorage demo-session in place, which triggers an automatic
 * re-login on the first 401 — bypassing the login page entirely.
 */
async function openLoginPage(
  page: Page,
  context: BrowserContext,
  providers: string[],
  emailAndPassword = true,
): Promise<void> {
  await page.route('**/admin/api/auth/ui-props', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers, emailAndPassword }),
    }),
  )
  // The initScript runs before any SPA JS on the next navigation, preventing
  // the auto-relogin from firing.
  await context.addInitScript(
    ({ key }) => localStorage.removeItem(key),
    { key: DEMO_SESSION_KEY },
  )
  await context.clearCookies()
  await page.goto('/')
  // Confirm the login screen is rendered (the <h1> holds the app title).
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('social login — /admin/api/auth/ui-props API', () => {
  test('returns a valid response shape', async ({ request }) => {
    // Hit the NestJS API server directly — the request fixture's baseURL
    // points to the Vite SPA (port 5173) which would return HTML.
    const res = await request.get(`${API}/admin/api/auth/ui-props`)
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as { providers: unknown; emailAndPassword: unknown }
    expect(Array.isArray(body.providers)).toBe(true)
    expect(typeof body.emailAndPassword).toBe('boolean')
  })

  test('demo config reports no social providers and emailAndPassword enabled', async ({
    request,
  }) => {
    // The reference `apps/api-prisma` activates GitHub OAuth only when
    // GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET are set. The Playwright
    // webServer block in playwright.config.ts does not set those vars, so
    // providers must be empty in the CI / local e2e environment.
    const res = await request.get(`${API}/admin/api/auth/ui-props`)
    const body = (await res.json()) as { providers: string[]; emailAndPassword: boolean }

    expect(body.providers).toEqual([])
    expect(body.emailAndPassword).toBe(true)
  })
})

test.describe('social login — login page without providers', () => {
  test('shows only the email form when providers list is empty', async ({ page, context }) => {
    // No route mock — the real demo API responds with providers: [].
    // Clear the demo-session before navigating so the client cannot auto-relogin.
    await context.addInitScript(
      ({ key }) => localStorage.removeItem(key),
      { key: DEMO_SESSION_KEY },
    )
    await context.clearCookies()
    await page.goto('/')

    await expect(page.locator('#login-email')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#login-password')).toBeVisible()

    // No social buttons and no divider when providers is [].
    await expect(page.getByRole('button', { name: /Continue with/i })).toHaveCount(0)
    await expect(page.getByText('Or continue with', { exact: true })).toHaveCount(0)
  })
})

test.describe('social login — login page with mocked providers', () => {
  test('renders a button for each known provider with the correct label', async ({
    page,
    context,
  }) => {
    await openLoginPage(page, context, ['google', 'github', 'apple'])

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible()
  })

  test('renders buttons in the order returned by the API', async ({ page, context }) => {
    await openLoginPage(page, context, ['apple', 'google'])

    const buttons = page.getByRole('button', { name: /Continue with/i })
    await expect(buttons).toHaveCount(2)
    await expect(buttons.nth(0)).toHaveText('Continue with Apple')
    await expect(buttons.nth(1)).toHaveText('Continue with Google')
  })

  test('shows the separator when both social and email/password are active', async ({
    page,
    context,
  }) => {
    await openLoginPage(page, context, ['github'], /* emailAndPassword */ true)

    await expect(page.getByText('Or continue with', { exact: true })).toBeVisible()
    // Email form is still present.
    await expect(page.locator('#login-email')).toBeVisible()
  })

  test('hides the separator when emailAndPassword is false', async ({ page, context }) => {
    await openLoginPage(page, context, ['github'], /* emailAndPassword */ false)

    await expect(page.getByText('Or continue with', { exact: true })).toHaveCount(0)
    await expect(page.locator('#login-email')).toBeHidden()
  })

  test('hides the email form when emailAndPassword is false', async ({ page, context }) => {
    await openLoginPage(page, context, ['google'], /* emailAndPassword */ false)

    await expect(page.locator('#login-email')).toBeHidden()
    await expect(page.locator('#login-password')).toBeHidden()
    // Social button is still shown.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  })

  test('unknown provider id falls back to a capitalised label', async ({ page, context }) => {
    await openLoginPage(page, context, ['mycompany-sso'], false)

    // resolveProvider() does id.charAt(0).toUpperCase() + id.slice(1).
    await expect(
      page.getByRole('button', { name: 'Continue with Mycompany-sso' }),
    ).toBeVisible()
  })

  test('clicking a social button POSTs to sign-in/social with correct provider and callbackURL', async ({
    page,
    context,
  }) => {
    // A URL that won't resolve in the test — used as the mock OAuth redirect
    // target so the browser has somewhere to go after the POST resolves.
    const MOCK_OAUTH_URL = 'http://127.0.0.1:19999/mock-github-oauth'

    // Return a controlled redirect URL from the sign-in/social endpoint.
    await page.route('**/sign-in/social', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: MOCK_OAUTH_URL }),
      }),
    )
    // Abort the browser navigation to the fake OAuth URL so the test doesn't
    // leave the admin origin. The important assertion is the POST body, not
    // what happens after the redirect.
    await page.route(`${MOCK_OAUTH_URL}**`, (route) => route.abort())

    await openLoginPage(page, context, ['github'])

    const [socialReq] = await Promise.all([
      page.waitForRequest('**/sign-in/social'),
      page.getByRole('button', { name: 'Continue with GitHub' }).click(),
    ])

    const body = socialReq.postDataJSON() as { provider?: string; callbackURL?: string }
    expect(body.provider).toBe('github')
    // callbackURL is window.location.href at click time — must be a non-empty string.
    expect(typeof body.callbackURL).toBe('string')
    expect(body.callbackURL).toBeTruthy()
  })

  test('social button is disabled while the redirect request is in flight', async ({
    page,
    context,
  }) => {
    // Delay the sign-in/social response so the pending state is observable.
    await page.route('**/sign-in/social', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://127.0.0.1:19999/mock-slow-oauth' }),
      })
    })
    await page.route('http://127.0.0.1:19999/**', (route) => route.abort())

    await openLoginPage(page, context, ['github'])

    const btn = page.getByRole('button', { name: 'Continue with GitHub' })
    await expect(btn).toBeVisible()

    // Click and immediately check that the button is disabled (isPending = true).
    await btn.click()
    await expect(btn).toBeDisabled()
  })
})
