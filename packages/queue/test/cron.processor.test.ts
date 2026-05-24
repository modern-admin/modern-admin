import { describe, test, expect, mock, beforeEach } from 'bun:test'
import type { Job, Queue } from 'bullmq'
import { CronProcessor } from '../src/cron/cron.processor.js'
import type { CronService } from '../src/cron/cron.service.js'
import { CRON_LOCK_PREFIX, DEFAULT_CRON_LOCK_TTL } from '../src/cron/cron.constants.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const makeJob = (name: string, data: unknown = {}, id = 'test-job-id'): Job =>
  ({ name, data, id } as unknown as Job)

type MockRedis = {
  runCommand: ReturnType<typeof mock>
  del: ReturnType<typeof mock>
}

const buildProcessor = (overrides?: {
  getHandler?: (name: string) => unknown
  shouldSkipIfRunning?: (name: string) => boolean
  redis?: Partial<MockRedis>
}) => {
  const redis: MockRedis = {
    runCommand: overrides?.redis?.runCommand ?? mock(() => Promise.resolve('OK')),
    del: overrides?.redis?.del ?? mock(() => Promise.resolve(1)),
  }

  const cronService = {
    getHandler: overrides?.getHandler ?? mock(() => undefined),
    shouldSkipIfRunning: overrides?.shouldSkipIfRunning ?? mock(() => false),
  } as unknown as CronService

  const cronQueue = {
    client: Promise.resolve(redis),
  } as unknown as Queue

  const processor = new CronProcessor(cronService, cronQueue)
  return { processor, redis, cronService }
}

// ── basic dispatch ────────────────────────────────────────────────────────────

describe('CronProcessor › process', () => {
  test('calls registered handler and returns its result', async () => {
    const handler = mock(() => Promise.resolve('result'))
    const { processor } = buildProcessor({ getHandler: () => handler })
    const result = await processor.process(makeJob('my-task'))
    expect(result).toBe('result')
    expect(handler.mock.calls).toHaveLength(1)
  })

  test('throws when no handler is registered', async () => {
    const { processor } = buildProcessor({ getHandler: () => undefined })
    await expect(processor.process(makeJob('unknown'))).rejects.toThrow(
      'No cron handler registered for "unknown"',
    )
  })

  test('propagates handler errors', async () => {
    const handler = mock(() => Promise.reject(new Error('boom')))
    const { processor } = buildProcessor({ getHandler: () => handler })
    await expect(processor.process(makeJob('failing'))).rejects.toThrow('boom')
  })

  test('supports synchronous handler return values', async () => {
    const handler = mock(() => 42)
    const { processor } = buildProcessor({ getHandler: () => handler })
    expect(await processor.process(makeJob('sync-task'))).toBe(42)
  })
})

// ── skipIfRunning (distributed lock) ─────────────────────────────────────────

describe('CronProcessor › skipIfRunning lock', () => {
  let redis: MockRedis
  let processor: CronProcessor
  let handler: ReturnType<typeof mock>

  beforeEach(() => {
    handler = mock(() => Promise.resolve('locked-result'))
    ;({ processor, redis } = buildProcessor({
      getHandler: () => handler,
      shouldSkipIfRunning: () => true,
    }))
  })

  test('acquires lock and executes handler when no lock exists', async () => {
    const result = await processor.process(makeJob('locked-task'))
    expect(redis.runCommand.mock.calls[0]).toEqual([
      'set',
      [
        `${CRON_LOCK_PREFIX}locked-task`,
        'test-job-id',
        'EX',
        DEFAULT_CRON_LOCK_TTL,
        'NX',
      ],
    ])
    expect(result).toBe('locked-result')
  })

  test('releases lock after handler completes', async () => {
    await processor.process(makeJob('locked-task'))
    expect(redis.del.mock.calls[0]?.[0]).toBe(`${CRON_LOCK_PREFIX}locked-task`)
  })

  test('releases lock even when handler throws', async () => {
    handler.mockImplementation(() => Promise.reject(new Error('crash')))
    await expect(processor.process(makeJob('locked-task'))).rejects.toThrow('crash')
    expect(redis.del.mock.calls).toHaveLength(1)
  })

  test('skips execution when lock is already held', async () => {
    redis.runCommand.mockImplementation(() => Promise.resolve(null))
    const result = await processor.process(makeJob('locked-task'))
    expect(result).toBeUndefined()
    expect(handler.mock.calls).toHaveLength(0)
    expect(redis.del.mock.calls).toHaveLength(0)
  })

  test('does not acquire lock for tasks without skipIfRunning', async () => {
    const { processor: p, redis: r, cronService } = buildProcessor({
      getHandler: () => mock(() => Promise.resolve('no-lock')),
      shouldSkipIfRunning: () => false,
    })
    ;(cronService as unknown as { shouldSkipIfRunning: () => boolean }).shouldSkipIfRunning =
      () => false
    const result = await p.process(makeJob('normal-task'))
    expect(r.runCommand.mock.calls).toHaveLength(0)
    expect(result).toBe('no-lock')
  })
})
