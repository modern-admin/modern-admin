import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * UI coverage for the popover-driven `DateRangeInput`
 * (`packages/ui/src/components/date-range-input.tsx`).
 *
 * The picker is mounted on the Audit Log page (`/audit-log`) where its
 * `from`/`to` are wired to `useInfiniteAuditLog(filters, …)`. Asserting
 * the resulting `GET /admin/api/audit-log?…` query string proves the
 * committed range is propagated through the parent's filter state.
 *
 * All tests run on a narrow viewport (500×900) to force the calendar into
 * single-month layout — that keeps the month/year dropdown selectors
 * deterministic (exactly one of each) regardless of host viewport width.
 */

test.use({ viewport: { width: 500, height: 900 } })

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Trigger button — uniquely identified by the lucide CalendarRange icon
 *  on the audit-log filters card. */
function trigger(page: Page): Locator {
  return page.locator('button:has(svg.lucide-calendar-range)').first()
}

/** The popover content. Radix Popover.Content has role="dialog" by default. */
function popover(page: Page): Locator {
  return page.getByRole('dialog')
}

async function openPicker(page: Page): Promise<void> {
  await trigger(page).click()
  await expect(popover(page)).toBeVisible()
}

/** Month dropdown — first combobox inside the popover. */
function monthDropdown(page: Page): Locator {
  return popover(page).getByRole('combobox').nth(0)
}

/** Year dropdown — second combobox inside the popover. */
function yearDropdown(page: Page): Locator {
  return popover(page).getByRole('combobox').nth(1)
}

async function pickMonth(page: Page, monthName: string): Promise<void> {
  await monthDropdown(page).click()
  // shadcn Select renders options as role="option" inside role="listbox".
  await page
    .getByRole('listbox')
    .getByRole('option', { name: monthName, exact: true })
    .click()
}

async function pickYear(page: Page, year: number): Promise<void> {
  await yearDropdown(page).click()
  await page
    .getByRole('listbox')
    .getByRole('option', { name: String(year), exact: true })
    .click()
}

/** Click a day cell by its 1-based day-of-month number. The day grid lives
 *  in `role="gridcell"` cells; each contains a single `<button>` with the
 *  numeric label as text. We filter on the cell to skip outside (next/prev
 *  month) duplicates. */
async function pickDay(page: Page, day: number): Promise<void> {
  const cells = popover(page).getByRole('gridcell').filter({
    hasNotText: /day-outside/i,
  })
  // The currently-displayed month renders its days as cells whose inner
  // button's text equals the day number exactly. Outside-month duplicates
  // are wrapped with the `outside` className that we excluded above but
  // class names are not in the accessible name — use a button selector
  // restricted by the cell's class instead.
  const dayButton = popover(page)
    .locator('td:not(.day-outside)')
    .locator(`button:text-is("${day}")`)
    .first()
  await dayButton.click()
  // Silence unused-var warning when cells aren't directly clicked.
  void cells
}

async function gotoAuditLog(page: Page): Promise<void> {
  await page.goto('/audit-log')
  // The filters card mounts immediately; wait for the trigger.
  await expect(trigger(page)).toBeVisible({ timeout: 15_000 })
}

/** Convert a Date to the yyyy-MM-dd shape the picker emits. */
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('DateRangeInput — open / close / placeholder', () => {
  test('trigger shows placeholder when no range is set', async ({ page }) => {
    await gotoAuditLog(page)
    await expect(trigger(page)).toContainText('Select date range')
    // No inline X when there is no value.
    await expect(
      trigger(page).locator('[aria-label="Clear"]'),
    ).toHaveCount(0)
  })

  test('clicking trigger opens the popover with calendar + footer', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)
    // Apply + Clear footer buttons present.
    await expect(
      popover(page).getByRole('button', { name: /^Apply$/ }),
    ).toBeVisible()
    await expect(
      popover(page).getByRole('button', { name: /^Clear$/ }),
    ).toBeVisible()
    // Apply is disabled while pending is empty.
    await expect(
      popover(page).getByRole('button', { name: /^Apply$/ }),
    ).toBeDisabled()
  })

  test('Escape discards in-progress selection without committing', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)
    await pickDay(page, 10)
    // Apply is now enabled — but we discard via Escape.
    await page.keyboard.press('Escape')
    await expect(popover(page)).toBeHidden()
    // Trigger should still show the placeholder (no commit happened).
    await expect(trigger(page)).toContainText('Select date range')
  })
})

test.describe('DateRangeInput — Apply / Clear / inline X', () => {
  test('Apply commits a complete range and sends from/to to the API', async ({
    page,
  }) => {
    await gotoAuditLog(page)

    // Navigate to a deterministic past month so the seeded audit-log will
    // (almost certainly) not match — what we assert is the query string.
    await openPicker(page)
    await pickYear(page, 2020)
    await pickMonth(page, 'March')

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/admin/api/audit-log') &&
        req.url().includes('from=2020-03-10') &&
        req.url().includes('to=2020-03-20'),
    )

    await pickDay(page, 10)
    await pickDay(page, 20)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()

    await expect(popover(page)).toBeHidden()
    await expect(trigger(page)).toContainText('Mar 10, 2020 – Mar 20, 2020')

    await requestPromise
  })

  test('a single calendar click commits as a one-day range', async ({
    page,
  }) => {
    // react-day-picker's range mode initialises the very first click as
    // `{ from: day, to: day }` — a one-day range — so Apply commits both
    // ends to the same date. (A true "from-only" partial range is only
    // reachable from external prop hydration; the calendar's UI never
    // produces one.)
    await gotoAuditLog(page)
    await openPicker(page)
    await pickYear(page, 2021)
    await pickMonth(page, 'June')
    await pickDay(page, 5)

    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(popover(page)).toBeHidden()
    await expect(trigger(page)).toContainText('Jun 5, 2021 – Jun 5, 2021')
  })

  test('Clear button inside popover empties the range and closes', async ({
    page,
  }) => {
    await gotoAuditLog(page)

    // Seed a committed range first.
    await openPicker(page)
    await pickYear(page, 2022)
    await pickMonth(page, 'May')
    await pickDay(page, 1)
    await pickDay(page, 7)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(trigger(page)).toContainText('May 1, 2022 – May 7, 2022')

    // Now Clear via the popover.
    await openPicker(page)
    await popover(page).getByRole('button', { name: /^Clear$/ }).click()
    await expect(popover(page)).toBeHidden()
    await expect(trigger(page)).toContainText('Select date range')
  })

  test('inline X clears without opening the popover', async ({ page }) => {
    await gotoAuditLog(page)

    await openPicker(page)
    await pickYear(page, 2022)
    await pickMonth(page, 'July')
    await pickDay(page, 3)
    await pickDay(page, 9)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(trigger(page)).toContainText('Jul 3, 2022 – Jul 9, 2022')

    const inlineX = trigger(page).locator('[aria-label="Clear"]')
    await expect(inlineX).toBeVisible()
    await inlineX.click()

    // Popover did NOT open.
    await expect(popover(page)).toBeHidden()
    await expect(trigger(page)).toContainText('Select date range')
  })
})

test.describe('DateRangeInput — no autocommit / re-open behaviour', () => {
  test('first click in the calendar neither closes the popover nor fires onChange', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)
    await pickYear(page, 2023)
    await pickMonth(page, 'February')

    // Count requests to /audit-log before and after — a click must NOT
    // trigger a new query.
    let auditRequests = 0
    page.on('request', (r) => {
      if (r.url().includes('/admin/api/audit-log')) auditRequests++
    })

    await pickDay(page, 15)

    // The popover must still be open (no auto-close, no auto-commit).
    await expect(popover(page)).toBeVisible()
    // Apply becomes enabled now that there is a `from`.
    await expect(
      popover(page).getByRole('button', { name: /^Apply$/ }),
    ).toBeEnabled()

    // Give react-query a beat — but no audit-log request should fire because
    // `from`/`to` props on the parent haven't moved.
    await page.waitForTimeout(300)
    expect(auditRequests).toBe(0)
  })

  test('reopening after a committed full range restores selection in the calendar', async ({
    page,
  }) => {
    await gotoAuditLog(page)

    await openPicker(page)
    await pickYear(page, 2023)
    await pickMonth(page, 'August')
    await pickDay(page, 4)
    await pickDay(page, 10)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(popover(page)).toBeHidden()

    // Reopen — calendar should remember the range so Apply is immediately
    // enabled and the days are marked selected.
    await openPicker(page)
    await expect(
      popover(page).getByRole('button', { name: /^Apply$/ }),
    ).toBeEnabled()

    // The August 2023 caption is shown (month dropdown reads "August",
    // year dropdown reads "2023"). The shadcn SelectValue renders the
    // selected label as the trigger's text content.
    await expect(monthDropdown(page)).toContainText('August')
    await expect(yearDropdown(page)).toContainText('2023')
  })

  test('reopening after the inline X clear re-shows the current month, not the cleared one', async ({
    page,
  }) => {
    // Regression guard for the navigation behaviour we wired via
    // `defaultMonth={pending?.from ?? today}` in DateRangeInput: once the
    // user clears, the next open must NOT keep showing the previously
    // committed month — pending is empty, so the calendar must land on
    // the current month.
    await gotoAuditLog(page)

    await openPicker(page)
    await pickYear(page, 2018)
    await pickMonth(page, 'November')
    await pickDay(page, 2)
    await pickDay(page, 9)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(popover(page)).toBeHidden()

    // Clear via the inline X.
    await trigger(page).locator('[aria-label="Clear"]').click()
    await expect(trigger(page)).toContainText('Select date range')

    // Reopen — calendar must show the current month/year, not Nov 2018.
    await openPicker(page)
    const currentYear = String(new Date().getFullYear())
    const currentMonth = MONTHS_LONG[new Date().getMonth()]!
    await expect(monthDropdown(page)).toContainText(currentMonth)
    await expect(yearDropdown(page)).toContainText(currentYear)
  })
})

test.describe('DateRangeInput — month / year dropdown navigation', () => {
  test('month dropdown alone changes the visible month', async ({ page }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    // Snapshot current year so we can confirm only the month changed.
    const beforeYear = await yearDropdown(page).textContent()

    await pickMonth(page, 'January')
    await expect(monthDropdown(page)).toContainText('January')
    await expect(yearDropdown(page)).toHaveText(beforeYear ?? '')

    // The caption label inside the month grid mirrors the dropdown choice
    // ("January <year>" with no day grid header beyond weekdays).
    // We probe by clicking a day — picking 15 must commit as YYYY-01-15
    // where YYYY is the unchanged year.
    await pickDay(page, 15)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()

    const yearNum = Number(beforeYear)
    await expect(trigger(page)).toContainText(
      `Jan 15, ${yearNum}`,
    )
  })

  test('year dropdown alone changes the visible year', async ({ page }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    const beforeMonth = (await monthDropdown(page).textContent()) ?? ''
    const monthIdx = MONTHS_LONG.findIndex((m) => beforeMonth.includes(m))
    expect(monthIdx).toBeGreaterThanOrEqual(0)

    await pickYear(page, 2019)
    await expect(yearDropdown(page)).toContainText('2019')
    // Month preserved.
    await expect(monthDropdown(page)).toContainText(MONTHS_LONG[monthIdx]!)

    await pickDay(page, 8)
    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(trigger(page)).toContainText(
      `${MONTHS_SHORT[monthIdx]} 8, 2019`,
    )
  })

  test('changing both month and year navigates to an arbitrary far date', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    // Far past — Jan 2010 → Dec 2010. Order: year first, then month.
    await pickYear(page, 2010)
    await pickMonth(page, 'January')
    await pickDay(page, 5)

    // Within the same month: just click the second day.
    await pickDay(page, 25)

    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(trigger(page)).toContainText('Jan 5, 2010 – Jan 25, 2010')
  })

  test('changing month/year then year/month across-month range', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    // Reverse order — month first, then year — must also work.
    await pickMonth(page, 'February')
    await pickYear(page, 2015)
    await pickDay(page, 14)

    // Now navigate forward to April 2015 and pick the second day.
    await pickMonth(page, 'April')
    await pickDay(page, 3)

    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(trigger(page)).toContainText('Feb 14, 2015 – Apr 3, 2015')

    // And the value round-trips through to the audit-log query string.
    const expectedFrom = ymd(new Date(2015, 1, 14))
    const expectedTo = ymd(new Date(2015, 3, 3))

    // Reopen and Apply again so a fresh request fires (parent props
    // didn't change, but the API call was emitted on the original Apply).
    // Simpler: assert the URL on the *next* render by re-triggering Apply
    // through Clear → restore. Easier still: just check the trigger text
    // already done above; query-string round-trip is covered by the
    // dedicated Apply test in the earlier describe block.
    void expectedFrom
    void expectedTo
  })
})

test.describe('DateRangeInput — two-panel layout (wide viewport)', () => {
  // Wide viewport activates the side-by-side two-month layout. With the
  // new implementation each panel has its own controlled `month` state
  // and its own set of dropdowns; the right panel can't navigate before
  // the left's month and vice versa.
  test.use({ viewport: { width: 1280, height: 800 } })

  /** Left panel dropdowns (first two comboboxes in the popover). */
  const leftMonthDD = (page: Page): Locator =>
    popover(page).getByRole('combobox').nth(0)
  const leftYearDD = (page: Page): Locator =>
    popover(page).getByRole('combobox').nth(1)
  /** Right panel dropdowns. */
  const rightMonthDD = (page: Page): Locator =>
    popover(page).getByRole('combobox').nth(2)
  const rightYearDD = (page: Page): Locator =>
    popover(page).getByRole('combobox').nth(3)

  async function pickInListbox(page: Page, name: string): Promise<void> {
    await page
      .getByRole('listbox')
      .getByRole('option', { name, exact: true })
      .click()
  }

  test('renders two independent panels with four dropdowns', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)
    await expect(popover(page).getByRole('combobox')).toHaveCount(4)

    // Default state: left = current month, right = next month (different
    // years if current month is December — but the year dropdowns are
    // adjacent so just assert the months differ).
    const leftMonth = (await leftMonthDD(page).textContent()) ?? ''
    const rightMonth = (await rightMonthDD(page).textContent()) ?? ''
    expect(leftMonth).not.toBe(rightMonth)
  })

  test('changing right panel month does NOT change left panel', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    const leftMonthBefore = await leftMonthDD(page).textContent()
    const leftYearBefore = await leftYearDD(page).textContent()

    // Move the right panel forward to December of the current right year.
    await rightMonthDD(page).click()
    await pickInListbox(page, 'December')

    // Left untouched.
    await expect(leftMonthDD(page)).toHaveText(leftMonthBefore ?? '')
    await expect(leftYearDD(page)).toHaveText(leftYearBefore ?? '')
    // Right reflects the new month.
    await expect(rightMonthDD(page)).toContainText('December')
  })

  test('changing right panel year does NOT change left panel', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    const leftMonthBefore = await leftMonthDD(page).textContent()
    const leftYearBefore = await leftYearDD(page).textContent()

    // Right year +5 (well past the current year, but within the default
    // 10-year forward bound of Calendar's DEFAULT_END_MONTH).
    const targetYear = String(new Date().getFullYear() + 5)
    await rightYearDD(page).click()
    await pickInListbox(page, targetYear)

    await expect(leftMonthDD(page)).toHaveText(leftMonthBefore ?? '')
    await expect(leftYearDD(page)).toHaveText(leftYearBefore ?? '')
    await expect(rightYearDD(page)).toContainText(targetYear)
  })

  test('changing left panel month does NOT change right panel', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    const rightMonthBefore = await rightMonthDD(page).textContent()
    const rightYearBefore = await rightYearDD(page).textContent()

    // Move the left panel back to January of the current left year.
    await leftMonthDD(page).click()
    await pickInListbox(page, 'January')

    await expect(rightMonthDD(page)).toHaveText(rightMonthBefore ?? '')
    await expect(rightYearDD(page)).toHaveText(rightYearBefore ?? '')
    await expect(leftMonthDD(page)).toContainText('January')
  })

  test('right panel year dropdown excludes years before the left panel', async ({
    page,
  }) => {
    // Default state: left = current month, right = current month + 1.
    // The right's `startMonth` is bound to leftMonth, so its year
    // dropdown must hide every year strictly before the left's.
    await gotoAuditLog(page)
    await openPicker(page)

    const leftYearText = (await leftYearDD(page).textContent()) ?? ''
    const leftYear = Number(leftYearText.trim())
    expect(Number.isFinite(leftYear)).toBe(true)

    await rightYearDD(page).click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    // leftYear − 1 must NOT be offered.
    await expect(
      listbox.getByRole('option', { name: String(leftYear - 1), exact: true }),
    ).toHaveCount(0)
    // leftYear itself IS offered (boundary inclusive: same month allowed).
    await expect(
      listbox.getByRole('option', { name: String(leftYear), exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('left panel year dropdown excludes years after the right panel', async ({
    page,
  }) => {
    // Symmetric to the previous test: left's `endMonth` is bound to
    // rightMonth, so its year dropdown must hide every year strictly
    // after the right's.
    await gotoAuditLog(page)
    await openPicker(page)

    const rightYearText = (await rightYearDD(page).textContent()) ?? ''
    const rightYear = Number(rightYearText.trim())
    expect(Number.isFinite(rightYear)).toBe(true)

    await leftYearDD(page).click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    await expect(
      listbox.getByRole('option', { name: String(rightYear + 1), exact: true }),
    ).toHaveCount(0)
    await expect(
      listbox.getByRole('option', { name: String(rightYear), exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('right panel month dropdown hides earlier months when both panels share a year', async ({
    page,
  }) => {
    // The default state has left = current month and right = current+1
    // month, both in the same calendar year (except in December, when
    // they cross into January of the next year — this test skips that
    // edge case rather than fight it). Inside a shared year the right's
    // month dropdown must hide all months strictly before the left's.
    await gotoAuditLog(page)
    await openPicker(page)

    const leftYear = (await leftYearDD(page).textContent())?.trim() ?? ''
    const rightYear = (await rightYearDD(page).textContent())?.trim() ?? ''
    test.skip(
      leftYear !== rightYear,
      'default panels are not on the same year (December edge case)',
    )

    const leftMonthText = (await leftMonthDD(page).textContent())?.trim() ?? ''
    const leftMonthIdx = MONTHS_LONG.findIndex((m) => m === leftMonthText)
    expect(leftMonthIdx).toBeGreaterThanOrEqual(0)

    await rightMonthDD(page).click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    // rdp emits all 12 months in the dropdown and flags out-of-range ones
    // as `disabled` (unlike year options, which are filtered out). The
    // shadcn SelectItem forwards `disabled` to the Radix primitive, which
    // sets aria-disabled="true" — Playwright's `toBeDisabled` matcher
    // picks that up.
    for (let i = 0; i < leftMonthIdx; i++) {
      await expect(
        listbox.getByRole('option', { name: MONTHS_LONG[i]!, exact: true }),
      ).toBeDisabled()
    }
    // The left's month itself IS enabled (same month boundary inclusive).
    await expect(
      listbox.getByRole('option', { name: MONTHS_LONG[leftMonthIdx]!, exact: true }),
    ).toBeEnabled()
    // And every month after the left's is also enabled.
    for (let i = leftMonthIdx + 1; i < MONTHS_LONG.length; i++) {
      await expect(
        listbox.getByRole('option', { name: MONTHS_LONG[i]!, exact: true }),
      ).toBeEnabled()
    }
    await page.keyboard.press('Escape')
  })

  test('after pushing right forward, the left can then advance past today', async ({
    page,
  }) => {
    // End-to-end proof that the constraint composes: pushing the right
    // panel forward unlocks the left's upper bound, after which the left
    // can move past today's year — and pushing the left to the same
    // future year then propagates back to constrain the right.
    await gotoAuditLog(page)
    await openPicker(page)

    const future = new Date().getFullYear() + 3

    // Step 1: right forward to `future`. Before this, the left year
    // dropdown does NOT list `future`.
    await rightYearDD(page).click()
    await pickInListbox(page, String(future))

    // Step 2: now the left's year dropdown DOES list `future`. Pick it.
    await leftYearDD(page).click()
    await expect(
      page.getByRole('listbox').getByRole('option', { name: String(future), exact: true }),
    ).toBeVisible()
    await pickInListbox(page, String(future))
    await expect(leftYearDD(page)).toContainText(String(future))

    // Step 3: the right's year dropdown must now exclude `future - 1`.
    await rightYearDD(page).click()
    await expect(
      page.getByRole('listbox').getByRole('option', { name: String(future - 1), exact: true }),
    ).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('range selection spans both panels (click left start, click right end)', async ({
    page,
  }) => {
    await gotoAuditLog(page)
    await openPicker(page)

    // Set left = March 2015, right = May 2015 via dropdowns.
    await leftYearDD(page).click()
    await pickInListbox(page, '2015')
    await leftMonthDD(page).click()
    await pickInListbox(page, 'March')
    await rightYearDD(page).click()
    await pickInListbox(page, '2015')
    await rightMonthDD(page).click()
    await pickInListbox(page, 'May')

    // Click day 10 in the LEFT panel (March), then day 20 in the RIGHT (May).
    // The left panel's td:not(.day-outside) selector inside popover() still
    // matches multiple cells — there's a "10" in both March and May. Scope
    // to each panel by month-grid heading or by .nth() on the month wrappers.
    // Easiest: use the rdp role="grid" — one per Calendar instance.
    const grids = popover(page).getByRole('grid')
    await expect(grids).toHaveCount(2)

    const leftGrid = grids.nth(0)
    const rightGrid = grids.nth(1)

    await leftGrid
      .locator('td:not(.day-outside)')
      .locator('button:text-is("10")')
      .first()
      .click()
    await rightGrid
      .locator('td:not(.day-outside)')
      .locator('button:text-is("20")')
      .first()
      .click()

    await popover(page).getByRole('button', { name: /^Apply$/ }).click()
    await expect(popover(page)).toBeHidden()
    await expect(trigger(page)).toContainText('Mar 10, 2015 – May 20, 2015')
  })
})
