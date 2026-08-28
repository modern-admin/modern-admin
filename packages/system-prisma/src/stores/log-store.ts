import {
  rowToLogEntry,
  uuidv7,
  type ActionLogRetention,
  type ActionLogEntry,
  type ILogStore,
  type IQueryableLogStore,
  type LogRow,
} from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

/** Applied when the caller passes no `limit`. Matches `MemoryLogStore`. */
const DEFAULT_LIST_LIMIT = 50
const PRUNE_BATCH_SIZE = 1_000

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
    // `from`/`to` bound the window; `before` is the keyset cursor the audit
    // log's "load more" pages on. All three narrow the same column, so they
    // merge into one range clause — dropping `before` (as this store used to)
    // made every extra page return the first page again, forever.
    const range: Record<string, bigint> = {}
    if (filter.from) range['gte'] = BigInt(filter.from.getTime())
    if (filter.to) range['lte'] = BigInt(filter.to.getTime())
    if (filter.before !== undefined) {
      const cursorAt = BigInt(filter.before)
      if (filter.beforeId !== undefined) {
        // Lexicographic continuation of the `(at, id) DESC` order. Keeping
        // the id in the cursor is essential because `at` has ms precision and
        // many audit entries can legitimately share it.
        where['OR'] = [
          { at: { lt: cursorAt } },
          { at: cursorAt, id: { lt: filter.beforeId } },
        ]
      } else {
        // Backwards-compatible timestamp-only cursor for existing callers.
        range['lt'] = cursorAt
      }
    }
    if (Object.keys(range).length > 0) where['at'] = range
    const rows = await this.delegate.findMany({
      where,
      // `at` is milliseconds and not unique, so it alone is not a total
      // order — two entries in the same millisecond could swap between
      // pages. Ids are UUIDv7, i.e. already time-ordered, so they are the
      // natural tiebreaker.
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      // The audit log is append-only and unbounded; an unbounded SELECT over
      // it is a memory hazard. Compare `PrismaHistoryStore.list`, which has
      // always defaulted to 50.
      take: filter.limit ?? DEFAULT_LIST_LIMIT,
      ...(filter.offset !== undefined ? { skip: filter.offset } : {}),
    })
    return rows.map(rowToLogEntry)
  }

  /**
   * Delete action-log entries outside the configured retention bounds.
   * `keepLast` is global and deletions use an explicit id snapshot so a
   * concurrent write can never be caught by a broad predicate.
   */
  async prune(retention: ActionLogRetention): Promise<number> {
    let removed = 0

    if (retention.keepDays !== undefined) {
      const cutoff = new Date(Date.now() - retention.keepDays * 24 * 60 * 60 * 1000)
      const result = await this.delegate.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })
      removed += result.count
    }

    if (retention.keepLast !== undefined) {
      const keep = Math.max(0, Math.trunc(retention.keepLast))
      while (true) {
        const obsolete = (await this.delegate.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
          ...(keep > 0 ? { skip: keep } : {}),
          take: PRUNE_BATCH_SIZE,
        })) as unknown as Array<{ id: string }>
        if (obsolete.length === 0) break

        const result = await this.delegate.deleteMany({
          where: { id: { in: obsolete.map((row) => row.id) } },
        })
        removed += result.count
      }
    }

    return removed
  }
}

/** Narrow type-test: a pure `ILogStore` is enough where readback isn't needed. */
export type { ILogStore }
