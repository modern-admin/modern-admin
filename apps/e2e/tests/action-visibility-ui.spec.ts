import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

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

/** Open a row's "…" menu and return the items of one of its submenus. */
async function submenuItems(page: Page, row: number, submenu: string): Promise<string[]> {
  await page.locator(`tbody tr:nth-child(${row}) button[aria-haspopup="menu"]`).click()
  await page.getByRole('menuitem', { name: submenu, exact: true }).hover()
  const menu = page.getByRole('menu', { name: submenu })
  await expect(menu).toBeVisible({ timeout: 5_000 })
  return (await menu.getByRole('menuitem').allTextContents()).map((s) => s.trim())
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

  test('actions declared isVisible: false are not advertised to the SPA', async ({
    request,
  }) => {
    // `values` and `search` back comboboxes and the global search box; they
    // are not operator-facing menu entries.
    const res = await request.get(adminApi('/config'))
    expect(res.ok()).toBeTruthy()
    const config = await res.json()
    const products = (config.resources as Array<{ id: string; actions: Array<{ name: string }> }>)
      .find((r) => r.id === 'products')!
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
    const inStockIdx = records.findIndex((r) => r.params.inStock === true)
    const outOfStockIdx = records.findIndex((r) => r.params.inStock !== true)
    expect(inStockIdx).toBeGreaterThanOrEqual(0)
    expect(outOfStockIdx).toBeGreaterThanOrEqual(0)

    await page.goto('/resources/products?perPage=40')
    await expect(
      page.getByRole('heading', { name: /products/i }).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Rows render in list order, so the API indices map to table rows 1-based.
    const inStockItems = await submenuItems(page, inStockIdx + 1, 'Inventory')
    expect(inStockItems).toEqual(['Archive'])

    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    const outOfStockItems = await submenuItems(page, outOfStockIdx + 1, 'Inventory')
    expect(outOfStockItems).toEqual(['Restock'])
  })
})
