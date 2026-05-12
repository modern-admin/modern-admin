import type { CacheEntry, ICacheStore } from '@modern-admin/core'
import { eq, inArray, lt } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

interface CacheRow {
  key: string
  value: unknown
  tags: unknown
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const rowToEntry = (row: CacheRow): CacheEntry => ({
  key: row.key,
  value: row.value,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export class DrizzleCacheStore implements ICacheStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly table: SystemTables['maCache'],
  ) {}

  async get(key: string): Promise<CacheEntry | null> {
    const rows = (await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.key, key))
      .limit(1)) as CacheRow[]
    const row = rows[0]
    if (!row) return null
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.db.delete(this.table).where(eq(this.table.key, key))
      return null
    }
    return rowToEntry(row)
  }

  async set(
    key: string,
    value: unknown,
    options: { ttlMs?: number; tags?: string[] } = {},
  ): Promise<void> {
    const expiresAt = options.ttlMs ? new Date(Date.now() + options.ttlMs) : null
    const tags = options.tags ?? []
    await this.db
      .insert(this.table)
      .values({ key, value: value ?? null, tags, expiresAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: this.table.key,
        set: { value: value ?? null, tags, expiresAt, updatedAt: new Date() },
      })
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.key, key))
  }

  /**
   * Tag invalidation walks the table because Drizzle's portable `jsonb`
   * column type doesn't support array-contains via this generic adapter.
   * For high-volume caches use a Postgres-specific implementation
   * (`tags text[]` with `ANY(tags)`) or Redis. Correctness > throughput
   * here by design.
   */
  async invalidateTags(tags: string[]): Promise<number> {
    if (!tags.length) return 0
    const set = new Set(tags)
    const all = (await this.db.select().from(this.table)) as CacheRow[]
    const targetKeys = all
      .filter((r) => Array.isArray(r.tags) && (r.tags as string[]).some((t) => set.has(t)))
      .map((r) => r.key)
    if (!targetKeys.length) return 0
    await this.db.delete(this.table).where(inArray(this.table.key, targetKeys))
    return targetKeys.length
  }

  async prune(): Promise<number> {
    const expired = (await this.db
      .delete(this.table)
      .where(lt(this.table.expiresAt, new Date()))
      .returning()) as CacheRow[]
    return expired.length
  }
}
