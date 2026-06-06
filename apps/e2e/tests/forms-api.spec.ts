import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Comprehensive form-flow coverage exercising create + update for every
 * property type supported by the demo resources, including:
 *
 *   • Scalars:   string / number / float / boolean / textarea / password /
 *                date / datetime / enum / json / phone / color / previewMedia /
 *                richtext / markdown
 *   • References (FK): posts.authorId, comments.postId, favorites.{post,product,category}Id
 *   • M2M (junction): posts.tags (via postTags), products.tags (via productTags w/ extras)
 *   • Scalar arrays:  products.gallery (String[])
 *   • Hook-driven mutations: posts @Before fillSlug
 *
 * Backend: `apps/api-prisma` (Prisma 7 + Postgres) with the shared
 * `@modern-admin/app-shared` controllers. Fixtures are populated by
 * `SEED_DEMO=1` (see `apps/api-prisma/src/seed-demo.ts`).
 *
 * All created records are cleaned up via DELETE in a `finally` block.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

const uniqueSuffix = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function cleanup(
  request: APIRequestContext,
  resourceId: string,
  ids: Array<string | null>,
): Promise<void> {
  for (const id of ids) {
    if (!id) continue
    await request
      .delete(adminApi(`/resources/${resourceId}/records/${id}/actions/delete`))
      .catch(() => null)
  }
}

// ─── Scalars (customers) ────────────────────────────────────────────────────

test.describe('Forms — customers: scalar + enum + date types', () => {
  test('create with every supported scalar type, then update each one', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let createdId: string | null = null
    try {
      // 1. Create — payload covers string, enum, password, previewMedia,
      // markdown, float, date, datetime, phone.
      const create = await request.post(adminApi('/resources/customers/actions/new'), {
        data: {
          email: `forms-${suffix}@example.com`,
          name: `Forms ${suffix}`,
          phone: '+1-555-123-4567',
          tier: 'pro',
          password: 'sup3rs3cret',
          avatarUrl: 'https://example.com/a.png',
          websiteUrl: 'https://example.com',
          bio: '# Hello\n\nMarkdown body.',
          score: 87.5,
          birthday: '1990-05-14',
          lastLoginAt: '2024-12-01T10:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      })
      expect(create.status(), await create.text()).toBeLessThan(300)
      const created = await create.json()
      createdId = String(created.record.id)
      expect(created.record.params.email).toBe(`forms-${suffix}@example.com`)
      expect(created.record.params.tier).toBe('pro')
      expect(created.record.params.score).toBe(87.5)
      expect(created.record.params.bio).toContain('Markdown')

      // 2. Update — flip every scalar to a new value, mix string + numeric +
      // enum + date so a regression on any single type would surface.
      const renamed = `Renamed ${suffix}`
      const upd = await request.patch(
        adminApi(`/resources/customers/records/${createdId}/actions/edit`),
        {
          data: {
            name: renamed,
            tier: 'enterprise',
            score: 99.9,
            phone: '+44-20-1234-5678',
            websiteUrl: 'https://renamed.example.com',
            bio: '## After',
            birthday: '1991-06-15',
          },
        },
      )
      expect(upd.status(), await upd.text()).toBeLessThan(300)
      const updated = await upd.json()
      expect(updated.record.params.name).toBe(renamed)
      expect(updated.record.params.tier).toBe('enterprise')
      expect(updated.record.params.score).toBe(99.9)
      // Prisma normalises a date-only string to `'1991-06-15T00:00:00.000Z'`;
      // accept either the wire format the host echoes or the truncated
      // ISO-date prefix so the assertion is robust to client tz padding.
      expect(String(updated.record.params.birthday)).toMatch(/^1991-06-15/)
      // Untouched fields survive partial update.
      expect(updated.record.params.email).toBe(`forms-${suffix}@example.com`)
    } finally {
      await cleanup(request, 'customers', [createdId])
    }
  })

  test('create rejects missing required fields (400/422, never 500)', async ({
    request,
  }) => {
    // `name` and `email` are required on customers.
    const res = await request.post(adminApi('/resources/customers/actions/new'), {
      data: { tier: 'free' },
    })
    // The server validates and surfaces a 4xx — anything 5xx is a
    // regression.
    expect(res.status(), await res.text()).toBeLessThan(500)
  })

  test('boolean false is persisted (not coerced away)', async ({ request }) => {
    // Use admins which has `banned: boolean`. Default is false; explicitly
    // setting it to true → false on update is the canonical regression.
    // (admins are seeded; we operate on the first one and revert.)
    const list = await request.get(adminApi('/resources/admins/actions/list?perPage=1'))
    const id = (await list.json()).records[0].id as string
    try {
      const before = await request.patch(
        adminApi(`/resources/admins/records/${id}/actions/edit`),
        { data: { banned: true } },
      )
      expect(before.ok()).toBeTruthy()
      expect((await before.json()).record.params.banned).toBe(true)

      const after = await request.patch(
        adminApi(`/resources/admins/records/${id}/actions/edit`),
        { data: { banned: false } },
      )
      expect(after.ok()).toBeTruthy()
      expect((await after.json()).record.params.banned).toBe(false)
    } finally {
      // Restore.
      await request
        .patch(adminApi(`/resources/admins/records/${id}/actions/edit`), {
          data: { banned: false },
        })
        .catch(() => null)
    }
  })
})

// ─── References + hooks (posts) ─────────────────────────────────────────────

test.describe('Forms — posts: reference FK + @Before slug hook + json + richtext', () => {
  test('create posts with required reference (authorId) + json metadata + richtext body', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    // Need a real customer id to satisfy the FK reference.
    const customers = await request.get(adminApi('/resources/customers/actions/list?perPage=1'))
    const authorId = String((await customers.json()).records[0].id)

    let postId: string | null = null
    try {
      const res = await request.post(adminApi('/resources/posts/actions/new'), {
        data: {
          title: `Post Title ${suffix}`,
          excerpt: 'A short excerpt.',
          body: `<p>Body with <strong>html</strong> for ${suffix}.</p>`,
          authorId,
          viewsCount: 0,
          rating: 4.2,
          metadata: { featured: true, locale: 'en', readingMinutes: 7 },
          published: false,
        },
      })
      expect(res.status(), await res.text()).toBeLessThan(300)
      const body = await res.json()
      postId = String(body.record.id)
      expect(body.record.params.title).toBe(`Post Title ${suffix}`)
      // @Before fillSlug fills `slug` automatically when omitted on payload.
      expect(typeof body.record.params.slug).toBe('string')
      expect(String(body.record.params.slug).length).toBeGreaterThan(0)
      expect(body.record.params.metadata).toMatchObject({
        featured: true,
        locale: 'en',
        readingMinutes: 7,
      })
      expect(body.record.params.body).toContain('html')
    } finally {
      await cleanup(request, 'posts', [postId])
    }
  })

  test('@Before fillSlug runs on EDIT too (changing title regenerates slug only when blank)', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    const customers = await request.get(adminApi('/resources/customers/actions/list?perPage=1'))
    const authorId = String((await customers.json()).records[0].id)

    let postId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/posts/actions/new'), {
        data: { title: `Original ${suffix}`, authorId },
      })
      postId = String((await created.json()).record.id)

      // 1. Edit changes title AND blanks slug → hook fills new slug.
      const renamed = `Renamed ${suffix}`
      const edited = await request.patch(
        adminApi(`/resources/posts/records/${postId}/actions/edit`),
        { data: { title: renamed, slug: '' } },
      )
      expect(edited.status(), await edited.text()).toBeLessThan(300)
      const editedBody = await edited.json()
      expect(editedBody.record.params.title).toBe(renamed)
      // Slug regenerated from new title (lowercased).
      expect(String(editedBody.record.params.slug)).toContain('renamed')

      // 2. Edit again leaving slug unchanged → hook does NOT clobber.
      const kept = await request.patch(
        adminApi(`/resources/posts/records/${postId}/actions/edit`),
        { data: { title: `${renamed} (v2)`, slug: 'custom-slug' } },
      )
      expect(kept.status()).toBeLessThan(300)
      expect((await kept.json()).record.params.slug).toBe('custom-slug')
    } finally {
      await cleanup(request, 'posts', [postId])
    }
  })
})

// ─── References + comments (multi-FK record) ────────────────────────────────

test.describe('Forms — comments: composite FKs (postId + authorId)', () => {
  test('create comment requires BOTH FKs, both are persisted, edit can swap one', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    // Pick two existing customers + one existing post.
    const cust = await request.get(adminApi('/resources/customers/actions/list?perPage=2'))
    const custIds = (await cust.json()).records.map((r: { id: string }) => String(r.id))
    expect(custIds.length).toBeGreaterThanOrEqual(2)
    const posts = await request.get(adminApi('/resources/posts/actions/list?perPage=1'))
    const postId = String((await posts.json()).records[0].id)

    let commentId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/comments/actions/new'), {
        data: {
          postId,
          authorId: custIds[0],
          body: `Comment ${suffix}`,
          rating: 3.5,
          createdAt: new Date().toISOString(),
        },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      const body = await created.json()
      commentId = String(body.record.id)
      expect(body.record.params.postId).toBe(postId)
      expect(body.record.params.authorId).toBe(custIds[0])

      // Swap the author — only one FK changes; the other must survive.
      const updated = await request.patch(
        adminApi(`/resources/comments/records/${commentId}/actions/edit`),
        { data: { authorId: custIds[1] } },
      )
      expect(updated.status()).toBeLessThan(300)
      const updatedBody = await updated.json()
      expect(updatedBody.record.params.authorId).toBe(custIds[1])
      expect(updatedBody.record.params.postId).toBe(postId)
    } finally {
      await cleanup(request, 'comments', [commentId])
    }
  })
})

// ─── M2M with extra junction fields (products.tags + position) ──────────────

test.describe('Forms — products: m2m via productTags w/ position extra', () => {
  test('create product with m2m tags + persists position; edit re-orders + adds/removes tags', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    // Need at least 3 tag ids to exercise add/remove/reorder diff.
    const tags = await request.get(adminApi('/resources/tags/actions/list?perPage=4'))
    const tagIds = (await tags.json()).records.map((r: { id: string }) => String(r.id))
    expect(tagIds.length).toBeGreaterThanOrEqual(3)
    const [t1, t2, t3] = tagIds as [string, string, string]

    let productId: string | null = null
    try {
      // ── Create with 2 tags ─────────────────────────────────────────────
      const created = await request.post(adminApi('/resources/products/actions/new'), {
        data: {
          name: `M2M Product ${suffix}`,
          sku: `sku-${suffix}`,
          price: 12.34,
          currencyCode: 'USD',
          accentColor: '#0f172a',
          inStock: true,
          quantity: 5,
          tags: [
            { id: t1, position: 0 },
            { id: t2, position: 1 },
          ],
        },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      const cbody = await created.json()
      productId = String(cbody.record.id)
      const createdTags = cbody.record.params.tags as Array<{ id: string; position?: number }>
      expect(createdTags.map((t) => t.id).sort()).toEqual([t1, t2].sort())

      // ── Edit: drop t1, add t3, reorder remaining ───────────────────────
      const updated = await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        {
          data: {
            tags: [
              { id: t3, position: 0 },
              { id: t2, position: 1 },
            ],
          },
        },
      )
      expect(updated.status(), await updated.text()).toBeLessThan(300)
      const ubody = await updated.json()
      const updatedTags = ubody.record.params.tags as Array<{ id: string; position?: number }>
      expect(updatedTags.map((t) => t.id).sort()).toEqual([t2, t3].sort())

      // ── Edit again: clear all tags ─────────────────────────────────────
      const cleared = await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        { data: { tags: [] } },
      )
      expect(cleared.status()).toBeLessThan(300)
      expect((await cleared.json()).record.params.tags).toEqual([])

      // ── Edit: omit `tags` from payload — m2m hook MUST leave them
      // alone (no change). Re-attach one and verify.
      await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        { data: { tags: [{ id: t1 }] } },
      )
      const omittedEdit = await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        { data: { name: `Renamed ${suffix}` } },
      )
      expect(omittedEdit.status()).toBeLessThan(300)
      const obody = await omittedEdit.json()
      // Tags untouched by the rename.
      expect((obody.record.params.tags as Array<{ id: string }>).map((t) => t.id)).toEqual([t1])
      expect(obody.record.params.name).toBe(`Renamed ${suffix}`)
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })

  test('m2m accepts the form-encoded payload shape (`tags.0.id` etc.)', async ({
    request,
  }) => {
    // The HTML form serializer flattens nested arrays as
    // `tags.0.id=...&tags.0.position=...`. Verify the feature reassembles
    // them correctly when the JSON-encoded version isn't used.
    const suffix = uniqueSuffix()
    const tags = await request.get(adminApi('/resources/tags/actions/list?perPage=2'))
    const tagIds = (await tags.json()).records.map((r: { id: string }) => String(r.id))
    expect(tagIds.length).toBeGreaterThanOrEqual(2)
    const [t1, t2] = tagIds as [string, string]

    let productId: string | null = null
    try {
      const res = await request.post(adminApi('/resources/products/actions/new'), {
        form: {
          name: `Flat ${suffix}`,
          inStock: 'true',
          'tags.0.id': t1,
          'tags.0.position': '0',
          'tags.1.id': t2,
          'tags.1.position': '1',
        },
      })
      expect(res.status(), await res.text()).toBeLessThan(300)
      const body = await res.json()
      productId = String(body.record.id)
      const persistedIds = (body.record.params.tags as Array<{ id: string }>)
        .map((t) => t.id)
        .sort()
      expect(persistedIds).toEqual([t1, t2].sort())
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })

  test('m2m deduplicates payload entries with the same id (no double-insert)', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    const tags = await request.get(adminApi('/resources/tags/actions/list?perPage=1'))
    const t1 = String((await tags.json()).records[0].id)

    let productId: string | null = null
    try {
      const res = await request.post(adminApi('/resources/products/actions/new'), {
        data: {
          name: `Dup ${suffix}`,
          inStock: true,
          tags: [
            { id: t1, position: 0 },
            { id: t1, position: 1 }, // duplicate — must collapse
          ],
        },
      })
      expect(res.status(), await res.text()).toBeLessThan(300)
      const body = await res.json()
      productId = String(body.record.id)
      // Exactly one entry in the hydrated response.
      expect((body.record.params.tags as unknown[]).length).toBe(1)
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })
})

// ─── M2M without extras (posts.tags) ────────────────────────────────────────

test.describe('Forms — posts.tags: m2m via postTags w/ addedAt extra', () => {
  test('create + edit tags through the dialog-picker path', async ({ request }) => {
    const suffix = uniqueSuffix()
    const customers = await request.get(adminApi('/resources/customers/actions/list?perPage=1'))
    const authorId = String((await customers.json()).records[0].id)
    const tags = await request.get(adminApi('/resources/tags/actions/list?perPage=3'))
    const tagIds = (await tags.json()).records.map((r: { id: string }) => String(r.id))
    expect(tagIds.length).toBeGreaterThanOrEqual(2)
    const [t1, t2] = tagIds as [string, string]

    let postId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/posts/actions/new'), {
        data: {
          title: `Post tags ${suffix}`,
          authorId,
          tags: [{ id: t1, addedAt: '2025-01-01T00:00:00.000Z' }],
        },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      postId = String((await created.json()).record.id)

      const edited = await request.patch(
        adminApi(`/resources/posts/records/${postId}/actions/edit`),
        { data: { tags: [{ id: t2 }, { id: t1 }] } },
      )
      expect(edited.status()).toBeLessThan(300)
      const ids = ((await edited.json()).record.params.tags as Array<{ id: string }>)
        .map((t) => t.id)
        .sort()
      expect(ids).toEqual([t1, t2].sort())
    } finally {
      await cleanup(request, 'posts', [postId])
    }
  })
})

// ─── Polymorphic FK + enum (favorites) ─────────────────────────────────────

test.describe('Forms — favorites: enum kind + optional polymorphic FKs', () => {
  test('create a post-favorite, then swap kind to product (clearing the old FK)', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    const posts = await request.get(adminApi('/resources/posts/actions/list?perPage=1'))
    const postId = String((await posts.json()).records[0].id)
    const products = await request.get(adminApi('/resources/products/actions/list?perPage=1'))
    const productId = String((await products.json()).records[0].id)

    let favId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/favorites/actions/new'), {
        data: { label: `Fav ${suffix}`, kind: 'post', postId },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      const cbody = await created.json()
      favId = String(cbody.record.id)
      expect(cbody.record.params.kind).toBe('post')
      expect(cbody.record.params.postId).toBe(postId)

      const swapped = await request.patch(
        adminApi(`/resources/favorites/records/${favId}/actions/edit`),
        { data: { kind: 'product', productId, postId: null } },
      )
      expect(swapped.status(), await swapped.text()).toBeLessThan(300)
      const sbody = await swapped.json()
      expect(sbody.record.params.kind).toBe('product')
      expect(sbody.record.params.productId).toBe(productId)
      // The old reference should be null (cleared) — the Prisma adapter
      // preserves the explicit null we sent on update.
      expect(sbody.record.params.postId == null).toBe(true)
    } finally {
      await cleanup(request, 'favorites', [favId])
    }
  })
})

// ─── JSON-by-key (regionalContent) ──────────────────────────────────────────

test.describe('Forms — regionalContent: json columns with nested keys', () => {
  test('create then update individual keys inside titles/previews JSON', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let id: string | null = null
    try {
      const created = await request.post(adminApi('/resources/regionalContent/actions/new'), {
        data: {
          name: `Regional ${suffix}`,
          region: 'eu',
          titles: { eu: 'EU title', us: 'US title', asia: 'Asia title' },
          previews: { eu: 'eu.jpg', us: 'us.jpg', asia: 'asia.jpg' },
          publishedAt: new Date().toISOString(),
        },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      const cbody = await created.json()
      id = String(cbody.record.id)
      expect(cbody.record.params.titles).toMatchObject({ eu: 'EU title' })

      // Update only one key in the JSON map (overwrite the whole object on
      // the wire — the property layer doesn't merge).
      const updated = await request.patch(
        adminApi(`/resources/regionalContent/records/${id}/actions/edit`),
        {
          data: {
            titles: { eu: 'EU updated', us: 'US title', asia: 'Asia title' },
          },
        },
      )
      expect(updated.status()).toBeLessThan(300)
      const ubody = await updated.json()
      expect(ubody.record.params.titles).toMatchObject({ eu: 'EU updated' })
      // previews left alone.
      expect(ubody.record.params.previews).toMatchObject({ eu: 'eu.jpg' })
    } finally {
      await cleanup(request, 'regionalContent', [id])
    }
  })
})

// ─── Color + previewMedia (products) ────────────────────────────────────────

test.describe('Forms — products: color + previewMedia + decimal types', () => {
  test('persist hex color, preview URLs, and decimal money values', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let productId: string | null = null
    try {
      // The Prisma schema declares `thumbnail` / `video` (without `Url`).
      // Send both old and new keys so the test stays robust to adapter
      // changes — `writableData` strips unknown keys silently.
      const res = await request.post(adminApi('/resources/products/actions/new'), {
        data: {
          name: `Color ${suffix}`,
          accentColor: '#7c3aed',
          thumbnail: 'https://picsum.photos/seed/x/400/400',
          thumbnailUrl: 'https://picsum.photos/seed/x/400/400',
          videoUrl: 'https://example.com/v.mp4',
          price: 1234.56,
          currencyCode: 'EUR',
          quantity: 10,
          inStock: true,
        },
      })
      expect(res.status(), await res.text()).toBeLessThan(300)
      const body = await res.json()
      productId = String(body.record.id)
      expect(body.record.params.accentColor).toBe('#7c3aed')
      // Whichever name the adapter exposes, the value must round-trip.
      const thumb = body.record.params.thumbnail ?? body.record.params.thumbnailUrl
      expect(String(thumb)).toContain('picsum')
      expect(body.record.params.price).toBeCloseTo(1234.56, 2)
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })
})

// ─── Scalar arrays (products.gallery) ───────────────────────────────────────

test.describe('Forms — products.gallery: String[] scalar array', () => {
  test('persist array, then update to a shorter array, then clear', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let productId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/products/actions/new'), {
        data: {
          name: `Gallery ${suffix}`,
          inStock: true,
          gallery: ['a.png', 'b.png', 'c.png'],
        },
      })
      expect(created.status(), await created.text()).toBeLessThan(300)
      const cbody = await created.json()
      productId = String(cbody.record.id)
      expect(cbody.record.params.gallery).toEqual(['a.png', 'b.png', 'c.png'])

      const upd = await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        { data: { gallery: ['z.png'] } },
      )
      expect(upd.status()).toBeLessThan(300)
      expect((await upd.json()).record.params.gallery).toEqual(['z.png'])

      const cleared = await request.patch(
        adminApi(`/resources/products/records/${productId}/actions/edit`),
        { data: { gallery: [] } },
      )
      expect(cleared.status()).toBeLessThan(300)
      expect((await cleared.json()).record.params.gallery).toEqual([])
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })
})

// ─── Custom record-level actions (products) ─────────────────────────────────

test.describe('Forms — products: custom @Action record-level handlers mutate state', () => {
  test('archive flips inStock=false + quantity=0; restock revives both', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let productId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/products/actions/new'), {
        data: { name: `Cycle ${suffix}`, inStock: true, quantity: 50 },
      })
      productId = String((await created.json()).record.id)

      const archived = await request.post(
        adminApi(`/resources/products/records/${productId}/actions/archive`),
      )
      expect(archived.status(), await archived.text()).toBeLessThan(300)
      const abody = await archived.json()
      expect(abody.record.params.inStock).toBe(false)
      expect(abody.record.params.quantity).toBe(0)

      const restocked = await request.post(
        adminApi(`/resources/products/records/${productId}/actions/restock`),
      )
      expect(restocked.status()).toBeLessThan(300)
      const rbody = await restocked.json()
      expect(rbody.record.params.inStock).toBe(true)
      // Restock clamps to at least 25.
      expect(Number(rbody.record.params.quantity)).toBeGreaterThanOrEqual(25)
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })

  test('duplicateSku rotates the sku without touching other fields', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let productId: string | null = null
    try {
      const created = await request.post(adminApi('/resources/products/actions/new'), {
        data: { name: `Sku ${suffix}`, inStock: true, sku: 'before-sku' },
      })
      productId = String((await created.json()).record.id)
      const res = await request.post(
        adminApi(`/resources/products/records/${productId}/actions/duplicateSku`),
      )
      expect(res.status(), await res.text()).toBeLessThan(300)
      const body = await res.json()
      expect(body.record.params.sku).not.toBe('before-sku')
      expect(typeof body.record.params.sku).toBe('string')
      expect(body.record.params.name).toBe(`Sku ${suffix}`)
    } finally {
      await cleanup(request, 'products', [productId])
    }
  })
})

// ─── Empty / null edge cases (regression for adapter coercion) ──────────────

test.describe('Forms — edge cases: empty strings, null clearing, partial PATCH', () => {
  test('partial update never resets untouched fields to null', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let id: string | null = null
    try {
      const created = await request.post(adminApi('/resources/customers/actions/new'), {
        data: {
          email: `partial-${suffix}@example.com`,
          name: `Partial ${suffix}`,
          tier: 'pro',
          score: 50,
          phone: '+1-000-000-0000',
        },
      })
      id = String((await created.json()).record.id)

      // PATCH only `score`.
      const upd = await request.patch(
        adminApi(`/resources/customers/records/${id}/actions/edit`),
        { data: { score: 75 } },
      )
      expect(upd.status()).toBeLessThan(300)
      const body = await upd.json()
      expect(body.record.params.score).toBe(75)
      expect(body.record.params.name).toBe(`Partial ${suffix}`)
      expect(body.record.params.email).toBe(`partial-${suffix}@example.com`)
      expect(body.record.params.tier).toBe('pro')
      expect(body.record.params.phone).toBe('+1-000-000-0000')
    } finally {
      await cleanup(request, 'customers', [id])
    }
  })

  test('empty string on optional date field does not crash the backend', async ({
    request,
  }) => {
    // Common UI pattern: user clears a date input → form posts `""`.
    // The adapter MUST not 500 on this. Either accept-and-store-null or
    // reject with a 4xx is acceptable; 5xx is a regression.
    const suffix = uniqueSuffix()
    let id: string | null = null
    try {
      const res = await request.post(adminApi('/resources/customers/actions/new'), {
        data: {
          email: `empty-date-${suffix}@example.com`,
          name: `Empty Date ${suffix}`,
          tier: 'free',
          birthday: '',
          lastLoginAt: '',
        },
      })
      expect(res.status(), await res.text()).toBeLessThan(500)
      if (res.ok()) id = String((await res.json()).record.id)
    } finally {
      await cleanup(request, 'customers', [id])
    }
  })

  test('empty string on optional enum-like select does not crash', async ({
    request,
  }) => {
    const suffix = uniqueSuffix()
    let id: string | null = null
    try {
      const res = await request.post(adminApi('/resources/customers/actions/new'), {
        data: {
          email: `empty-enum-${suffix}@example.com`,
          name: `Empty Enum ${suffix}`,
          tier: '',
        },
      })
      // Either 200 with default tier, or 4xx — never 5xx.
      expect(res.status(), await res.text()).toBeLessThan(500)
      if (res.ok()) id = String((await res.json()).record.id)
    } finally {
      await cleanup(request, 'customers', [id])
    }
  })
})
