import { describe, expect, it } from 'bun:test'
import { uuidv7 } from '@modern-admin/core'
import { setupPrismaSystem } from '../src/index.js'
import { fakePrisma } from './_fake-prisma.js'

describe('PrismaHistoryStore pruning', () => {
  it('keeps the newest revision for each record', async () => {
    const prisma = fakePrisma()
    const { historyStore } = setupPrismaSystem(prisma as never)
    for (const recordId of ['one', 'two']) {
      for (let revision = 0; revision < 3; revision++) {
        await historyStore.append({
          resourceId: 'users',
          recordId,
          op: revision === 0 ? 'create' : 'update',
          snapshot: { revision },
        })
      }
    }
    prisma.maHistory.rows.forEach((row, index) => {
      row.createdAt = new Date(1_000 + index)
    })

    expect(await historyStore.prune({ keepLast: 1 })).toBe(4)
    expect(await historyStore.list('users', 'one')).toHaveLength(1)
    expect(await historyStore.list('users', 'two')).toHaveLength(1)
  })

  it('never deletes a revision appended between selection and deletion', async () => {
    const prisma = fakePrisma()
    const { historyStore } = setupPrismaSystem(prisma as never)
    for (let revision = 0; revision < 3; revision++) {
      await historyStore.append({
        resourceId: 'users',
        recordId: 'one',
        op: revision === 0 ? 'create' : 'update',
        snapshot: { revision },
      })
    }
    prisma.maHistory.rows.forEach((row, index) => {
      row.createdAt = new Date(1_000 + index)
    })

    const originalDeleteMany = prisma.maHistory.deleteMany.bind(prisma.maHistory)
    let concurrentId: string | undefined
    prisma.maHistory.deleteMany = async (args = {}) => {
      if (!concurrentId && args.where?.id?.in) {
        concurrentId = uuidv7()
        await prisma.maHistory.create({
          data: {
            id: concurrentId,
            resourceId: 'users',
            recordId: 'one',
            op: 'update',
            userId: null,
            snapshot: { revision: 'concurrent' },
            snapshotBefore: null,
            createdAt: new Date(10_000),
          },
        })
      }
      return originalDeleteMany(args)
    }

    await historyStore.prune({ keepLast: 1 })

    const remaining = await historyStore.list('users', 'one')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(concurrentId)
    expect(remaining[0]?.snapshot).toEqual({ revision: 'concurrent' })
  })
})
