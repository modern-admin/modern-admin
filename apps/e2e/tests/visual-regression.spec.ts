import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Visual regression baselines for the reference `apps/web` SPA. Uses
 * Playwright's `toHaveScreenshot()` matcher, which diffs against a baseline
 * stored in `apps/e2e/tests/visual-regression.spec.ts-snapshots/` (created
 * automatically by Playwright on the first run; checked in to git so CI can
 * compare against them).
 *
 * Adding / updating baselines (after intentional UI changes):
 *
 *   PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/e2e e2e \
 *     visual-regression --update-snapshots
 *
 * Then commit the regenerated PNGs.
 *
 * Pages covered (stable, seed-deterministic):
 *   • / (home dashboard — empty chart state)
 *   • /resources/customers (list page, default sort)
 *   • /resources/customers/new (create form)
 *   • /settings (general settings)
 *
 * Stability levers:
 *   • Fixed 1280×800 viewport so layout breakpoints are deterministic.
 *   • `animations: 'disabled'` freezes any in-flight CSS transitions.
 *   • CSS overrides via `addStyleTag`: kill caret blink, disable any
 *     remaining transitions/animations, freeze scrollbar gutters.
 *   • Wait for `document.fonts.ready` so font swaps don't shift glyph
 *     metrics mid-screenshot.
 *   • `maxDiffPixelRatio: 0.02` tolerates sub-pixel anti-aliasing drift
 *     between OS / GPU driver versions — large enough to absorb noise,
 *     small enough to catch real layout regressions.
 *   • Dynamic regions (toast container, timestamp cells, generated UUID
 *     columns) are masked when they show up.
 */

const VIEWPORT = { width: 1280, height: 800 }

const STABILITY_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scrollbar-gutter: stable; }
`

/** Run before any screenshot to put the page into a deterministic state. */
async function stabilize(page: Page): Promise<void> {
  await page.addStyleTag({ content: STABILITY_CSS })
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve())
  // Tail-of-frame yield — gives any layout effect time to settle.
  await page.waitForTimeout(150)
}

/** Locators for regions whose content varies per-run and would otherwise
 *  trip the pixel diff (toasts, status snapshots, etc.). Returned as an
 *  array of locators ready to pass to `mask:` — every locator that does
 *  not match is silently ignored by Playwright. */
function dynamicMasks(page: Page): Locator[] {
  return [
    // Toast / notification stack.
    page.locator('[data-sonner-toaster], .sonner-toast, [role="status"]'),
    // AI assistant floating widget (timestamps in chat header).
    page.locator('[data-ai-assistant-root]'),
  ]
}

test.describe('Visual regression — apps/web', () => {
  test.use({ viewport: VIEWPORT })

  test('home / dashboard', async ({ page }) => {
    await page.goto('/')
    // The desktop sidebar (`[data-sidebar="sidebar"]`) only renders post-auth
    // and once the resource list has loaded — a reliable "shell mounted"
    // marker that other shell-level specs (e.g. `i18n-ui.spec.ts`) also use.
    await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible({
      timeout: 15_000,
    })
    await stabilize(page)
    await expect(page).toHaveScreenshot('home.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      mask: dynamicMasks(page),
    })
  })

  test('customers list page', async ({ page }) => {
    await page.goto('/resources/customers?perPage=20')
    // Wait for a known seeded row to render — guarantees the table is
    // hydrated, not skeleton-loading.
    await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toBeVisible({
      timeout: 15_000,
    })
    await stabilize(page)
    await expect(page).toHaveScreenshot('customers-list.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      mask: [
        ...dynamicMasks(page),
        // Mask the row ID column (UUID v7 — time-ordered and unique per
        // seed run) and any "createdAt"/"updatedAt" cells so reseeds
        // don't break the baseline.
        page.locator('tbody td:has-text("ma_")'),
        page.locator('tbody td').filter({ hasText: /\d{4}-\d{2}-\d{2}/ }),
      ],
    })
  })

  test('new customer form', async ({ page }) => {
    await page.goto('/resources/customers/new')
    // The form renders fields wrapped in `[data-slot="field"]` containers.
    // Wait for the Email field label (the first required field in the
    // customers resource) — guaranteed across schema variants.
    await expect(
      page
        .locator('[data-slot="field-label"]')
        .filter({ hasText: /^Email/ })
        .first(),
    ).toBeVisible({ timeout: 15_000 })
    await stabilize(page)
    await expect(page).toHaveScreenshot('customer-new.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      mask: dynamicMasks(page),
    })
  })

  test('settings page', async ({ page }) => {
    await page.goto('/settings')
    // `/settings` redirects to the API keys section (see settings.spec.ts).
    // The card heading is the most reliable "section loaded" signal.
    await expect(
      page.getByRole('heading', { name: 'API keys', exact: true }),
    ).toBeVisible({ timeout: 15_000 })
    await stabilize(page)
    await expect(page).toHaveScreenshot('settings.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      mask: dynamicMasks(page),
    })
  })
})
