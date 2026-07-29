// Resource-scoped custom actions (`actionType: 'resource'`).
//
// These are the actions that operate on the collection rather than on a
// row — "send a push to every user", "recount everything". The contract
// `invoke()` owes them:
//
//   * no record/records loading, even when the request carries ids
//   * the HTTP method reaches the handler verbatim, so a component can
//     prime its form with a `get` and mutate with a `post`
//   * before/after hooks and the `component`/`custom` descriptor metadata
//     behave the same as for record actions
//
// The cache-invalidation half of the contract lives in cache-tags.test.ts.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import type { ActionContext, ActionRequest, ActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

interface BuildOptions {
  handler?: (request: ActionRequest, context: ActionContext) => Promise<ActionResponse>
  component?: string | null
  custom?: Record<string, unknown>
  before?: (request: ActionRequest) => ActionRequest
  after?: (response: ActionResponse) => ActionResponse
}

const buildAdmin = (opts: BuildOptions = {}): ModernAdmin =>
  new ModernAdmin({
    adapters: [adapter],
    resources: [
      {
        resource: { name: 'users', rows: [{ id: '1', name: 'Ann' }, { id: '2', name: 'Bob' }] },
        options: {
          actions: {
            sendMassPush: {
              name: 'sendMassPush',
              actionType: 'resource' as const,
              ...(opts.component !== undefined ? { component: opts.component } : {}),
              ...(opts.custom !== undefined ? { custom: opts.custom } : {}),
              ...(opts.before ? { before: opts.before } : {}),
              ...(opts.after ? { after: opts.after } : {}),
              handler:
                opts.handler ??
                (async () => ({ notice: { message: 'sent', type: 'success' as const } })),
            },
          },
        },
      },
    ],
  })

describe('resource-scoped custom actions', () => {
  test('handler runs with no record and no records in context', async () => {
    let seen: ActionContext | undefined
    const admin = buildAdmin({
      handler: async (_req, ctx) => {
        seen = ctx
        return { ok: true }
      },
    })

    const res = await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'post',
    })

    expect(res.ok).toBe(true)
    expect(seen?.record).toBeUndefined()
    expect(seen?.records).toBeUndefined()
    expect(seen?.resource.decorate().id).toBe('users')
  })

  test('a stray recordId does not load a record for a resource action', async () => {
    let seen: ActionContext | undefined
    const admin = buildAdmin({
      handler: async (_req, ctx) => {
        seen = ctx
        return {}
      },
    })

    await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush', recordId: '1' },
      method: 'post',
    })

    expect(seen?.record).toBeUndefined()
  })

  test('payload reaches the handler untouched', async () => {
    let payload: Record<string, unknown> | undefined
    const admin = buildAdmin({
      handler: async (req) => {
        payload = req.payload
        return {}
      },
    })

    await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'post',
      payload: { title: 'Hi', body: 'There', onlyPaying: true },
    })

    expect(payload).toEqual({ title: 'Hi', body: 'There', onlyPaying: true })
  })

  test('method is forwarded so handlers can branch get vs post', async () => {
    // The AdminJS-style pattern: `if (request.method !== 'post') return {}`
    // renders the form, a post actually sends.
    const admin = buildAdmin({
      handler: async (req) =>
        req.method === 'post' ? { sent: true } : { templates: ['welcome'] },
    })

    const primed = await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'get',
    })
    expect(primed.templates).toEqual(['welcome'])
    expect(primed.sent).toBeUndefined()

    const sent = await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'post',
    })
    expect(sent.sent).toBe(true)
  })

  test('before and after hooks wrap the handler', async () => {
    const admin = buildAdmin({
      before: (req) => ({ ...req, payload: { ...req.payload, injected: true } }),
      after: (res) => ({ ...res, decorated: true }),
      handler: async (req) => ({ echoed: req.payload }),
    })

    const res = await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'post',
      payload: { title: 'Hi' },
    })

    expect(res.echoed).toEqual({ title: 'Hi', injected: true })
    expect(res.decorated).toBe(true)
  })

  test('component and custom metadata reach the serialized resource', async () => {
    const admin = buildAdmin({
      component: 'SendMassPush',
      custom: { showAs: 'dialog', label: 'Mass push' },
    })

    const json = admin.findResource('users').decorate().toJSON()
    const action = json.actions.find((a) => a.name === 'sendMassPush')

    expect(action?.actionType).toBe('resource')
    expect(action?.component).toBe('SendMassPush')
    expect(action?.custom).toEqual({ showAs: 'dialog', label: 'Mass push' })
  })

  test('the same descriptor is handed to the handler through context', async () => {
    let seen: ActionContext | undefined
    const admin = buildAdmin({
      component: 'SendMassPush',
      handler: async (_req, ctx) => {
        seen = ctx
        return {}
      },
    })

    await admin.invoke({
      params: { resourceId: 'users', action: 'sendMassPush' },
      method: 'post',
    })

    expect(seen?.action.component).toBe('SendMassPush')
    expect(seen?.action.actionType).toBe('resource')
    expect(seen?.action.resourceId).toBe('users')
  })

  test('an unknown action name is rejected rather than silently ignored', async () => {
    const admin = buildAdmin()
    await expect(
      admin.invoke({ params: { resourceId: 'users', action: 'nope' }, method: 'post' }),
    ).rejects.toThrow()
  })
})
