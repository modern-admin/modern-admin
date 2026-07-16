import { rowToCacheEntry, type CacheEntry, type CacheRow, type ICacheStore } from '@modern-admin/core'
import { eq, inArray, lt } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

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
    return rowToCacheEntry(row)
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
    // Page through the table (key ordered, key+tags projection only) so a
    // large cache never loads whole in memory at once.
    const BATCH = 1000
    const targetKeys: string[] = []
    let offset = 0
    for (;;) {
      const rows = (await this.db
        .select({ key: this.table.key, tags: this.table.tags })
        .from(this.table)
        .orderBy(this.table.key)
        .limit(BATCH)
        .offset(offset)) as Array<Pick<CacheRow, 'key' | 'tags'>>
      for (const r of rows) {
        if (Array.isArray(r.tags) && (r.tags as string[]).some((t) => set.has(t))) {
          targetKeys.push(r.key)
        }
      }
      if (rows.length < BATCH) break
      offset += BATCH
    }
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
