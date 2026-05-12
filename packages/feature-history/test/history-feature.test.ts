import { describe, expect, it, mock } from 'bun:test'
import type { ActionRequest, ActionResponse, ResourceOptions } from '@modern-admin/core'
import { historyFeature } from '../src/history-feature.js'
import { historyPlugin } from '../src/history-plugin.js'
import { MemoryHistoryStore } from '../src/stores.js'

const emptyOptions: ResourceOptions = {}

type BeforeHook = (request: ActionRequest, context: unknown) => Promise<ActionRequest> | ActionRequest
type AfterHook = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => Promise<ActionResponse> | ActionResponse

function getBefore(actions: ResourceOptions['actions'], name: string): BeforeHook[] {
  return ((actions?.[name] as { before?: BeforeHook[] })?.before ?? []) as BeforeHook[]
}

function getAfter(actions: ResourceOptions['actions'], name: string): AfterHook[] {
  return ((actions?.[name] as { after?: AfterHook[] })?.after ?? []) as AfterHook[]
}

const fakeRequest = (overrides: Partial<ActionRequest> = {}): ActionRequest => ({
  method: 'post',
  params: { resourceId: 'users', action: 'new', ...overrides.params },
  ...(overrides.payload !== undefined ? { payload: overrides.payload } : {}),
})

const fakeContext = (
  record?: { id?: string; params?: Record<string, unknown> },
  userId?: string,
) => ({
  resource: { decorate: () => ({ id: 'users' }) },
  ...(record ? { record } : {}),
  ...(userId !== undefined ? { currentAdmin: { id: userId } } : {}),
})

describe('historyFeature', () => {
  it('attaches hooks to mutating actions', () => {
    const result = historyFeature({ store: new MemoryHistoryStore() })(emptyOptions)
    expect(getAfter(result.actions, 'new')).toHaveLength(1)
    expect(getAfter(result.actions, 'edit')).toHaveLength(1)
    expect(getBefore(result.actions, 'delete')).toHaveLength(1)
    expect(getAfter(result.actions, 'delete')).toHaveLength(1)
  })

  it('records create revisions', async () => {
    const store = new MemoryHistoryStore()
    const [hook] = getAfter(historyFeature({ store })(emptyOptions).actions, 'new')
    await hook!(
      { record: { id: '1', params: { name: 'Alice' } } },
      fakeRequest(),
      fakeContext(undefined, 'admin-1'),
    )
    expect(store.entries[0]).toMatchObject({
      resourceId: 'users',
      recordId: '1',
      op: 'create',
      userId: 'admin-1',
      snapshot: { name: 'Alice' },
    })
  })

  it('records update diffs against the previous record from context', async () => {
    const store = new MemoryHistoryStore()
    const [hook] = getAfter(historyFeature({ store })(emptyOptions).actions, 'edit')
    await hook!(
      { record: { id: '1', params: { name: 'Alicia', age: 30 } } },
      fakeRequest({ params: { resourceId: 'users', action: 'edit', recordId: '1' } }),
      fakeContext({ id: '1', params: { name: 'Alice' } }),
    )
    expect(store.entries[0]!.op).toBe('update')
    expect(store.entries[0]!.snapshotBefore).toEqual({ name: 'Alice' })
    expect(store.entries[0]!.snapshot).toEqual({ name: 'Alicia', age: 30 })
  })

  it('records delete snapshots from a before hook', async () => {
    const store = new MemoryHistoryStore()
    const options = historyFeature({ store })(emptyOptions)
    const ctx = fakeContext({ id: '1', params: { name: 'Alice' } })
    await getBefore(options.actions, 'delete')[0]!(
      fakeRequest({ params: { resourceId: 'users', action: 'delete', recordId: '1' } }),
      ctx,
    )
    await getAfter(options.actions, 'delete')[0]!(
      {},
      fakeRequest({ params: { resourceId: 'users', action: 'delete', recordId: '1' } }),
      ctx,
    )
    expect(store.entries[0]).toMatchObject({
      op: 'delete',
      recordId: '1',
      snapshot: { name: 'Alice' },
    })
  })

  it('honours excludeFields', async () => {
    const store = new MemoryHistoryStore()
    const [hook] = getAfter(
      historyFeature({ store, excludeFields: ['password'] })(emptyOptions).actions,
      'new',
    )
    await hook!(
      { record: { id: '1', params: { name: 'Alice', password: 'secret' } } },
      fakeRequest(),
      fakeContext(),
    )
    expect(store.entries[0]!.snapshot).toEqual({ name: 'Alice' })
  })

  it('swallows store failures', async () => {
    const failing = {
      append: mock(async () => { throw new Error('down') }),
      list: mock(),
      get: mock(),
      latest: mock(),
    }
    const [hook] = getAfter(historyFeature({ store: failing })(emptyOptions).actions, 'new')
    const response = { record: { id: '1', params: {} } }
    await expect(hook!(response, fakeRequest(), fakeContext())).resolves.toBe(response)
  })
})

describe('historyPlugin', () => {
  it('returns a GlobalPlugin shape and forwards filters', () => {
    const plugin = historyPlugin({
      store: new MemoryHistoryStore(),
      include: ['users'],
      exclude: ['logs'],
    })
    expect(plugin.name).toBe('history')
    expect(plugin.include).toEqual(['users'])
    expect(plugin.exclude).toEqual(['logs'])
    expect(typeof plugin.apply).toBe('function')
  })
})
