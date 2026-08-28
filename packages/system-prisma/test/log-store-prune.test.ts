import { describe, expect, it } from 'bun:test'
import { uuidv7 } from '@modern-admin/core'
import { setupPrismaSystem } from '../src/index.js'
import { fakePrisma } from './_fake-prisma.js'

describe('PrismaLogStore pruning', () => {
  it('keeps the newest entries globally', async () => {
    const prisma = fakePrisma()
    const { logStore } = setupPrismaSystem(prisma as never)
    for (let index = 0; index < 5; index++) {
      await logStore.record({ resourceId: 'users', action: 'edit', at: index })
    }
    prisma.maLog.rows.forEach((row, index) => {
      row.createdAt = new Date(1_000 + index)
    })

    expect(await logStore.prune({ keepLast: 2 })).toBe(3)
    expect(await logStore.list()).toHaveLength(2)
  })

  it('drops entries older than keepDays', async () => {
    const prisma = fakePrisma()
    const { logStore } = setupPrismaSystem(prisma as never)
    await logStore.record({ resourceId: 'users', action: 'edit', at: 1 })
    await logStore.record({ resourceId: 'users', action: 'edit', at: 2 })
    prisma.maLog.rows[0]!.createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)

    expect(await logStore.prune({ keepDays: 7 })).toBe(1)
    expect(await logStore.list()).toHaveLength(1)
  })

  it('never deletes an entry appended between selection and deletion', async () => {
    const prisma = fakePrisma()
    const { logStore } = setupPrismaSystem(prisma as never)
    for (let index = 0; index < 3; index++) {
      await logStore.record({ resourceId: 'users', action: 'edit', at: index })
    }
    prisma.maLog.rows.forEach((row, index) => {
      row.createdAt = new Date(1_000 + index)
    })

    const originalDeleteMany = prisma.maLog.deleteMany.bind(prisma.maLog)
    let concurrentId: string | undefined
    prisma.maLog.deleteMany = async (args = {}) => {
      if (!concurrentId && args.where?.id?.in) {
        concurrentId = uuidv7()
        await prisma.maLog.create({
          data: {
            id: concurrentId,
            resourceId: 'users',
            action: 'edit',
            recordId: null,
            recordIds: null,
            userId: null,
            payload: null,
            result: null,
            at: 10_000n,
            createdAt: new Date(10_000),
          },
        })
      }
      return originalDeleteMany(args)
    }

    await logStore.prune({ keepLast: 1 })

    const remaining = await logStore.list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(concurrentId)
  })
})
