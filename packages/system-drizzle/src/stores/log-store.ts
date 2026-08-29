import {
  rowToLogEntry,
  uuidv7,
  type ActionLogRetention,
  type ActionLogEntry,
  type IQueryableLogStore,
  type LogRow,
} from '@modern-admin/core'
import { and, desc, eq, gte, inArray, lt, lte, type SQL } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

const PRUNE_BATCH_SIZE = 1_000

export class DrizzleLogStore implements IQueryableLogStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly table: SystemTables['maLog'],
  ) {}

  async record(entry: ActionLogEntry): Promise<void> {
    await this.db.insert(this.table).values({
      id: entry.id ?? uuidv7(),
      resourceId: entry.resourceId,
      action: entry.action,
      recordId: entry.recordId ?? null,
      recordIds: entry.recordIds ?? null,
      userId: entry.userId ?? null,
      payload: entry.payload ?? null,
      result: entry.result ?? null,
      at: entry.at,
    })
  }

  async list(filter: Parameters<IQueryableLogStore['list']>[0] = {}): Promise<ActionLogEntry[]> {
    const conds: SQL[] = []
    if (filter.resourceId) conds.push(eq(this.table.resourceId, filter.resourceId))
    if (filter.recordId) conds.push(eq(this.table.recordId, filter.recordId))
    if (filter.userId) conds.push(eq(this.table.userId, filter.userId))
    if (filter.actions?.length) conds.push(inArray(this.table.action, filter.actions))
    if (filter.from) conds.push(gte(this.table.at, filter.from.getTime()))
    if (filter.to) conds.push(lte(this.table.at, filter.to.getTime()))

    let q = this.db.select().from(this.table)
    if (conds.length) q = q.where(conds.length === 1 ? conds[0] : and(...conds))
    q = q.orderBy(desc(this.table.at))
    if (filter.limit !== undefined) q = q.limit(filter.limit)
    if (filter.offset !== undefined) q = q.offset(filter.offset)

    const rows = (await q) as LogRow[]
    return rows.map(rowToLogEntry)
  }

  async prune(retention: ActionLogRetention): Promise<number> {
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
      while (true) {
        let query = this.db
          .select({ id: this.table.id })
          .from(this.table)
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

    return removed
  }
}
