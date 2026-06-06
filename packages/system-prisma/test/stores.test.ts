import { describe, expect, it } from 'bun:test'
import { setupPrismaSystem } from '../src/index.js'
import { fakePrisma } from './_fake-prisma.js'

// One file covers all six stores; each describe stands on its own and
// builds its own fake prisma so cross-test state can't leak.

describe('PrismaLogStore', () => {
  it('records and lists entries with filters', async () => {
    const prisma = fakePrisma()
    const { logStore } = setupPrismaSystem(prisma as never)
    const now = Date.now()
    await logStore.record({ resourceId: 'users', action: 'new', recordId: '1', at: now })
    await logStore.record({ resourceId: 'users', action: 'edit', recordId: '1', userId: 'u1', at: now + 1 })
    await logStore.record({ resourceId: 'posts', action: 'delete', recordId: '9', at: now + 2 })

    expect(await logStore.list()).toHaveLength(3)
    expect(await logStore.list({ resourceId: 'users' })).toHaveLength(2)
    expect(await logStore.list({ userId: 'u1' })).toHaveLength(1)
    expect(await logStore.list({ actions: ['new', 'edit'] })).toHaveLength(2)
    expect(await logStore.list({ from: new Date(now + 1) })).toHaveLength(2)
    expect(await logStore.list({ limit: 1 })).toHaveLength(1)
  })

  it('returns entries sorted newest-first', async () => {
    const prisma = fakePrisma()
    const { logStore } = setupPrismaSystem(prisma as never)
    await logStore.record({ resourceId: 'r', action: 'a', at: 100 })
    await logStore.record({ resourceId: 'r', action: 'b', at: 200 })
    const list = await logStore.list()
    expect(list[0]!.action).toBe('b')
    expect(list[1]!.action).toBe('a')
  })
})

describe('PrismaWebhookStore', () => {
  it('CRUDs webhooks and records deliveries', async () => {
    const prisma = fakePrisma()
    const { webhookStore } = setupPrismaSystem(prisma as never)

    const created = await webhookStore.create({
      name: 'audit',
      url: 'https://example.com/hook',
      events: ['users.created', 'users.deleted'],
    })
    expect(created.id).toBeTruthy()
    expect(created.enabled).toBe(true)

    const list = await webhookStore.list()
    expect(list).toHaveLength(1)
    expect(await webhookStore.get(created.id)).toMatchObject({ name: 'audit' })

    const updated = await webhookStore.update(created.id, { enabled: false })
    expect(updated.enabled).toBe(false)

    await webhookStore.recordDelivery({
      webhookId: created.id,
      event: 'users.created',
      payload: { id: '1' },
      status: 'success',
      responseStatus: 200,
      attempt: 1,
      deliveredAt: new Date().toISOString(),
    })
    const deliveries = await webhookStore.listDeliveries(created.id)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]!.status).toBe('success')

    await webhookStore.delete(created.id)
    expect(await webhookStore.list()).toHaveLength(0)
  })
})

describe('PrismaConfigStore', () => {
  it('upserts on set, returns value on get, lists by scope', async () => {
    const prisma = fakePrisma()
    const { configStore } = setupPrismaSystem(prisma as never)
    await configStore.set('global', null, 'theme', 'dark')
    await configStore.set('user', 'u1', 'lang', 'ru')
    await configStore.set('user', 'u1', 'tz', 'Europe/Moscow')

    expect(await configStore.get('global', null, 'theme')).toBe('dark')
    expect(await configStore.get('user', 'u1', 'lang')).toBe('ru')

    const userCfg = await configStore.list('user', 'u1')
    expect(userCfg).toHaveLength(2)

    await configStore.set('global', null, 'theme', 'light') // upsert path
    expect(await configStore.get('global', null, 'theme')).toBe('light')

    await configStore.delete('global', null, 'theme')
    expect(await configStore.get('global', null, 'theme')).toBeUndefined()
  })

  it('does not throw when deleting a missing key', async () => {
    const prisma = fakePrisma()
    const { configStore } = setupPrismaSystem(prisma as never)
    await expect(configStore.delete('global', null, 'missing')).resolves.toBeUndefined()
  })
})

describe('PrismaHistoryStore', () => {
  it('appends revisions and reads latest', async () => {
    const prisma = fakePrisma()
    const { historyStore } = setupPrismaSystem(prisma as never)
    await historyStore.append({
      resourceId: 'users', recordId: '1', op: 'create',
      snapshot: { name: 'A' },
    })
    await historyStore.append({
      resourceId: 'users', recordId: '1', op: 'update',
      userId: 'u1', snapshot: { name: 'B' }, snapshotBefore: { name: 'A' },
    })
    const list = await historyStore.list('users', '1')
    expect(list).toHaveLength(2)
    expect(list[0]!.op).toBe('update') // newest first
    const latest = await historyStore.latest('users', '1')
    expect(latest?.snapshot).toEqual({ name: 'B' })
  })

  it('returns null latest for unknown record', async () => {
    const prisma = fakePrisma()
    const { historyStore } = setupPrismaSystem(prisma as never)
    expect(await historyStore.latest('users', 'nope')).toBeNull()
  })
})

describe('PrismaAiTaskStore', () => {
  it('enqueues, transitions, and streams events', async () => {
    const prisma = fakePrisma()
    const { aiTaskStore } = setupPrismaSystem(prisma as never)

    const task = await aiTaskStore.enqueue({
      kind: 'summarise',
      input: { recordIds: ['1', '2'] },
    })
    expect(task.status).toBe('pending')

    const running = await aiTaskStore.updateStatus(task.id, { status: 'running', progress: 10 })
    expect(running.status).toBe('running')
    expect(running.startedAt).toBeTruthy()
    expect(running.progress).toBe(10)

    const e1 = await aiTaskStore.appendEvent(task.id, 'progress', { value: 50 })
    await aiTaskStore.appendEvent(task.id, 'partial', { text: 'half done' })

    expect(await aiTaskStore.events(task.id)).toHaveLength(2)
    expect(await aiTaskStore.events(task.id, e1.id)).toHaveLength(1)

    const finished = await aiTaskStore.updateStatus(task.id, {
      status: 'succeeded',
      progress: 100,
      output: { summary: 'done' },
    })
    expect(finished.status).toBe('succeeded')
    expect(finished.finishedAt).toBeTruthy()
    expect(finished.output).toEqual({ summary: 'done' })
  })

  it('filters list by status and kind', async () => {
    const prisma = fakePrisma()
    const { aiTaskStore } = setupPrismaSystem(prisma as never)
    const a = await aiTaskStore.enqueue({ kind: 'summarise', input: {} })
    await aiTaskStore.enqueue({ kind: 'classify', input: {} })
    await aiTaskStore.updateStatus(a.id, { status: 'running' })

    expect(await aiTaskStore.list({ kind: 'summarise' })).toHaveLength(1)
    expect(await aiTaskStore.list({ status: 'pending' })).toHaveLength(1)
    expect(await aiTaskStore.list({ status: ['pending', 'running'] })).toHaveLength(2)
  })
})

describe('PrismaCacheStore', () => {
  it('sets, gets, expires, prunes', async () => {
    const prisma = fakePrisma()
    const { cacheStore } = setupPrismaSystem(prisma as never)
    await cacheStore.set('a', { value: 1 }, { tags: ['users'] })
    await cacheStore.set('b', { value: 2 }, { ttlMs: -1 }) // already expired

    expect((await cacheStore.get('a'))?.value).toEqual({ value: 1 })
    expect(await cacheStore.get('b')).toBeNull() // expired on read
    // Prune cleans nothing further since the read already removed it.
    const removed = await cacheStore.prune()
    expect(removed).toBeGreaterThanOrEqual(0)
  })

  it('invalidates by tag', async () => {
    const prisma = fakePrisma()
    const { cacheStore } = setupPrismaSystem(prisma as never)
    await cacheStore.set('a', 1, { tags: ['users'] })
    await cacheStore.set('b', 2, { tags: ['users', 'lists'] })
    await cacheStore.set('c', 3, { tags: ['posts'] })
    const removed = await cacheStore.invalidateTags(['users'])
    expect(removed).toBe(2)
    expect(await cacheStore.get('c')).not.toBeNull()
  })
})

describe('setupPrismaSystem', () => {
  it('throws a descriptive error if a model is missing', () => {
    expect(() => setupPrismaSystem({} as never)).toThrow(/missing delegate "prisma\.maLog"/)
  })

  it('honours model name overrides', () => {
    const prisma = fakePrisma() as Record<string, unknown>
    prisma['customLog'] = prisma['maLog']
    delete prisma['maLog']
    const sys = setupPrismaSystem(prisma as never, { models: { log: 'customLog' } })
    expect(sys.logStore).toBeDefined()
  })
})
