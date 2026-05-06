import { test, expect } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const GRAPHQL = `${API}/admin/graphql`

interface GqlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

const graphql = async (
  request: import('@playwright/test').APIRequestContext,
  query: string,
): Promise<GqlResponse<Record<string, unknown>>> => {
  const res = await request.post(GRAPHQL, {
    data: { query },
    headers: { 'content-type': 'application/json' },
  })
  return (await res.json()) as GqlResponse<Record<string, unknown>>
}

test.describe('GraphQL', () => {
  test('schema exposes per-resource list/one/count queries', async ({ request }) => {
    const body = await graphql(
      request,
      '{ __type(name: "Query") { fields { name } } }',
    )
    expect(body.errors).toBeUndefined()
    const fields = (body.data?.__type as { fields: Array<{ name: string }> }).fields.map(
      (f) => f.name,
    )
    expect(fields).toEqual(
      expect.arrayContaining([
        'usersList',
        'usersOne',
        'usersCount',
        'postsList',
        'postsOne',
        'postsCount',
      ]),
    )
  })

  test('usersList returns seeded rows', async ({ request }) => {
    const body = await graphql(
      request,
      '{ usersList { id email name role } usersCount }',
    )
    expect(body.errors).toBeUndefined()
    const users = body.data?.usersList as Array<{ email: string }>
    expect(users.length).toBeGreaterThanOrEqual(3)
    expect(users.some((u) => u.email === 'ada@example.com')).toBe(true)
    expect(typeof body.data?.usersCount).toBe('number')
  })

  test('usersOne resolves a record by id', async ({ request }) => {
    const body = await graphql(request, '{ usersOne(id: "1") { id email } }')
    expect(body.errors).toBeUndefined()
    const user = body.data?.usersOne as { id: string; email: string } | null
    expect(user?.id).toBe('1')
    expect(user?.email).toBe('ada@example.com')
  })
})
