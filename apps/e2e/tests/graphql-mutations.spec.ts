import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * GraphQL mutation surface for the `customers` resource.
 *
 * The schema-builder emits `create<Id>`, `update<Id>` and `delete<Id>` per
 * resource (see `packages/graphql/src/schema-builder.ts`). All three thunk
 * through `ModernAdmin.invoke()` and therefore share the same access /
 * validation / hook stack as the REST controller — so a passing mutation
 * round-trip here proves the cross-transport contract end-to-end.
 *
 * Also doubles as a smoke for the DataLoader-backed ref resolver: a single
 * GraphQL query fetching multiple posts with `author { id name }` must
 * round-trip without N+1 errors against the Prisma adapter.
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

test.describe('GraphQL mutations — customers', () => {
  test('createCustomers → updateCustomers → deleteCustomers round-trip', async ({
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const email = `gql-${suffix}@example.com`
    const name = `GQL Test ${suffix}`

    // create
    const created = await gql<{ createCustomers: { id: string; email: string; name: string } }>(
      request,
      `mutation Create($input: CustomersCreateInput!) {
        createCustomers(input: $input) { id email name tier }
      }`,
      { input: { email, name, tier: 'pro' } },
    )
    expect(created.errors, JSON.stringify(created.errors)).toBeUndefined()
    const createdId = created.data!.createCustomers.id
    expect(createdId).toBeTruthy()
    expect(created.data!.createCustomers.email).toBe(email)

    try {
      // update
      const renamed = `${name} renamed`
      const updated = await gql<{ updateCustomers: { id: string; name: string } }>(
        request,
        `mutation Update($id: ID!, $input: CustomersUpdateInput!) {
          updateCustomers(id: $id, input: $input) { id name }
        }`,
        { id: createdId, input: { name: renamed } },
      )
      expect(updated.errors, JSON.stringify(updated.errors)).toBeUndefined()
      expect(updated.data!.updateCustomers.name).toBe(renamed)

      // REST cross-check: edit landed in the store
      const showRes = await request.get(
        REST(`/resources/customers/records/${createdId}/actions/show`),
      )
      expect(showRes.ok()).toBeTruthy()
      const showBody = await showRes.json()
      expect(showBody.record.params.name).toBe(renamed)

      // delete
      const deleted = await gql<{ deleteCustomers: boolean }>(
        request,
        `mutation Delete($id: ID!) { deleteCustomers(id: $id) }`,
        { id: createdId },
      )
      expect(deleted.errors, JSON.stringify(deleted.errors)).toBeUndefined()
      expect(deleted.data!.deleteCustomers).toBe(true)

      // confirm gone
      const afterRes = await request.get(
        REST(`/resources/customers/records/${createdId}/actions/show`),
      )
      expect(afterRes.status()).toBe(404)
    } finally {
      // safety cleanup
      await request.delete(REST(`/resources/customers/records/${createdId}/actions/delete`))
    }
  })

  test('createCustomers rejects missing required fields with a GraphQL error', async ({
    request,
  }) => {
    // Email + name are required. Omitting them must surface a validation
    // error in the GraphQL `errors` array — NOT a 500 from the controller.
    const body = await gql(
      request,
      `mutation { createCustomers(input: { tier: "free" }) { id } }`,
    )
    expect(body.errors, 'expected validation error').toBeDefined()
    expect(body.data).toBeFalsy()
  })

  test('postsList with authorIdRef resolves via DataLoader (no N+1 errors)', async ({
    request,
  }) => {
    // Each reference property is exposed as a sibling `<path>Ref` field
    // (see `attachReferenceResolvers` in schema-builder.ts). The reference
    // resolver runs through a per-request DataLoader so resolving N posts
    // costs a single batched fetch against the referenced resource.
    const body = await gql<{ postsList: Array<{ id: string; title: string; authorIdRef: { id: string; email: string } | null }> }>(
      request,
      `{ postsList(limit: 10) { id title authorIdRef { id email } } }`,
    )
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined()
    const posts = body.data!.postsList
    expect(posts.length).toBeGreaterThan(0)
    for (const p of posts) {
      expect(p.authorIdRef).not.toBeNull()
      expect(p.authorIdRef!.id).toBeTruthy()
      expect(p.authorIdRef!.email).toMatch(/@example\.com$/)
    }
  })
})
