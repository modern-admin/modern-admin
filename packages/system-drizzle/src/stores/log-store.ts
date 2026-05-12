import { uuidv7, type ActionLogEntry, type IQueryableLogStore } from '@modern-admin/core'
import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

interface LogRow {
  id: string
  resourceId: string
  action: string
  recordId: string | null
  recordIds: unknown
  userId: string | null
  payload: unknown
  result: unknown
  at: number
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
    return rows.map(rowToEntry)
  }
}
