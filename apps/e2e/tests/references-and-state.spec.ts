import { expect, test, type Page } from '@playwright/test'

/**
 * Areas not yet covered by other specs:
 *
 *   1. Reference (FK) cells in the list table resolve the referenced
 *      record's title and render it as a Badge link — not the raw UUID.
 *      Exercises the React `<ReferenceLink>` + backend show() pair.
 *
 *   2. Clicking a reference Badge on a record's show page navigates to the
 *      related record's show page.
 *
 *   3. Direct deep-links (`?perPage=…&sortBy=…&direction=…`) hydrate the
 *      list page controls correctly — verifies URL→state restoration on
 *      first render, not just write-after-click.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

async function waitForRows(page: Page, min = 1): Promise<void> {
  await expect(page.locator('tbody tr').nth(min - 1)).toBeVisible({
    timeout: 10_000,
  })
}

test.describe('Reference rendering', () => {
  test('posts list shows the author as a readable badge, not a raw UUID', async ({
    page,
  }) => {
    await page.goto('/resources/posts')
    await waitForRows(page)

    // The Posts list defines a column header "Author" / "AuthorId" (label
    // derived from the property name). Locate it from the header row so we
    // know which column index to read on data rows.
    const headerRow = page.locator('thead tr').first()
    const headers = await headerRow.locator('th').allInnerTexts()
    const authorIdx = headers.findIndex((h) =>
      /author/i.test(h.trim()),
    )
    expect(authorIdx, `no Author column found in headers: ${headers.join(' | ')}`)
      .toBeGreaterThanOrEqual(0)

    // Read every visible data row's authorId cell and assert each one
    // resolved to a non-empty, non-UUID label. The reference cell renders
    // a `<Badge>` wrapped in a Link — its innerText is the resolved title.
    const cells = page.locator('tbody tr').locator('td').nth(authorIdx)
    const count = await page.locator('tbody tr').count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const txt = (
        await page.locator('tbody tr').nth(i).locator('td').nth(authorIdx).innerText()
      ).trim()
      // Empty cell, raw UUID, or `#<uuid>` fallback would all fail this.
      expect(txt, `row ${i} authorId cell text`).not.toEqual('')
      expect(txt, `row ${i} authorId cell text "${txt}" looks like a UUID`).not.toMatch(
        UUID_RE,
      )
      expect(txt, `row ${i} authorId cell text "${txt}" is unresolved #<id>`).not.toMatch(
        /^#[0-9a-f]{6,}/i,
      )
    }
    // Silence unused-var lints; `cells` retained for locator clarity.
    void cells
  })

  test('clicking an authorId badge on the posts list jumps to the customer show page', async ({
    page,
  }) => {
    await page.goto('/resources/posts')
    await waitForRows(page)

    const headers = await page.locator('thead tr').first().locator('th').allInnerTexts()
    const authorIdx = headers.findIndex((h) => /author/i.test(h.trim()))
    expect(authorIdx).toBeGreaterThanOrEqual(0)

    const firstAuthorCell = page.locator('tbody tr').first().locator('td').nth(authorIdx)
    // The Badge is wrapped in a <a href="/resources/customers/:id">.
    const link = firstAuthorCell.locator('a').first()
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toMatch(/\/resources\/customers\/[^/]+$/)

    await link.click()
    await expect(page).toHaveURL(/\/resources\/customers\/[^/]+$/, { timeout: 10_000 })
    // Confirm we're on a customer show page — heading carries the resource id.
    await expect(
      page.getByRole('heading', { name: /customers\s*#/i }),
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('List page — deep-link URL state', () => {
  test('opening with ?perPage=10 renders exactly 10 rows and the selector reflects 10', async ({
    page,
  }) => {
    await page.goto('/resources/customers?perPage=10')
    await waitForRows(page)

    // The toolbar paginator's per-page Select shows the current value as
    // its trigger text. Two `perPage` selects render (mobile/desktop
    // duplicate) — picking the first visible one is enough.
    const trigger = page.getByRole('combobox').filter({ hasText: /^10$/ }).first()
    await expect(trigger).toBeVisible({ timeout: 10_000 })

    // Exactly 10 rows (customers seed has 30, so a full page).
    await expect(page.locator('tbody tr')).toHaveCount(10)
  })

  test('opening with ?sortBy=name&direction=desc orders rows server-side', async ({
    page,
  }) => {
    // Sorted desc, the first row's Name should be alphabetically >= the
    // last row's Name (string compare). We don't pin a specific name
    // because the seed list can evolve.
    await page.goto('/resources/customers?sortBy=name&direction=desc&perPage=20')
    await waitForRows(page)

    const headers = await page.locator('thead tr').first().locator('th').allInnerTexts()
    const nameIdx = headers.findIndex((h) => /^full name$/i.test(h.trim()))
    expect(nameIdx).toBeGreaterThanOrEqual(0)

    const firstName = (
      await page.locator('tbody tr').first().locator('td').nth(nameIdx).innerText()
    ).trim()
    const lastName = (
      await page.locator('tbody tr').last().locator('td').nth(nameIdx).innerText()
    ).trim()

    expect(firstName).not.toEqual('')
    expect(lastName).not.toEqual('')
    // Case-insensitive descending compare: first ≥ last.
    expect(firstName.localeCompare(lastName, undefined, { sensitivity: 'base' }))
      .toBeGreaterThanOrEqual(0)
  })
})
