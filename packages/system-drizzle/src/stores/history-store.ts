import { uuidv7, type HistoryEntry, type HistoryOp, type IHistoryStore } from '@modern-admin/core'
import { and, desc, eq } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

interface HistoryRow {
  id: string
  resourceId: string
  recordId: string
  op: string
  userId: string | null
  snapshot: unknown
  snapshotBefore: unknown
  diff: unknown
  createdAt: Date
}

const rowToEntry = (row: HistoryRow): HistoryEntry => ({
  id: row.id,
  resourceId: row.resourceId,
  recordId: row.recordId,
  op: row.op as HistoryOp,
  ...(row.userId !== null ? { userId: row.userId } : {}),
  snapshot: (row.snapshot as Record<string, unknown>) ?? {},
  ...(row.snapshotBefore !== null && row.snapshotBefore !== undefined
    ? { snapshotBefore: row.snapshotBefore as Record<string, unknown> }
    : {}),
  createdAt: row.createdAt.toISOString(),
})

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
      .where(
        and(eq(this.table.resourceId, resourceId), eq(this.table.recordId, recordId)),
      )
      .orderBy(desc(this.table.createdAt))
      .limit(limit)
    if (offset > 0) q = q.offset(offset)
    const rows = (await q) as HistoryRow[]
    return rows.map(rowToEntry)
  }

  async get(resourceId: string, recordId: string, revisionId: string): Promise<HistoryEntry | null> {
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
}
