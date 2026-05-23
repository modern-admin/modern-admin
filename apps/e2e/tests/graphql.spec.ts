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
  variables?: Record<string, unknown>,
): Promise<GqlResponse<Record<string, unknown>>> => {
  const res = await request.post(GRAPHQL, {
    data: variables ? { query, variables } : { query },
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
        'customersList',
        'customersOne',
        'customersCount',
        'postsList',
        'postsOne',
        'postsCount',
      ]),
    )
  })

  test('customersList returns seeded rows', async ({ request }) => {
    const body = await graphql(
      request,
      '{ customersList { id email name } customersCount }',
    )
    expect(body.errors).toBeUndefined()
    const customers = body.data?.customersList as Array<{ email: string }>
    expect(customers.length).toBeGreaterThanOrEqual(3)
    // The seed builds emails as `${first}.${last}${i+1}@example.com`. Customer
    // #1 starts with "Ada", so the e-mail begins with "ada.".
    expect(customers.some((u) => /^ada\./i.test(u.email))).toBe(true)
    expect(typeof body.data?.customersCount).toBe('number')
  })

  test('customersOne resolves a record by id', async ({ request }) => {
    const body = await graphql(request, '{ customersOne(id: "1") { id email name } }')
    expect(body.errors).toBeUndefined()
    const customer = body.data?.customersOne as { id: string; email: string } | null
    expect(customer?.id).toBe('1')
    expect(customer?.email).toMatch(/@example\.com$/)
  })
})
