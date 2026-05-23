import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Custom @Action decorators exposed by the reference admin controllers.
 *
 * Coverage:
 *   • Record-level actions on `posts` — `publish` / `unpublish` flip the
 *     `published` flag through `record.update()`.
 *   • Bulk-level action on `posts` — `publishMany` publishes a list of
 *     ids posted under `recordIds`.
 *   • Record-level actions on `products` — `archive` / `restock` and
 *     `duplicateSku`.
 *   • Resource-level action on `products` — `markFeaturedPalette` rewrites
 *     the accentColor on the first 6 products with a fixed palette.
 *
 * All requests go through the canonical
 *   POST /admin/api/resources/:id/records/:recordId/actions/:action
 *   POST /admin/api/resources/:id/actions/:action
 * shapes wired in `packages/nest/src/resource.controller.ts`.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

async function firstPost(request: APIRequestContext): Promise<{ id: string; published: boolean }> {
  const res = await request.get(admin('/resources/posts/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.records.length).toBeGreaterThan(0)
  const r = body.records[0]
  return { id: String(r.id), published: Boolean(r.params.published) }
}

async function firstProduct(request: APIRequestContext): Promise<{ id: string; inStock: boolean; sku: string }> {
  const res = await request.get(admin('/resources/products/actions/list?perPage=1'))
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.records.length).toBeGreaterThan(0)
  const r = body.records[0]
  return { id: String(r.id), inStock: Boolean(r.params.inStock), sku: String(r.params.sku) }
}

async function readPost(request: APIRequestContext, id: string) {
  const res = await request.get(admin(`/resources/posts/records/${id}/actions/show`))
  expect(res.ok()).toBeTruthy()
  return (await res.json()).record.params as { published: boolean; publishedAt: string | null }
}

async function readProduct(request: APIRequestContext, id: string) {
  const res = await request.get(admin(`/resources/products/records/${id}/actions/show`))
  expect(res.ok()).toBeTruthy()
  return (await res.json()).record.params as { inStock: boolean; quantity: number; sku: string; accentColor: string }
}

test.describe('Custom @Action — record-level (posts)', () => {
  test('publish / unpublish toggle the `published` flag', async ({ request }) => {
    const post = await firstPost(request)

    // Force a known starting state so the assertion direction is stable.
    const start: 'publish' | 'unpublish' = post.published ? 'unpublish' : 'publish'
    const startRes = await request.post(
      admin(`/resources/posts/records/${post.id}/actions/${start}`),
    )
    expect(startRes.ok(), await startRes.text().catch(() => '')).toBeTruthy()
    const before = await readPost(request, post.id)
    expect(before.published).toBe(start === 'publish')

    // Flip back through the inverse action.
    const inverse = start === 'publish' ? 'unpublish' : 'publish'
    const flipRes = await request.post(
      admin(`/resources/posts/records/${post.id}/actions/${inverse}`),
    )
    expect(flipRes.ok()).toBeTruthy()
    const after = await readPost(request, post.id)
    expect(after.published).toBe(inverse === 'publish')
  })
})

test.describe('Custom @Action — bulk (posts)', () => {
  test('publishMany flips published=true for every selected id', async ({ request }) => {
    // Pick two posts that are currently unpublished. The seed uses
    // `rng() > 0.2` so roughly 20% of posts are unpublished — easy to find.
    const list = await request.get(admin('/resources/posts/actions/list?perPage=100'))
    expect(list.ok()).toBeTruthy()
    const body = await list.json()
    const unpublished = (body.records as Array<{ id: string; params: { published: boolean } }>)
      .filter((r) => r.params.published === false)
      .slice(0, 2)

    if (unpublished.length < 2) {
      test.skip(true, 'not enough unpublished posts in the current seed window')
      return
    }
    const ids = unpublished.map((r) => String(r.id))

    const res = await request.post(admin('/resources/posts/actions/publishMany'), {
      data: { recordIds: ids },
    })
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()

    for (const id of ids) {
      const after = await readPost(request, id)
      expect(after.published).toBe(true)
    }
  })
})

test.describe('Custom @Action — record-level (products)', () => {
  test('archive sets inStock=false and quantity=0', async ({ request }) => {
    // Find a product currently in stock.
    const list = await request.get(admin('/resources/products/actions/list?perPage=100'))
    expect(list.ok()).toBeTruthy()
    const body = await list.json()
    const target = (body.records as Array<{ id: string; params: { inStock: boolean } }>)
      .find((r) => r.params.inStock === true)
    if (!target) {
      test.skip(true, 'no in-stock product in current seed')
      return
    }

    const res = await request.post(
      admin(`/resources/products/records/${target.id}/actions/archive`),
    )
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
    const after = await readProduct(request, String(target.id))
    expect(after.inStock).toBe(false)
    expect(after.quantity).toBe(0)
  })

  test('restock returns inStock=true and bumps quantity to at least 25', async ({ request }) => {
    // Find an archived product (preferably one we just archived above).
    const list = await request.get(admin('/resources/products/actions/list?perPage=100'))
    expect(list.ok()).toBeTruthy()
    const body = await list.json()
    const target = (body.records as Array<{ id: string; params: { inStock: boolean } }>)
      .find((r) => r.params.inStock === false)
    if (!target) {
      test.skip(true, 'no out-of-stock product in current seed')
      return
    }

    const res = await request.post(
      admin(`/resources/products/records/${target.id}/actions/restock`),
    )
    expect(res.ok()).toBeTruthy()
    const after = await readProduct(request, String(target.id))
    expect(after.inStock).toBe(true)
    expect(after.quantity).toBeGreaterThanOrEqual(25)
  })

  test('duplicateSku generates a new SKU', async ({ request }) => {
    const before = await firstProduct(request)
    const res = await request.post(
      admin(`/resources/products/records/${before.id}/actions/duplicateSku`),
    )
    expect(res.ok()).toBeTruthy()
    const after = await readProduct(request, before.id)
    expect(after.sku).not.toBe(before.sku)
    expect(after.sku.length).toBeGreaterThan(0)
  })
})

test.describe('Custom @Action — resource-level (products)', () => {
  test('markFeaturedPalette rewrites accentColor on the first six products', async ({ request }) => {
    const palette = new Set(['#0f172a', '#1d4ed8', '#7c3aed', '#be123c', '#0f766e', '#c2410c'])
    const res = await request.post(admin('/resources/products/actions/markFeaturedPalette'))
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()

    const list = await request.get(admin('/resources/products/actions/list?perPage=6'))
    expect(list.ok()).toBeTruthy()
    const body = await list.json()
    const records = body.records as Array<{ params: { accentColor: string } }>
    expect(records.length).toBe(6)
    for (const r of records) {
      expect(palette.has(r.params.accentColor)).toBe(true)
    }
  })
})
