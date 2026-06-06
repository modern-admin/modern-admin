import { describe, it, expect, mock } from 'bun:test'
import { passwordsFeature } from '../src/passwords-feature.js'
import type { ActionOptions, ActionRequest, ResourceOptions } from '@modern-admin/core'

const baseRequest = (
  payload: Record<string, unknown>,
  action: 'new' | 'edit' = 'edit',
): ActionRequest => ({
  params: { resourceId: 'users', action },
  payload,
  method: 'post',
})

const opts = (): ResourceOptions => ({})

// ─── property configuration ─────────────────────────────────────────────

describe('passwordsFeature() — property configuration', () => {
  it('returns a FeatureFn', () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    expect(typeof feature).toBe('function')
  })

  it('hides the encrypted column from every view', () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    expect(result.properties?.password?.isVisible).toEqual({
      list: false,
      show: false,
      edit: false,
      filter: false,
    })
  })

  it('exposes the virtual field as a password input visible only in edit', () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    expect(result.properties?.newPassword?.type).toBe('password')
    expect(result.properties?.newPassword?.isVisible).toEqual({
      list: false,
      show: false,
      edit: true,
      filter: false,
    })
  })

  it('preserves existing property overrides on other fields', () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature({ properties: { name: { label: 'Full Name' } } })
    expect(result.properties?.name?.label).toBe('Full Name')
    expect(result.properties?.password?.isVisible).toBeDefined()
  })

  it('merges with existing override on the encrypted column', () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature({
      properties: { password: { description: 'stored hashed' } },
    })
    expect(result.properties?.password?.description).toBe('stored hashed')
    expect(result.properties?.password?.isVisible).toEqual({
      list: false,
      show: false,
      edit: false,
      filter: false,
    })
  })
})

// ─── before hook — new ───────────────────────────────────────────────────

describe('passwordsFeature() — new before hook', () => {
  it('hashes the virtual value into the encrypted column', async () => {
    const hash = mock(async (p: string) => `hashed:${p}`)
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash,
    })
    const result = feature(opts())
    const before = (result.actions?.new as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    const out = await before[0]!(
      baseRequest({ name: 'Ada', newPassword: 'secret' }, 'new'),
      {},
    )
    expect(out.payload).toEqual({ name: 'Ada', password: 'hashed:secret' })
    expect(hash).toHaveBeenCalledWith('secret')
  })

  it('strips the virtual field even when empty', async () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    const before = (result.actions?.new as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    const out = await before[0]!(
      baseRequest({ name: 'Ada', newPassword: '' }, 'new'),
      {},
    )
    expect(out.payload).toEqual({ name: 'Ada' })
  })
})

// ─── before hook — edit ──────────────────────────────────────────────────

describe('passwordsFeature() — edit before hook', () => {
  it('hashes a non-empty virtual value', async () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    const before = (result.actions?.edit as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    const out = await before[0]!(
      baseRequest({ name: 'Ada', newPassword: 'fresh' }, 'edit'),
      {},
    )
    expect(out.payload).toEqual({ name: 'Ada', password: 'h:fresh' })
  })

  it('leaves the encrypted column untouched when the virtual is empty', async () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    const before = (result.actions?.edit as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    const out = await before[0]!(
      baseRequest({ name: 'Ada', newPassword: '' }, 'edit'),
      {},
    )
    expect(out.payload).toEqual({ name: 'Ada' })
    expect((out.payload as Record<string, unknown>).password).toBeUndefined()
  })

  it('preserves other payload fields verbatim', async () => {
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(opts())
    const before = (result.actions?.edit as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    const out = await before[0]!(
      baseRequest(
        { name: 'Ada', email: 'ada@example.com', role: 'admin', newPassword: 'x' },
        'edit',
      ),
      {},
    )
    expect(out.payload).toMatchObject({
      name: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      password: 'h:x',
    })
  })
})

// ─── hook chaining ───────────────────────────────────────────────────────

describe('passwordsFeature() — hook chaining', () => {
  it('chains onto an existing edit.before hook', async () => {
    const order: string[] = []
    const existing = mock(async (req: ActionRequest) => {
      order.push('existing')
      return req
    })
    const incoming: ResourceOptions = {
      actions: { edit: { before: existing } as ActionOptions },
    }
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => {
        order.push('hash')
        return `h:${p}`
      },
    })
    const result = feature(incoming)
    const before = (result.actions?.edit as { before: unknown }).before as Array<
      (req: ActionRequest, ctx: unknown) => Promise<ActionRequest>
    >
    expect(before.length).toBe(2)
    let req = baseRequest({ newPassword: 'a' }, 'edit')
    for (const fn of before) req = await fn(req, {})
    expect(order).toEqual(['existing', 'hash'])
  })

  it('chains onto an existing new.before array', async () => {
    const h1 = mock(async (req: ActionRequest) => req)
    const h2 = mock(async (req: ActionRequest) => req)
    const incoming: ResourceOptions = {
      actions: { new: { before: [h1, h2] } as ActionOptions },
    }
    const feature = passwordsFeature({
      properties: { encryptedPassword: 'password', password: 'newPassword' },
      hash: async (p) => `h:${p}`,
    })
    const result = feature(incoming)
    const before = (result.actions?.new as { before: unknown }).before as unknown[]
    expect(before.length).toBe(3)
    expect(before[0]).toBe(h1)
    expect(before[1]).toBe(h2)
  })
})
