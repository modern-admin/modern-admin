import {
  rowToHistoryEntry as rowToEntry,
  uuidv7,
  type HistoryEntry,
  type HistoryOp,
  type HistoryRetention,
  type HistoryRow,
  type IHistoryStore,
} from '@modern-admin/core'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

const PRUNE_BATCH_SIZE = 1_000

export class DrizzleHistoryStore implements IHistoryStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly table: SystemTables['maHistory'],
  ) {}

  async append(input: {
    resourceId: string
    recordId: string
    op: HistoryOp
    userId?: string
    snapshot: Record<string, unknown>
    snapshotBefore?: Record<string, unknown>
  }): Promise<HistoryEntry> {
    const rows = (await this.db
      .insert(this.table)
      .values({
        id: uuidv7(),
        resourceId: input.resourceId,
        recordId: input.recordId,
        op: input.op,
        userId: input.userId ?? null,
        snapshot: input.snapshot,
        snapshotBefore: input.snapshotBefore ?? null,
      })
      .returning()) as HistoryRow[]
    return rowToEntry(rows[0]!)
  }

  async list(
    resourceId: string,
    recordId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<HistoryEntry[]> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0
    let q = this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.resourceId, resourceId), eq(this.table.recordId, recordId)))
      .orderBy(desc(this.table.createdAt))
      .limit(limit)
    if (offset > 0) q = q.offset(offset)
    const rows = (await q) as HistoryRow[]
    return rows.map(rowToEntry)
  }

  async get(
    resourceId: string,
    recordId: string,
    revisionId: string,
  ): Promise<HistoryEntry | null> {
    const rows = (await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.id, revisionId),
          eq(this.table.resourceId, resourceId),
          eq(this.table.recordId, recordId),
        ),
      )
      .limit(1)) as HistoryRow[]
    return rows[0] ? rowToEntry(rows[0]) : null
  }

  async latest(resourceId: string, recordId: string): Promise<HistoryEntry | null> {
    const rows = (await this.list(resourceId, recordId, { limit: 1 })) as HistoryEntry[]
    return rows[0] ?? null
  }

  async prune(retention: HistoryRetention): Promise<number> {
    let removed = 0

    if (retention.keepDays !== undefined) {
      const cutoff = new Date(Date.now() - retention.keepDays * 24 * 60 * 60 * 1000)
      const rows = (await this.db
        .delete(this.table)
        .where(lt(this.table.createdAt, cutoff))
        .returning({ id: this.table.id })) as Array<{ id: string }>
      removed += rows.length
    }

    if (retention.keepLast !== undefined) {
      const keep = Math.max(0, Math.trunc(retention.keepLast))
      const groups = (await this.db
        .select({
          resourceId: this.table.resourceId,
          recordId: this.table.recordId,
        })
        .from(this.table)
        .groupBy(this.table.resourceId, this.table.recordId)) as Array<{
        resourceId: string
        recordId: string
      }>

      for (const group of groups) {
        while (true) {
          let query = this.db
            .select({ id: this.table.id })
            .from(this.table)
            .where(
              and(
                eq(this.table.resourceId, group.resourceId),
                eq(this.table.recordId, group.recordId),
              ),
            )
            .orderBy(desc(this.table.createdAt), desc(this.table.id))
          if (keep > 0) query = query.offset(keep)
          const obsolete = (await query.limit(PRUNE_BATCH_SIZE)) as Array<{ id: string }>
          if (obsolete.length === 0) break

          const rows = (await this.db
            .delete(this.table)
            .where(
              inArray(
                this.table.id,
                obsolete.map((row) => row.id),
              ),
            )
            .returning({ id: this.table.id })) as Array<{ id: string }>
          removed += rows.length
        }
      }
    }

    return removed
  }
}
