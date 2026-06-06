import type { CacheEntry, ICacheStore } from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

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

export class PrismaCacheStore implements ICacheStore {
  constructor(private readonly delegate: PrismaDelegate<CacheRow>) {}

  async get(key: string): Promise<CacheEntry | null> {
    const row = await this.delegate.findUnique({ where: { key } })
    if (!row) return null
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.delegate.delete({ where: { key } }).catch(() => undefined)
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
    const rows = await this.delegate.findMany({})
    const targets = rows.filter((r) =>
      Array.isArray(r.tags) && (r.tags as string[]).some((t) => set.has(t)),
    )
    if (!targets.length) return 0
    const result = await this.delegate.deleteMany({
      where: { key: { in: targets.map((r) => r.key) } },
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
