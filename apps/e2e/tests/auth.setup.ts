// One-shot login that captures the authenticated session into a storage-state
// file. Every other test project depends on this setup and reuses the saved
// cookies/localStorage, so we don't pay the login cost per-test.
//
// Credentials come from the seeded demo admin (apps/_shared/src/auth/seed-demo-user.ts).
// The id="login-email" / id="login-password" / button[type=submit] selectors
// match the form rendered by packages/react/src/pages/login-page.tsx.

import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'playwright/.auth/admin.json'

const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'admin12345'

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/')
  // Login form is the unauthenticated landing page.
  await page.locator('#login-email').fill(EMAIL)
  await page.locator('#login-password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  // Wait for navigation away from the login screen — the sidebar's resource
  // navigation is only rendered post-login.
  await expect(page.locator('#login-email')).toBeHidden({ timeout: 15_000 })
  await page.context().storageState({ path: AUTH_FILE })
})
