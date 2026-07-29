import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Custom actions over GraphQL.
 *
 * The schema-builder emits two fields per non built-in action
 * (`packages/graphql/src/schema-builder.ts`):
 *   • `Mutation.<resource><Action>` — runs it (`method: 'post'`)
 *   • `Query.<resource><Action>`    — primes it (`method: 'get'`)
 *
 * Both thunk through `ModernAdmin.invoke()`, so this spec doubles as a
 * cross-transport proof: the same handler that the REST routes drive is
 * reachable from GraphQL with the same semantics (method branch, payload,
 * record/records loading).
 *
 * Fixtures: `products.bulkRepriceUi` (resource), `posts.publish` (record),
 * `posts.scheduleManyUi` (bulk) — see `apps/_shared/src/admin/*`.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const GRAPHQL = `${API}/admin/graphql`
const REST = (path: string): string => `${API}/admin/api${path}`

interface GqlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

async function gql<T = Record<string, unknown>>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlResponse<T>> {
  const res = await request.post(GRAPHQL, {
    data: variables ? { query, variables } : { query },
    headers: { 'content-type': 'application/json' },
  })
  return (await res.json()) as GqlResponse<T>
}

async function latestPostIds(request: APIRequestContext, count: number): Promise<string[]> {
  const res = await request.get(
    REST(`/resources/posts/actions/list?perPage=${count}&sortBy=id&direction=desc`),
  )
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return (body.records as Array<{ id: string }>).map((r) => String(r.id))
}

test.describe('GraphQL custom actions', () => {
  test('the schema exposes each custom action as both a query and a mutation', async ({
    request,
  }) => {
    const res = await gql<{
      __schema: {
        queryType: { fields: Array<{ name: string }> }
        mutationType: { fields: Array<{ name: string }> }
      }
    }>(
      request,
      `{ __schema {
          queryType { fields { name } }
          mutationType { fields { name } }
        } }`,
    )
    expect(res.errors).toBeUndefined()
    const queries = res.data!.__schema.queryType.fields.map((f) => f.name)
    const mutations = res.data!.__schema.mutationType.fields.map((f) => f.name)

    for (const field of ['productsBulkRepriceUi', 'postsPublish', 'postsScheduleManyUi']) {
      expect(queries, `Query.${field} missing`).toContain(field)
      expect(mutations, `Mutation.${field} missing`).toContain(field)
    }
    // Built-ins keep their CRUD shape and gain no custom-action twin.
    expect(mutations).not.toContain('productsList')
    expect(mutations).toContain('createProducts')
  })

  test('resource action: query primes, mutation runs', async ({ request }) => {
    const before = await gql<{ productsBulkRepriceUi: { total: number; maxPrice: number } }>(
      request,
      '{ productsBulkRepriceUi }',
    )
    expect(before.errors).toBeUndefined()
    const { total, maxPrice } = before.data!.productsBulkRepriceUi
    expect(total).toBeGreaterThan(0)

    const run = await gql<{ productsBulkRepriceUi: { updated: number } }>(
      request,
      'mutation Reprice($p: JSON) { productsBulkRepriceUi(payload: $p) }',
      { p: { percent: 10 } },
    )
    expect(run.errors).toBeUndefined()
    expect(run.data!.productsBulkRepriceUi.updated).toBe(total)

    const after = await gql<{ productsBulkRepriceUi: { maxPrice: number } }>(
      request,
      '{ productsBulkRepriceUi }',
    )
    expect(after.data!.productsBulkRepriceUi.maxPrice).toBeCloseTo(
      Math.round(maxPrice * 1.1 * 100) / 100,
      2,
    )

    // Restore so reruns start from the same catalogue.
    const restore = await gql(
      request,
      'mutation Reprice($p: JSON) { productsBulkRepriceUi(payload: $p) }',
      { p: { percent: -(10 / 1.1) } },
    )
    expect(restore.errors).toBeUndefined()
  })

  test('record action receives its id', async ({ request }) => {
    const [id] = await latestPostIds(request, 1)
    const res = await gql<{ postsPublish: { record: { id: string } } }>(
      request,
      'mutation Publish($id: ID!) { postsPublish(id: $id) }',
      { id },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data!.postsPublish.record.id).toBe(id)
  })

  test('bulk action receives its selection on both the prime and the run', async ({
    request,
  }) => {
    const ids = await latestPostIds(request, 2)
    expect(ids).toHaveLength(2)

    const primed = await gql<{ postsScheduleManyUi: { records: Array<{ id: string }> } }>(
      request,
      'query Prime($ids: [ID!]!) { postsScheduleManyUi(ids: $ids) }',
      { ids },
    )
    expect(primed.errors).toBeUndefined()
    expect(primed.data!.postsScheduleManyUi.records.map((r) => r.id).sort()).toEqual(
      [...ids].sort(),
    )

    const run = await gql<{
      postsScheduleManyUi: { notice: { type: string }; records: Array<{ id: string }> }
    }>(
      request,
      'mutation Run($ids: [ID!]!, $p: JSON) { postsScheduleManyUi(ids: $ids, payload: $p) }',
      { ids, p: { publishedAt: '2030-02-11T07:45' } },
    )
    expect(run.errors).toBeUndefined()
    expect(run.data!.postsScheduleManyUi.notice.type).toBe('success')

    for (const id of ids) {
      const res = await request.get(REST(`/resources/posts/records/${id}/actions/show`))
      expect(res.ok()).toBeTruthy()
      const params = (await res.json()).record.params as { publishedAt?: string }
      expect(String(params.publishedAt)).toContain('2030-02-11')
    }
  })

  test('a handler-reported error surfaces as data, not a GraphQL error', async ({
    request,
  }) => {
    // `bulkRepriceUi` rejects a zero percentage with a `notice`, not a throw —
    // the transport must pass that through rather than turning it into an
    // `errors` entry.
    const res = await gql<{ productsBulkRepriceUi: { notice: { type: string } } }>(
      request,
      'mutation Reprice($p: JSON) { productsBulkRepriceUi(payload: $p) }',
      { p: { percent: 0 } },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data!.productsBulkRepriceUi.notice.type).toBe('error')
  })
})
