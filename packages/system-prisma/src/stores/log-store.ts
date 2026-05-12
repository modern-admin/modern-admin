import { uuidv7, type ActionLogEntry, type ILogStore, type IQueryableLogStore } from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

interface LogRow {
  id: string
  resourceId: string
  action: string
  recordId: string | null
  recordIds: unknown
  userId: string | null
  payload: unknown
  result: unknown
  at: bigint
  createdAt: Date
}

const rowToEntry = (row: LogRow): ActionLogEntry => ({
  id: row.id,
  resourceId: row.resourceId,
  action: row.action,
  ...(row.recordId !== null ? { recordId: row.recordId } : {}),
  ...(Array.isArray(row.recordIds) ? { recordIds: row.recordIds as string[] } : {}),
  ...(row.userId !== null ? { userId: row.userId } : {}),
  ...(row.payload !== null && row.payload !== undefined
    ? { payload: row.payload as Record<string, unknown> }
    : {}),
  ...(row.result !== null && row.result !== undefined
    ? { result: row.result as Record<string, unknown> }
    : {}),
  at: Number(row.at),
})

export class PrismaLogStore implements IQueryableLogStore {
  constructor(private readonly delegate: PrismaDelegate<LogRow>) {}

  async record(entry: ActionLogEntry): Promise<void> {
    await this.delegate.create({
      data: {
        // Prefer the writer-supplied id (UUID v7 from `actionLoggingPlugin`)
        // so React lists keyed on `entry.id` line up with the persisted row.
        id: entry.id ?? uuidv7(),
        resourceId: entry.resourceId,
        action: entry.action,
        recordId: entry.recordId ?? null,
        recordIds: entry.recordIds ?? null,
        userId: entry.userId ?? null,
        payload: entry.payload ?? null,
        result: entry.result ?? null,
        at: BigInt(entry.at),
      },
    })
  }

  async list(filter: Parameters<IQueryableLogStore['list']>[0] = {}): Promise<ActionLogEntry[]> {
    const where: Record<string, unknown> = {}
    if (filter.resourceId) where['resourceId'] = filter.resourceId
    if (filter.recordId) where['recordId'] = filter.recordId
    if (filter.userId) where['userId'] = filter.userId
    if (filter.actions?.length) where['action'] = { in: filter.actions }
    if (filter.from || filter.to) {
      const range: Record<string, bigint> = {}
      if (filter.from) range['gte'] = BigInt(filter.from.getTime())
      if (filter.to) range['lte'] = BigInt(filter.to.getTime())
      where['at'] = range
    }
    const rows = await this.delegate.findMany({
      where,
      orderBy: { at: 'desc' },
      ...(filter.limit !== undefined ? { take: filter.limit } : {}),
      ...(filter.offset !== undefined ? { skip: filter.offset } : {}),
    })
    return rows.map(rowToEntry)
  }
}

/** Narrow type-test: a pure `ILogStore` is enough where readback isn't needed. */
export type { ILogStore }
