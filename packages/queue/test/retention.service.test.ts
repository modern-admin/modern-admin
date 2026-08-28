import { describe, expect, it, mock } from 'bun:test'
import type { ActionLogRetention, HistoryRetention } from '@modern-admin/core'
import type { CronTaskDefinition } from '../src/cron/cron.types.js'
import type { CronService } from '../src/cron/cron.service.js'
import { DEFAULT_RETENTION_CRON, SYSTEM_RETENTION_TASK } from '../src/retention/retention.constants.js'
import { RetentionService } from '../src/retention/retention.service.js'

const fakeCron = () => {
  const definitions: CronTaskDefinition[] = []
  const cron = {
    register: (definition: CronTaskDefinition) => definitions.push(definition),
  } as unknown as CronService
  return { cron, definitions }
}

describe('RetentionService', () => {
  it('registers one locked BullMQ cron task for both stores', async () => {
    const historyPrune = mock((_retention: HistoryRetention) => Promise.resolve(4))
    const auditPrune = mock((_retention: ActionLogRetention) => Promise.resolve(7))
    const { cron, definitions } = fakeCron()
    const service = new RetentionService({
      history: { store: { prune: historyPrune }, keepDays: 30, keepLast: 10 },
      auditLog: { store: { prune: auditPrune }, keepDays: 365 },
    }, cron)

    service.onModuleInit()

    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({
      name: SYSTEM_RETENTION_TASK,
      cron: DEFAULT_RETENTION_CRON,
      skipIfRunning: true,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      },
    })
    expect(await definitions[0]!.handler({} as never)).toEqual({
      history: 4,
      auditLog: 7,
    })
    expect(historyPrune.mock.calls[0]?.[0]).toEqual({ keepLast: 10, keepDays: 30 })
    expect(auditPrune.mock.calls[0]?.[0]).toEqual({ keepDays: 365 })
  })

  it('does not schedule a job without retention bounds', () => {
    const { cron, definitions } = fakeCron()
    const service = new RetentionService({
      history: { store: { prune: mock(() => Promise.resolve(0)) } },
    }, cron)

    service.onModuleInit()

    expect(definitions).toHaveLength(0)
  })

  it('propagates store failures so BullMQ can retry the job', async () => {
    const { cron, definitions } = fakeCron()
    const service = new RetentionService({
      history: {
        store: { prune: mock(() => Promise.reject(new Error('database unavailable'))) },
        keepDays: 30,
      },
    }, cron)
    service.onModuleInit()

    await expect(definitions[0]!.handler({} as never)).rejects.toThrow('database unavailable')
  })

  it('prunes audit logs even when history pruning fails', async () => {
    const historyPrune = mock(() => Promise.reject(new Error('history unavailable')))
    const auditPrune = mock(() => Promise.resolve(3))
    const { cron, definitions } = fakeCron()
    const service = new RetentionService({
      history: { store: { prune: historyPrune }, keepDays: 30 },
      auditLog: { store: { prune: auditPrune }, keepDays: 365 },
    }, cron)
    service.onModuleInit()

    await expect(definitions[0]!.handler({} as never)).rejects.toThrow('history unavailable')
    expect(historyPrune.mock.calls).toHaveLength(1)
    expect(auditPrune.mock.calls).toHaveLength(1)
  })
})
