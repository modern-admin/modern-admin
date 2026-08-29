import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { menuOf, openSubmenu } from './_menu.js'

/**
 * Per-record action visibility, end to end.
 *
 * `products` declares a mutually exclusive pair
 * (`apps/_shared/src/admin/products/products.controller.ts`):
 *   • `archive`  — `isVisible: (ctx) => ctx.record?.params.inStock === true`
 *   • `restock`  — `isVisible: (ctx) => ctx.record?.params.inStock !== true`
 *
 * `ResourceJSON.actions` cannot answer which of the two a given row offers —
 * it is serialized without any record — so `ModernAdmin.invoke()` resolves
 * the predicates per record and reports the survivors in
 * `RecordJSON.recordActions`, which the row menu consults.
 *
 * This spec pins both halves: the wire contract, and the menu the operator
 * actually sees.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

interface ListRecord {
  id: string
  params: { inStock?: boolean }
  recordActions?: string[]
}

async function listProducts(request: APIRequestContext): Promise<ListRecord[]> {
  const res = await request.get(adminApi('/resources/products/actions/list?perPage=40'))
  expect(res.ok()).toBeTruthy()
  return (await res.json()).records as ListRecord[]
}

/** Rows holding real data — the loading state renders one `aria-busy`
 *  placeholder row per page slot, which would otherwise match by position. */
function dataRows(page: Page) {
  return page.locator('tbody tr:not([aria-busy="true"])')
}

/**
 * Open the row-actions menu of the row showing `recordId` and read the items
 * of its `submenu` sub-menu.
 *
 * Three things here are deliberate, each having produced a CI flake:
 *
 *   • A fresh page load per read. Dismissing a Radix menu leaves its popper
 *     briefly intercepting pointer events, so opening a second row's menu on
 *     the same page races that teardown.
 *   • `openSubmenu` rather than `hover()` — see `_menu.ts` for why pointer
 *     actions on a sub-trigger are unreliable under CI load.
 *
 * The row is addressed by record id, not by position, so the API's list
 * order and the table's render order don't have to agree.
 */
async function submenuItems(page: Page, recordId: string, submenu: string): Promise<string[]> {
  await page.goto('/resources/products?perPage=40')
  await expect(dataRows(page).first()).toBeVisible({ timeout: 15_000 })

  const row = dataRows(page).filter({ hasText: recordId })
  await expect(row).toHaveCount(1, { timeout: 10_000 })
  await row.getByRole('button', { name: /^open menu$/i }).click()

  // The dropdown is labelled by its trigger, whose accessible name is
  // "Open menu" — that scopes every lookup below to this row.
  const rowMenu = menuOf(page, /^open menu$/i)
  await expect(rowMenu).toBeVisible({ timeout: 5_000 })

  const sub = await openSubmenu(page, rowMenu, submenu)
  return (await sub.getByRole('menuitem').allTextContents()).map((s) => s.trim())
}

test.describe('Per-record action visibility', () => {
  test('the API reports exactly one of archive/restock per row', async ({ request }) => {
    const records = await listProducts(request)
    expect(records.length).toBeGreaterThan(0)

    let sawInStock = false
    let sawOutOfStock = false
    for (const record of records) {
      const actions = record.recordActions ?? []
      expect(actions, `row ${record.id} carries no recordActions`).not.toHaveLength(0)
      if (record.params.inStock === true) {
        sawInStock = true
        expect(actions).toContain('archive')
        expect(actions).not.toContain('restock')
      } else {
        sawOutOfStock = true
        expect(actions).toContain('restock')
        expect(actions).not.toContain('archive')
      }
    }
    // A one-sided fixture would make the assertions above vacuous.
    expect(sawInStock, 'no in-stock product in the fixture').toBeTruthy()
    expect(sawOutOfStock, 'no out-of-stock product in the fixture').toBeTruthy()
  })

  test('actions declared isVisible: false are not advertised to the SPA', async ({ request }) => {
    // `values` and `search` back comboboxes and the global search box; they
    // are not operator-facing menu entries.
    const res = await request.get(adminApi('/config'))
    expect(res.ok()).toBeTruthy()
    const config = await res.json()
    const products = (
      config.resources as Array<{ id: string; actions: Array<{ name: string }> }>
    ).find((r) => r.id === 'products')!
    const names = products.actions.map((a) => a.name)
    expect(names).not.toContain('values')
    expect(names).not.toContain('search')
    // Record actions stay listed — they are narrowed per row, not here.
    expect(names).toEqual(expect.arrayContaining(['archive', 'restock']))
  })

  test('the row menu offers only the action that applies to that row', async ({
    page,
    request,
  }) => {
    const records = await listProducts(request)
    const inStock = records.find((r) => r.params.inStock === true)
    const outOfStock = records.find((r) => r.params.inStock !== true)
    expect(inStock, 'no in-stock product in the fixture').toBeDefined()
    expect(outOfStock, 'no out-of-stock product in the fixture').toBeDefined()

    expect(await submenuItems(page, inStock!.id, 'Inventory')).toEqual(['Archive'])
    expect(await submenuItems(page, outOfStock!.id, 'Inventory')).toEqual(['Restock'])
  })
})
