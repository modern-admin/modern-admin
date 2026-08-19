import {
  rowToHistoryEntry as rowToEntry,
  uuidv7,
  type HistoryEntry,
  type HistoryOp,
  type HistoryRetention,
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

  /**
   * Enforce a retention policy. Every revision of every record is kept
   * forever without one — the table grows with each edit and nothing in the
   * framework ever trims it.
   *
   * Bounds combine: a revision survives only if it satisfies all of them, so
   * they are applied in sequence. `keepDays` is one `deleteMany`; `keepLast`
   * is per-record, which no single `deleteMany` can express, so it costs two
   * queries per record that has revisions. This is a maintenance job (cron,
   * startup), never a request-path operation.
   */
  async prune(retention: HistoryRetention): Promise<number> {
    let removed = 0

    if (retention.keepDays !== undefined) {
      const cutoff = new Date(Date.now() - retention.keepDays * 24 * 60 * 60 * 1000)
      const { count } = await this.delegate.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })
      removed += count
    }

    if (retention.keepLast !== undefined) {
      const keep = Math.max(0, Math.trunc(retention.keepLast))
      const groups = await this.recordGroups()
      for (const group of groups) {
        const scope = { resourceId: group.resourceId, recordId: group.recordId }
        const survivors = (await this.delegate.findMany({
          where: scope,
          orderBy: { createdAt: 'desc' },
          select: { id: true },
          take: keep,
        })) as unknown as Array<{ id: string }>
        const { count } = await this.delegate.deleteMany({
          where: { ...scope, id: { notIn: survivors.map((r) => r.id) } },
        })
        removed += count
      }
    }

    return removed
  }

  /**
   * The distinct `(resourceId, recordId)` pairs that have revisions.
   *
   * `groupBy` because it becomes a real SQL `GROUP BY` on every connector,
   * whereas Prisma's `distinct` is applied in the query engine — outside
   * Postgres that means fetching every revision row first, which is exactly
   * what pruning a large table must not do. `distinct` remains as a fallback
   * for delegates that do not expose `groupBy` (hand-written test doubles).
   */
  private async recordGroups(): Promise<Array<{ resourceId: string; recordId: string }>> {
    if (typeof this.delegate.groupBy === 'function') {
      return (await this.delegate.groupBy({
        by: ['resourceId', 'recordId'],
      })) as Array<{ resourceId: string; recordId: string }>
    }
    return (await this.delegate.findMany({
      distinct: ['resourceId', 'recordId'],
      select: { resourceId: true, recordId: true },
    })) as unknown as Array<{ resourceId: string; recordId: string }>
  }
}
