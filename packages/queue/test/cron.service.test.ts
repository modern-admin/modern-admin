import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { Test } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { CronService } from '../src/cron/cron.service.js'
import { CRON_QUEUE } from '../src/cron/cron.constants.js'

// ── helpers ──────────────────────────────────────────────────────────────────

type MockQueue = {
  upsertJobScheduler: ReturnType<typeof mock>
  getJobSchedulers: ReturnType<typeof mock>
  removeJobScheduler: ReturnType<typeof mock>
  getJobs: ReturnType<typeof mock>
  close: ReturnType<typeof mock>
}

const buildModule = async (queue: MockQueue) => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CronService,
      { provide: getQueueToken(CRON_QUEUE), useValue: queue },
      { provide: DiscoveryService, useValue: { getProviders: () => [] } },
      { provide: Reflector, useValue: new Reflector() },
    ],
  }).compile()
  return moduleRef.get(CronService)
}

const makeQueue = (): MockQueue => ({
  upsertJobScheduler: mock(() => Promise.resolve()),
  getJobSchedulers: mock(() => Promise.resolve([])),
  removeJobScheduler: mock(() => Promise.resolve()),
  getJobs: mock(() => Promise.resolve([])),
  close: mock(() => Promise.resolve()),
})

// ── register ─────────────────────────────────────────────────────────────────

describe('CronService › register', () => {
  let queue: MockQueue
  let service: CronService

  beforeEach(async () => {
    queue = makeQueue()
    service = await buildModule(queue)
  })

  test('stores handler and makes it retrievable', () => {
    const handler = mock(() => Promise.resolve())
    service.register({ name: 'task-a', cron: '* * * * *', handler })
    expect(service.getHandler('task-a')).toBe(handler)
  })

  test('throws on duplicate name', () => {
    const handler = mock(() => Promise.resolve())
    service.register({ name: 'dup', cron: '* * * * *', handler })
    expect(() => service.register({ name: 'dup', cron: '* * * * *', handler })).toThrow(
      'Cron task "dup" is already registered',
    )
  })

  test('does NOT upsert scheduler before onModuleInit', () => {
    service.register({ name: 'early', cron: '0 0 * * *', handler: mock(() => undefined) })
    expect(queue.upsertJobScheduler.mock.calls).toHaveLength(0)
  })

  test('upserts scheduler immediately when called after onModuleInit', async () => {
    await service.onModuleInit()
    service.register({ name: 'late', cron: '0 0 * * *', handler: mock(() => undefined) })
    expect(queue.upsertJobScheduler.mock.calls).toSatisfy(
      (calls: unknown[][]) => calls.some((c) => c[0] === 'late'),
    )
  })
})

// ── getHandler / shouldSkipIfRunning ─────────────────────────────────────────

describe('CronService › getHandler / shouldSkipIfRunning', () => {
  let service: CronService

  beforeEach(async () => { service = await buildModule(makeQueue()) })

  test('getHandler returns undefined for unknown task', () => {
    expect(service.getHandler('nope')).toBeUndefined()
  })

  test('shouldSkipIfRunning is true when flag is set', () => {
    service.register({ name: 'skip-task', cron: '* * * * *', handler: mock(() => undefined), skipIfRunning: true })
    expect(service.shouldSkipIfRunning('skip-task')).toBe(true)
  })

  test('shouldSkipIfRunning is false when flag is not set', () => {
    service.register({ name: 'normal', cron: '* * * * *', handler: mock(() => undefined) })
    expect(service.shouldSkipIfRunning('normal')).toBe(false)
  })

  test('shouldSkipIfRunning is false for unknown task', () => {
    expect(service.shouldSkipIfRunning('unknown')).toBe(false)
  })
})

// ── onModuleInit / syncSchedulers ─────────────────────────────────────────────

describe('CronService › onModuleInit / syncSchedulers', () => {
  let queue: MockQueue
  let service: CronService

  beforeEach(async () => {
    queue = makeQueue()
    service = await buildModule(queue)
  })

  test('upserts all registered tasks on init', async () => {
    service.register({ name: 'task-a', cron: '*/5 * * * *', handler: mock(() => undefined) })
    service.register({ name: 'task-b', cron: '0 0 * * *', handler: mock(() => undefined) })
    await service.onModuleInit()
    expect(queue.upsertJobScheduler.mock.calls).toHaveLength(2)
    const names = queue.upsertJobScheduler.mock.calls.map((c: unknown[]) => c[0])
    expect(names).toContain('task-a')
    expect(names).toContain('task-b')
  })

  test('removes stale schedulers not present in code', async () => {
    queue.getJobSchedulers.mockImplementation(() =>
      Promise.resolve([
        { name: 'active', key: 'active-key' },
        { name: 'stale', key: 'stale-key' },
      ]),
    )
    service.register({ name: 'active', cron: '* * * * *', handler: mock(() => undefined) })
    await service.onModuleInit()
    expect(queue.removeJobScheduler.mock.calls).toHaveLength(1)
    expect(queue.removeJobScheduler.mock.calls[0]?.[0]).toBe('stale-key')
  })

  test('does not remove schedulers that match registered tasks', async () => {
    queue.getJobSchedulers.mockImplementation(() =>
      Promise.resolve([{ name: 'task-a', key: 'key-a' }]),
    )
    service.register({ name: 'task-a', cron: '* * * * *', handler: mock(() => undefined) })
    await service.onModuleInit()
    expect(queue.removeJobScheduler.mock.calls).toHaveLength(0)
  })

  test('passes custom opts to upsertJobScheduler', async () => {
    await service.onModuleInit()
    service.register({
      name: 'with-opts',
      cron: '0 * * * *',
      handler: mock(() => undefined),
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    })
    const call = queue.upsertJobScheduler.mock.calls.find(
      (c: unknown[]) => c[0] === 'with-opts',
    )
    expect(call?.[2]).toMatchObject({
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    })
  })
})

// ── onModuleDestroy ───────────────────────────────────────────────────────────

describe('CronService › onModuleDestroy', () => {
  test('closes the queue', async () => {
    const queue = makeQueue()
    const service = await buildModule(queue)
    await service.onModuleDestroy()
    expect(queue.close.mock.calls).toHaveLength(1)
  })
})

// ── purgeTasks ────────────────────────────────────────────────────────────────

describe('CronService › purgeTasks', () => {
  let queue: MockQueue
  let service: CronService

  beforeEach(async () => {
    queue = makeQueue()
    service = await buildModule(queue)
  })

  test('removes matching schedulers and jobs', async () => {
    queue.getJobSchedulers.mockImplementation(() =>
      Promise.resolve([
        { name: 'keep', key: 'keep-key' },
        { name: 'remove-me', key: 'rm-key' },
      ]),
    )
    const removeFn = mock(() => Promise.resolve())
    queue.getJobs.mockImplementation(() =>
      Promise.resolve([
        { name: 'remove-me', id: '1', remove: removeFn },
        { name: 'keep', id: '2', remove: mock(() => Promise.resolve()) },
      ]),
    )
    await service.purgeTasks(['remove-me'])
    expect(queue.removeJobScheduler.mock.calls[0]?.[0]).toBe('rm-key')
    expect(removeFn.mock.calls).toHaveLength(1)
  })

  test('handles null/undefined jobs gracefully', async () => {
    queue.getJobSchedulers.mockImplementation(() => Promise.resolve([]))
    queue.getJobs.mockImplementation(() => Promise.resolve([null, undefined]))
    await service.purgeTasks(['any']) // should not throw
  })
})
