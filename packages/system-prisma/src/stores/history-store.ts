import {
  rowToHistoryEntry as rowToEntry,
  uuidv7,
  type HistoryEntry,
  type HistoryOp,
  type HistoryRow,
  type IHistoryStore,
} from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

export class PrismaHistoryStore implements IHistoryStore {
  constructor(private readonly delegate: PrismaDelegate<HistoryRow>) {}

  async append(input: {
    resourceId: string
    recordId: string
    op: HistoryOp
    userId?: string
    snapshot: Record<string, unknown>
    snapshotBefore?: Record<string, unknown>
  }): Promise<HistoryEntry> {
    const row = await this.delegate.create({
      data: {
        id: uuidv7(),
        resourceId: input.resourceId,
        recordId: input.recordId,
        op: input.op,
        userId: input.userId ?? null,
        snapshot: input.snapshot,
        snapshotBefore: input.snapshotBefore ?? null,
      },
    })
    return rowToEntry(row)
  }

  async list(
    resourceId: string,
    recordId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<HistoryEntry[]> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0
    const rows = await this.delegate.findMany({
      where: { resourceId, recordId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(offset > 0 ? { skip: offset } : {}),
    })
    return rows.map(rowToEntry)
  }

  async get(resourceId: string, recordId: string, revisionId: string): Promise<HistoryEntry | null> {
    const row = await this.delegate.findFirst({
      where: { id: revisionId, resourceId, recordId },
    })
    return row ? rowToEntry(row) : null
  }

  async latest(resourceId: string, recordId: string): Promise<HistoryEntry | null> {
    const row = await this.delegate.findFirst({
      where: { resourceId, recordId },
      orderBy: { createdAt: 'desc' },
    })
    return row ? rowToEntry(row) : null
  }
}
