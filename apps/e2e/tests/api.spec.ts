import { test, expect } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'

const adminApi = (path: string): string => `${API}/admin/api${path}`

/**
 * Backend smoke covering the canonical CRUD lifecycle through REST against
 * the seeded in-memory adapter (`users` resource). Routes follow the
 * AdminJS-style `/actions/<name>` shape exposed by ResourceController.
 */
test.describe('REST CRUD — users', () => {
  test('config endpoint exposes seeded resources', async ({ request }) => {
    const res = await request.get(adminApi('/config'))
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const ids = (body.resources as Array<{ id: string }>).map((r) => r.id)
    expect(ids).toContain('users')
    expect(ids).toContain('posts')
  })

  test('list returns the seeded users', async ({ request }) => {
    const res = await request.get(adminApi('/resources/users/actions/list'))
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body.records)).toBe(true)
    expect(body.records.length).toBeGreaterThanOrEqual(3)
  })

  test('full create → read → update → delete cycle', async ({ request }) => {
    const created = await request.post(adminApi('/resources/users/actions/new'), {
      data: {
        email: 'e2e@example.com',
        name: 'E2E User',
        role: 'editor',
        createdAt: new Date().toISOString(),
      },
    })
    expect(created.ok()).toBeTruthy()
    const createdBody = await created.json()
    const id = createdBody.record.id as string
    expect(id).toBeTruthy()
    expect(createdBody.record.params.email).toBe('e2e@example.com')

    const fetched = await request.get(
      adminApi(`/resources/users/records/${id}/actions/show`),
    )
    expect(fetched.ok()).toBeTruthy()
    const fetchedBody = await fetched.json()
    expect(fetchedBody.record.params.email).toBe('e2e@example.com')

    const updated = await request.patch(
      adminApi(`/resources/users/records/${id}/actions/edit`),
      { data: { name: 'E2E Renamed' } },
    )
    expect(updated.ok()).toBeTruthy()
    const updatedBody = await updated.json()
    expect(updatedBody.record.params.name).toBe('E2E Renamed')

    const deleted = await request.delete(
      adminApi(`/resources/users/records/${id}/actions/delete`),
    )
    expect(deleted.ok()).toBeTruthy()

    const after = await request.get(
      adminApi(`/resources/users/records/${id}/actions/show`),
    )
    expect(after.status()).toBe(404)
  })

  test('list supports pagination params', async ({ request }) => {
    const res = await request.get(
      adminApi('/resources/users/actions/list?perPage=2&page=1'),
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.records.length).toBeLessThanOrEqual(2)
    expect(typeof body.meta.total).toBe('number')
  })

  test('reference fields are exposed on the posts resource', async ({ request }) => {
    const res = await request.get(adminApi('/resources/posts/actions/list'))
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const post = body.records[0]
    expect(post.params.authorId).toBeDefined()
  })
})
