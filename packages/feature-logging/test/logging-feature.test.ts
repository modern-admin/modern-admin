import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { ActionRequest, ActionResponse, ResourceOptions } from '@modern-admin/core'
import { actionLoggingFeature } from '../src/logging-feature.js'
import { actionLoggingPlugin } from '../src/logging-plugin.js'
import { MemoryLogStore } from '../src/stores.js'
import type { ActionLogEntry } from '../src/types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyOptions: ResourceOptions = {}

type AfterHook = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => Promise<ActionResponse>

function getAfter(actions: ResourceOptions['actions'], name: string): AfterHook[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((actions?.[name] as any)?.after ?? []) as AfterHook[]
}

const fakeContext = (resourceId = 'users', userId?: string) => ({
  resource: { decorate: () => ({ id: resourceId }) },
  ...(userId !== undefined ? { currentAdmin: { id: userId } } : {}),
})

const fakeRequest = (overrides: Partial<ActionRequest> = {}): ActionRequest => ({
  method: 'post',
  params: { resourceId: 'users', action: 'new', ...overrides.params },
  ...(overrides.payload !== undefined ? { payload: overrides.payload } : {}),
})

// ─── actionLoggingFeature() ───────────────────────────────────────────────────

describe('actionLoggingFeature() — defaults', () => {
  it('returns a FeatureFn', () => {
    expect(typeof actionLoggingFeature()).toBe('function')
  })

  it('attaches after hooks to default mutating actions', () => {
    const result = actionLoggingFeature({ store: new MemoryLogStore() })(emptyOptions)
    for (const name of ['new', 'edit', 'delete', 'bulkDelete']) {
      expect(getAfter(result.actions, name).length).toBe(1)
    }
  })

  it('does not touch read-only actions by default', () => {
    const result = actionLoggingFeature({ store: new MemoryLogStore() })(emptyOptions)
    expect(result.actions?.list).toBeUndefined()
    expect(result.actions?.show).toBeUndefined()
  })
})

describe('actionLoggingFeature() — recording', () => {
  it('records the resource id, action name, and timestamp', async () => {
    const store = new MemoryLogStore()
    const result = actionLoggingFeature({ store })(emptyOptions)
    const [hook] = getAfter(result.actions, 'new')

    const before = Date.now()
    await hook!(
      { record: { id: '42', params: { name: 'Alice' } } },
      fakeRequest(),
      fakeContext('users'),
    )
    const after = Date.now()

    expect(store.entries).toHaveLength(1)
    const entry = store.entries[0]!
    expect(entry.resourceId).toBe('users')
    expect(entry.action).toBe('new')
    expect(entry.recordId).toBe('42')
    expect(entry.at).toBeGreaterThanOrEqual(before)
    expect(entry.at).toBeLessThanOrEqual(after)
  })

  it('captures userId from currentAdmin', async () => {
    const store = new MemoryLogStore()
    const [hook] = getAfter(actionLoggingFeature({ store })(emptyOptions).actions, 'edit')
    await hook!(
      { record: { id: '1', params: {} } },
      fakeRequest({ params: { resourceId: 'users', action: 'edit', recordId: '1' } }),
      fakeContext('users', 'admin-7'),
    )
    expect(store.entries[0]!.userId).toBe('admin-7')
  })

  it('captures recordIds for bulk actions', async () => {
    const store = new MemoryLogStore()
    const [hook] = getAfter(actionLoggingFeature({ store })(emptyOptions).actions, 'bulkDelete')
    await hook!(
      {},
      fakeRequest({ params: { resourceId: 'users', action: 'bulkDelete', recordIds: '1,2,3' } }),
      fakeContext('users'),
    )
    expect(store.entries[0]!.recordIds).toEqual(['1', '2', '3'])
  })

  it('omits payload and result by default', async () => {
    const store = new MemoryLogStore()
    const [hook] = getAfter(actionLoggingFeature({ store })(emptyOptions).actions, 'new')
    await hook!(
      { record: { id: '1', params: { name: 'A' } } },
      fakeRequest({ payload: { name: 'A' } }),
      fakeContext(),
    )
    expect(store.entries[0]!.payload).toBeUndefined()
    expect(store.entries[0]!.result).toBeUndefined()
  })

  it('includes payload and result when configured', async () => {
    const store = new MemoryLogStore()
    const [hook] = getAfter(
      actionLoggingFeature({ store, includePayload: true, includeResult: true })(emptyOptions).actions,
      'edit',
    )
    await hook!(
      { record: { id: '1', params: { name: 'New' } } },
      fakeRequest({ params: { resourceId: 'users', action: 'edit', recordId: '1' }, payload: { name: 'New' } }),
      fakeContext(),
    )
    const entry = store.entries[0]!
    expect(entry.payload).toEqual({ name: 'New' })
    expect(entry.result).toEqual({ name: 'New' })
  })

  it('accepts a callback in place of an ILogStore', async () => {
    const calls: ActionLogEntry[] = []
    const [hook] = getAfter(
      actionLoggingFeature({ store: (entry) => { calls.push(entry) } })(emptyOptions).actions,
      'delete',
    )
    await hook!(
      {},
      fakeRequest({ params: { resourceId: 'users', action: 'delete', recordId: '9' } }),
      fakeContext(),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.action).toBe('delete')
    expect(calls[0]!.recordId).toBe('9')
  })

  it('swallows store errors so the action result is preserved', async () => {
    const failing = { record: mock(async () => { throw new Error('sink down') }) }
    const [hook] = getAfter(actionLoggingFeature({ store: failing })(emptyOptions).actions, 'new')
    const response = { record: { id: '1', params: {} } }
    await expect(hook!(response, fakeRequest(), fakeContext())).resolves.toBe(response)
  })
})

describe('actionLoggingFeature() — hook chaining', () => {
  it('preserves an existing after-hook and runs it first', async () => {
    const order: string[] = []
    const existing = mock(async (res: unknown) => { order.push('existing'); return res })
    const store: { record: (e: ActionLogEntry) => void } = { record: () => { order.push('logged') } }

    const incoming: ResourceOptions = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: { new: { after: existing } as any },
    }
    const result = actionLoggingFeature({ store })(incoming)
    const hooks = getAfter(result.actions, 'new')
    expect(hooks.length).toBe(2)

    for (const h of hooks) await h({ record: { id: '1', params: {} } }, fakeRequest(), fakeContext())
    expect(order).toEqual(['existing', 'logged'])
  })

  it('chains onto an existing array of after-hooks', () => {
    const h1: AfterHook = mock(async (res: ActionResponse) => res)
    const h2: AfterHook = mock(async (res: ActionResponse) => res)
    const incoming: ResourceOptions = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: { delete: { after: [h1, h2] } as any },
    }
    const result = actionLoggingFeature({ store: new MemoryLogStore() })(incoming)
    const hooks = getAfter(result.actions, 'delete')
    expect(hooks.length).toBe(3)
    expect(hooks[0]).toBe(h1)
    expect(hooks[1]).toBe(h2)
  })
})

describe('actionLoggingFeature() — actions option', () => {
  it('honours an explicit list', () => {
    const result = actionLoggingFeature({
      store: new MemoryLogStore(),
      actions: ['new'],
    })(emptyOptions)
    expect(getAfter(result.actions, 'new').length).toBe(1)
    expect(result.actions?.edit).toBeUndefined()
    expect(result.actions?.delete).toBeUndefined()
  })

  it("expands '*' to defaults plus already-overridden actions", () => {
    const incoming: ResourceOptions = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: { customAction: { isAccessible: true } as any },
    }
    const result = actionLoggingFeature({ store: new MemoryLogStore(), actions: '*' })(incoming)
    expect(getAfter(result.actions, 'new').length).toBe(1)
    expect(getAfter(result.actions, 'customAction').length).toBe(1)
  })
})

// ─── actionLoggingPlugin() ────────────────────────────────────────────────────

describe('actionLoggingPlugin()', () => {
  afterEach(() => {})

  it('returns a GlobalPlugin shape', () => {
    const p = actionLoggingPlugin({ store: new MemoryLogStore() })
    expect(p.name).toBe('action-logging')
    expect(typeof p.apply).toBe('function')
  })

  it('forwards include/exclude filters', () => {
    const p = actionLoggingPlugin({
      store: new MemoryLogStore(),
      include: ['users'],
      exclude: ['health'],
    })
    expect(p.include).toEqual(['users'])
    expect(p.exclude).toEqual(['health'])
  })

  it('applies the same hook semantics as the local feature', async () => {
    const store = new MemoryLogStore()
    const plugin = actionLoggingPlugin({ store })
    // GlobalPlugin.apply gets (options, resource); we don't need a real
    // resource here because the feature ignores it.
    const opts = plugin.apply({}, {} as never)
    const hook = getAfter(opts.actions, 'new')[0]!
    await hook(
      { record: { id: '5', params: {} } },
      fakeRequest(),
      fakeContext('posts', 'u1'),
    )
    expect(store.entries[0]).toMatchObject({
      resourceId: 'posts',
      action: 'new',
      recordId: '5',
      userId: 'u1',
    })
  })
})
