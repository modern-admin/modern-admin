import { rowToCacheEntry, type CacheEntry, type CacheRow, type ICacheStore } from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

export class PrismaCacheStore implements ICacheStore {
  constructor(private readonly delegate: PrismaDelegate<CacheRow>) {}

  async get(key: string): Promise<CacheEntry | null> {
    const row = await this.delegate.findUnique({ where: { key } })
    if (!row) return null
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.delegate.delete({ where: { key } }).catch(() => undefined)
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
    await this.delegate.upsert({
      where: { key },
      create: { key, value: value ?? null, tags, expiresAt },
      update: { value: value ?? null, tags, expiresAt },
    })
  }

  async delete(key: string): Promise<void> {
    await this.delegate.delete({ where: { key } }).catch(() => undefined)
  }

  /**
   * Tag invalidation walks the table because Prisma's portable `Json` field
   * doesn't support array-contains across all DB engines. For high-volume
   * caches use a Postgres-specific implementation (`tags String[]`) or
   * Redis. Here correctness > throughput by design.
   */
  async invalidateTags(tags: string[]): Promise<number> {
    if (!tags.length) return 0
    const set = new Set(tags)
    // Page through the table (key ordered, key+tags projection only) so a
    // large cache never loads whole in memory at once.
    const BATCH = 1000
    const targetKeys: string[] = []
    let skip = 0
    for (;;) {
      const rows = await this.delegate.findMany({
        select: { key: true, tags: true },
        orderBy: { key: 'asc' },
        take: BATCH,
        skip,
      })
      for (const r of rows) {
        if (Array.isArray(r.tags) && (r.tags as string[]).some((t) => set.has(t))) {
          targetKeys.push(r.key)
        }
      }
      if (rows.length < BATCH) break
      skip += BATCH
    }
    if (!targetKeys.length) return 0
    const result = await this.delegate.deleteMany({
      where: { key: { in: targetKeys } },
    })
    return result.count
  }

  async prune(): Promise<number> {
    const result = await this.delegate.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  }
}
