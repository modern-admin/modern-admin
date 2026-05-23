import { expect, test, type Page, type Locator } from '@playwright/test'

/**
 * UI coverage for the global-search command palette
 * (`packages/react/src/components/global-search-dialog.tsx`).
 *
 * The dialog is mounted by the SPA header (`AdminApp` in
 * `packages/react/src/admin-app.tsx`); the header pairs a trigger button
 * (`aria-label="Global search"`) with the `mod+k` hotkey. Both must open
 * the same dialog and surface the same enriched payload from
 * `GET /admin/api/global-search` (groups, per-hit snippet/matchedField,
 * score-sorted).
 *
 * Seeded data comes from `apps/api/src/demo/seed.ts`:
 *   customers[0].email === 'ada.lovelace1@example.com'
 *   customers[0].name  === 'Ada Lovelace'
 * → searching for "ada" always returns ≥1 customer.
 *
 * Locator notes:
 *   • The dialog itself exposes `role="dialog"` via Radix.
 *   • cmdk renders its primitives with `cmdk-*` data attributes
 *     (`[cmdk-group]`, `[cmdk-group-heading]`, `[cmdk-item]`). Inside
 *     a `CommandGroup` the heading sits *next to* the items container,
 *     not inside it — so `getByRole('group')` would miss the heading
 *     text. We anchor on `[cmdk-group]` instead, which wraps both.
 *   • `[cmdk-item]` exposes `role="option"` per cmdk source — usable
 *     via `getByRole('option')` once scoped to a group.
 */

const RECENT_STORAGE_KEY = 'modern-admin:global-search:recent:v1'

const trigger = (page: Page): Locator =>
  page.getByRole('button', { name: 'Global search' }).first()

const dialog = (page: Page): Locator => page.getByRole('dialog')

const input = (page: Page): Locator =>
  dialog(page).getByPlaceholder('Search across all resources…')

const cmdkGroup = (page: Page, heading: RegExp): Locator =>
  dialog(page).locator('[cmdk-group]').filter({
    has: page.locator('[cmdk-group-heading]', { hasText: heading }),
  })

async function openPalette(page: Page): Promise<void> {
  await trigger(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(input(page)).toBeFocused()
}

async function typeQuery(page: Page, q: string): Promise<void> {
  await input(page).fill(q)
  // Wait out the 300ms debounce + server round-trip. The "Customers" group
  // header is rendered by `CommandGroup` once results arrive.
  await expect(cmdkGroup(page, /Customers/i)).toBeVisible({ timeout: 10_000 })
}

test.describe('global search — opening', () => {
  test('trigger button opens the dialog with focus in the input', async ({ page }) => {
    await page.goto('/')
    await openPalette(page)
    // Hint copy is visible while query is empty and recent list is empty.
    await expect(
      dialog(page).getByText('Start typing to search across all resources.'),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  })

  test('mod+k hotkey opens (and toggles) the dialog from anywhere', async ({ page }) => {
    await page.goto('/')
    // Make sure something focusable is in the DOM before we test the hotkey;
    // the listener mounts in the SPA header's effect.
    await expect(trigger(page)).toBeVisible()
    await expect(dialog(page)).toBeHidden()

    // `useHotkey('mod+k')` parses the lowercase combo and matches against
    // event.code === 'KeyK'. Playwright with an UPPERCASE letter would
    // additionally hold Shift, which still matches (our handler allows
    // accidental shift on letters) — but we use lowercase to keep the
    // emitted event minimal and unambiguous.
    await page.keyboard.press('Control+k')
    await expect(dialog(page)).toBeVisible()
    await expect(input(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  })
})

test.describe('global search — results', () => {
  test.beforeEach(async ({ page }) => {
    // Clear recent searches so the "hint" empty state is deterministic.
    await page.addInitScript((key) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }, RECENT_STORAGE_KEY)
  })

  test('typing a known term surfaces grouped, highlighted hits', async ({ page }) => {
    await page.goto('/')
    await openPalette(page)
    await typeQuery(page, 'ada')

    const customers = cmdkGroup(page, /Customers/i)
    await expect(customers).toBeVisible()

    // At least one hit row mentions a "Lovelace" customer (seed customer #1).
    await expect(
      customers.locator('[cmdk-item]').filter({ hasText: /lovelace/i }).first(),
    ).toBeVisible()

    // Substring match is wrapped in `<mark>` (`highlightMatch` helper).
    await expect(customers.locator('mark').first()).toBeVisible()
    await expect(customers.locator('mark').first()).toHaveText(/ada/i)
  })

  test('no-results state appears for an unknown term', async ({ page }) => {
    await page.goto('/')
    await openPalette(page)
    await input(page).fill('zzzzzzzznotarealsearchtokenxyzzz')
    // cmdk's `CommandEmpty` renders our `noResults` copy when the response
    // came back with 0 groups (NOT while still loading).
    await expect(
      dialog(page).getByText('No matching records found.'),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('selecting a hit navigates to the record and closes the dialog', async ({
    page,
  }) => {
    await page.goto('/')
    await openPalette(page)
    await typeQuery(page, 'ada')

    const firstHit = cmdkGroup(page, /Customers/i)
      .locator('[cmdk-item]')
      .filter({ hasText: /lovelace/i })
      .first()
    await firstHit.click()

    await expect(dialog(page)).toBeHidden()
    // Show page URL = `/resources/customers/<recordId>` (no `/show` suffix —
    // see `buildPath` in `packages/react/src/router.tsx`). The seed always
    // assigns customer #1 the name "Ada Lovelace", so we anchor on id `1`.
    await page.waitForURL(/\/resources\/customers\/1(?:[?#]|$)/, {
      timeout: 10_000,
    })
  })

  test('"Show all in {resource}" jumps to the list page', async ({ page }) => {
    await page.goto('/')
    await openPalette(page)
    await typeQuery(page, 'ada')

    const showAll = cmdkGroup(page, /Customers/i)
      .locator('[cmdk-item]')
      .filter({ hasText: /Show all in Customers/i })
      .first()
    await expect(showAll).toBeVisible()
    await showAll.click()

    await expect(dialog(page)).toBeHidden()
    // List page URL has no trailing record id — anchor on the exact prefix
    // plus an allowed terminator (query / hash / end of path).
    await page.waitForURL(/\/resources\/customers(?:[?#]|$)/, {
      timeout: 10_000,
    })
  })
})

test.describe('global search — recent queries', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }, RECENT_STORAGE_KEY)
  })

  test('persists picked query to localStorage and re-surfaces it on reopen', async ({
    page,
  }) => {
    await page.goto('/')
    await openPalette(page)
    await typeQuery(page, 'ada')

    // Pick the first hit so the dialog persists the query (recent list is
    // only updated on navigation, not every keystroke).
    await cmdkGroup(page, /Customers/i)
      .locator('[cmdk-item]')
      .filter({ hasText: /lovelace/i })
      .first()
      .click()
    await expect(dialog(page)).toBeHidden()

    // localStorage must now contain `["ada"]`.
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      RECENT_STORAGE_KEY,
    )
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!) as string[]).toContain('ada')

    // Reopen — empty query + non-empty recent list = "Recent searches" group.
    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()
    const recent = cmdkGroup(page, /Recent searches/i)
    await expect(recent).toBeVisible()
    await expect(
      recent.locator('[cmdk-item]').filter({ hasText: 'ada' }).first(),
    ).toBeVisible()
  })

  test('clear-recent button wipes the stored list', async ({ page }) => {
    // Seed a recent entry directly via localStorage to avoid the navigation
    // dance — this exercise is about the Clear UI, not persistence.
    await page.addInitScript(
      ({ key, list }) => {
        try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* ignore */ }
      },
      { key: RECENT_STORAGE_KEY, list: ['ada', 'beta'] },
    )

    await page.goto('/')
    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()

    const recent = cmdkGroup(page, /Recent searches/i)
    await expect(recent).toBeVisible()
    await expect(recent.locator('[cmdk-item]')).toHaveCount(2)

    // The clear control sits inside the group heading (rendered via
    // `<button type="button">…Clear</button>` inside `CommandGroup heading=…`).
    // cmdk marks `[cmdk-group-heading]` as `aria-hidden="true"`, which hides
    // every descendant from the accessibility tree — so `getByRole('button')`
    // can't see this control. Use a plain CSS locator instead.
    await recent.locator('button').filter({ hasText: /Clear/i }).first().click()

    // Recent group disappears, hint comes back.
    await expect(cmdkGroup(page, /Recent searches/i)).toHaveCount(0)
    await expect(
      dialog(page).getByText('Start typing to search across all resources.'),
    ).toBeVisible()

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      RECENT_STORAGE_KEY,
    )
    expect(stored).toBe('[]')
  })

  test('clicking a recent entry re-runs the query immediately', async ({ page }) => {
    await page.addInitScript(
      ({ key, list }) => {
        try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* ignore */ }
      },
      { key: RECENT_STORAGE_KEY, list: ['ada'] },
    )

    await page.goto('/')
    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()

    await cmdkGroup(page, /Recent searches/i)
      .locator('[cmdk-item]')
      .filter({ hasText: 'ada' })
      .first()
      .click()

    // Input is populated, results land in the Customers group.
    await expect(input(page)).toHaveValue('ada')
    await expect(cmdkGroup(page, /Customers/i)).toBeVisible({ timeout: 10_000 })
  })
})
