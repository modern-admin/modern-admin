import {
  ConsoleLogger,
  type CacheSetOptions,
  type CacheTagEpochs,
  type ICacheProvider,
  type ILogger,
} from '../ports'
import { uuidv7 } from '../utils/uuid.js'
import { CACHE_KEY_VERSION } from './cache-keys.js'

export type CacheReadStatus = 'hit' | 'miss' | 'bypass' | 'revalidated'

export interface CacheRuntimeReadOptions {
  enabled: boolean
  ttl: number
  tags?: string[]
  jitterRatio?: number
  refresh?: boolean
  onChanged?: () => void | Promise<void>
  onStatus?: (status: CacheReadStatus) => void
  /** Opt-in distributed single-flight for unusually expensive reads. */
  crossReplicaLock?: boolean
  lockTtlMs?: number
  lockWaitMs?: number
}

export interface CacheRuntimeOptions {
  logger?: ILogger
  jitterRatio?: number
  invalidationAttempts?: number
  invalidationRetryBaseMs?: number
  quarantineRetryMs?: number
  /** Delta metrics log interval. Set to `0` to disable. Defaults to 10 minutes. */
  metricsLogIntervalMs?: number
}

export interface CacheMetricCounters {
  hits: number
  misses: number
  bypasses: number
  sets: number
  skippedWrites: number
  computes: number
  computeMs: number
  coalesced: number
  readErrors: number
  writeErrors: number
  invalidations: number
  invalidationErrors: number
  lockWaits: number
}

export interface CacheStatsEntry extends CacheMetricCounters {
  namespace: string
  resourceId?: string
}

export interface CacheRuntimeStats {
  instanceId: string
  entries: CacheStatsEntry[]
  dirtyTags: string[]
  inFlight: number
}

interface EpochSnapshot {
  tags: string[]
  local: Record<string, number>
  external: CacheTagEpochs
}

interface InFlightEntry<T> {
  snapshot: EpochSnapshot | null
  promise: Promise<T>
}

const EMPTY_COUNTERS = (): CacheMetricCounters => ({
  hits: 0,
  misses: 0,
  bypasses: 0,
  sets: 0,
  skippedWrites: 0,
  computes: 0,
  computeMs: 0,
  coalesced: 0,
  readErrors: 0,
  writeErrors: 0,
  invalidations: 0,
  invalidationErrors: 0,
  lockWaits: 0,
})

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const serializeForCompare = (value: unknown): string | null => {
  try {
    return JSON.stringify(value, (_key, val: unknown) =>
      typeof val === 'bigint' ? val.toString() : val,
    ) ?? null
  } catch {
    return null
  }
}

export const listTag = (resourceId: string): string => `list:${resourceId}`
export const recordTag = (resourceId: string, recordId: string): string =>
  `record:${resourceId}:${recordId}`
export const recordsTag = (resourceId: string): string => `records:${resourceId}`
export const rolePermissionsTag = (roleName?: string): string =>
  roleName ? `role-perms:${roleName}` : 'role-perms'

const metricIdentity = (key: string, tags: readonly string[]): { namespace: string; resourceId?: string } => {
  const segments = key.split(':')
  const namespace = segments[0] === CACHE_KEY_VERSION ? (segments[1] ?? 'unknown') : (segments[0] ?? 'unknown')
  const resourceTag = tags.find((tag) =>
    tag.startsWith('list:') || tag.startsWith('record:') || tag.startsWith('records:'),
  )
  const resourceId = resourceTag?.split(':')[1]
  return { namespace, ...(resourceId ? { resourceId } : {}) }
}

const sameSnapshot = (a: EpochSnapshot | null, b: EpochSnapshot | null): boolean => {
  if (a === null || b === null) return a === b
  if (a.tags.length !== b.tags.length) return false
  return a.tags.every((tag, index) =>
    tag === b.tags[index] &&
    a.local[tag] === b.local[tag] &&
    a.external[tag] === b.external[tag],
  )
}

/** Read-side cache coordinator shared by every framework transport. All
 * built-in reads and invalidations pass through this facade so tag epochs,
 * failure isolation, metrics, and quarantine have one source of truth. */
export class CacheRuntime {
  private readonly inFlight = new Map<string, InFlightEntry<unknown>>()
  private readonly localTagEpochs = new Map<string, number>()
  private readonly dirtyTags = new Set<string>()
  private readonly metrics = new Map<string, CacheStatsEntry>()
  private readonly logger: ILogger
  private readonly jitterRatio: number
  private readonly invalidationAttempts: number
  private readonly invalidationRetryBaseMs: number
  private readonly quarantineRetryMs: number
  private quarantineTimer: ReturnType<typeof setTimeout> | null = null
  private metricsTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false
  readonly instanceId = uuidv7()

  constructor(public readonly cache: ICacheProvider, options: CacheRuntimeOptions = {}) {
    this.logger = options.logger ?? new ConsoleLogger()
    this.jitterRatio = Math.max(0, options.jitterRatio ?? 0.1)
    this.invalidationAttempts = Math.max(1, options.invalidationAttempts ?? 3)
    this.invalidationRetryBaseMs = Math.max(0, options.invalidationRetryBaseMs ?? 25)
    this.quarantineRetryMs = Math.max(100, options.quarantineRetryMs ?? 1_000)
    const metricsLogIntervalMs = Math.max(0, options.metricsLogIntervalMs ?? 600_000)
    if (metricsLogIntervalMs > 0) {
      this.metricsTimer = setInterval(() => {
        const delta = this.stats(true)
        if (delta.entries.length > 0 || delta.dirtyTags.length > 0) {
          this.logger.info('[modern-admin] cache metrics', delta as unknown as Record<string, unknown>)
        }
      }, metricsLogIntervalMs)
      this.metricsTimer.unref?.()
    }
  }

  private counters(key: string, tags: readonly string[]): CacheStatsEntry {
    const identity = metricIdentity(key, tags)
    const id = `${identity.namespace}:${identity.resourceId ?? '*'}`
    let counters = this.metrics.get(id)
    if (!counters) {
      counters = { ...identity, ...EMPTY_COUNTERS() }
      this.metrics.set(id, counters)
    }
    return counters
  }

  private localEpoch(tag: string): number {
    return this.localTagEpochs.get(tag) ?? 0
  }

  private hasDirtyTag(tags: readonly string[]): boolean {
    return tags.some((tag) => this.dirtyTags.has(tag))
  }

  private async snapshot(tagsInput: readonly string[]): Promise<EpochSnapshot | null> {
    const tags = Array.from(new Set(tagsInput)).sort()
    const local = Object.fromEntries(tags.map((tag) => [tag, this.localEpoch(tag)]))
    if (!this.cache.getTagEpochs || tags.length === 0) {
      return { tags, local, external: Object.fromEntries(tags.map((tag) => [tag, '0'])) }
    }
    try {
      const external = await this.cache.getTagEpochs(tags)
      return { tags, local, external }
    } catch (error) {
      this.logger.warn('[modern-admin] cache tag epoch read failed; bypassing cache', {
        error: error instanceof Error ? error.message : String(error),
        tags,
      })
      return null
    }
  }

  private localSnapshotStillCurrent(snapshot: EpochSnapshot): boolean {
    return snapshot.tags.every((tag) => snapshot.local[tag] === this.localEpoch(tag))
  }

  private async safeGet<T>(key: string, counters: CacheMetricCounters): Promise<{ ok: boolean; value: T | null }> {
    try {
      return { ok: true, value: await this.cache.get<T>(key) }
    } catch (error) {
      counters.readErrors++
      this.logger.warn('[modern-admin] cache read failed; treating as a miss', {
        error: error instanceof Error ? error.message : String(error),
        key,
      })
      return { ok: false, value: null }
    }
  }

  private async safeSet<T>(
    key: string,
    value: T,
    options: CacheRuntimeReadOptions,
    snapshot: EpochSnapshot | null,
    counters: CacheMetricCounters,
  ): Promise<void> {
    const tags = snapshot?.tags ?? Array.from(new Set(options.tags ?? [])).sort()
    if (!options.enabled || snapshot === null || this.hasDirtyTag(tags) || !this.localSnapshotStillCurrent(snapshot)) {
      counters.skippedWrites++
      return
    }
    const setOptions: CacheSetOptions = {
      ttl: options.ttl,
      tags,
      jitterRatio: options.jitterRatio ?? this.jitterRatio,
    }
    try {
      const stored = this.cache.setIfTagEpochsMatch
        ? await this.cache.setIfTagEpochsMatch(key, value, snapshot.external, setOptions)
        : await this.fallbackConditionalSet(key, value, snapshot, setOptions)
      if (stored) counters.sets++
      else counters.skippedWrites++
    } catch (error) {
      counters.writeErrors++
      this.logger.warn('[modern-admin] cache write failed; returning computed value', {
        error: error instanceof Error ? error.message : String(error),
        key,
      })
    }
  }

  private async fallbackConditionalSet<T>(
    key: string,
    value: T,
    snapshot: EpochSnapshot,
    options: CacheSetOptions,
  ): Promise<boolean> {
    const current = await this.snapshot(snapshot.tags)
    if (!sameSnapshot(snapshot, current)) return false
    await this.cache.set(key, value, options)
    return true
  }

  private async fetchAndStore<T>(
    key: string,
    options: CacheRuntimeReadOptions,
    fetch: () => Promise<T>,
    snapshot: EpochSnapshot | null,
    counters: CacheMetricCounters,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const started = Date.now()
      try {
        return await fetch()
      } finally {
        counters.computes++
        counters.computeMs += Date.now() - started
      }
    }

    if (options.crossReplicaLock && this.cache.acquireLock && this.cache.releaseLock) {
      const token = uuidv7()
      let acquired: boolean | null = null
      try {
        acquired = await this.cache.acquireLock(key, token, options.lockTtlMs ?? 5_000)
      } catch (error) {
        this.logger.warn('[modern-admin] cache lock failed; computing without distributed coalescing', {
          error: error instanceof Error ? error.message : String(error),
          key,
        })
      }
      if (acquired === false) {
        counters.lockWaits++
        await wait(options.lockWaitMs ?? 120)
        const afterWait = await this.snapshot(options.tags ?? [])
        if (afterWait && !this.hasDirtyTag(afterWait.tags)) {
          const cached = await this.safeGet<T>(key, counters)
          const afterRead = cached.ok ? await this.snapshot(afterWait.tags) : null
          if (cached.ok && cached.value !== null && cached.value !== undefined && sameSnapshot(afterWait, afterRead)) {
            counters.hits++
            return cached.value
          }
        }
        const value = await run()
        await this.safeSet(key, value, options, afterWait, counters)
        return value
      }
      if (acquired) {
        try {
          const value = await run()
          await this.safeSet(key, value, options, snapshot, counters)
          return value
        } finally {
          try {
            await this.cache.releaseLock(key, token)
          } catch {
            // The token-protected lock expires on its own.
          }
        }
      }
    }

    const value = await run()
    await this.safeSet(key, value, options, snapshot, counters)
    return value
  }

  async read<T>(
    key: string,
    options: CacheRuntimeReadOptions,
    fetch: () => Promise<T>,
  ): Promise<T> {
    const tags = Array.from(new Set(options.tags ?? [])).sort()
    const counters = this.counters(key, tags)
    if (options.refresh) return this.revalidate(key, { ...options, tags }, fetch, counters)

    if (!options.enabled || this.hasDirtyTag(tags)) {
      counters.bypasses++
      options.onStatus?.('bypass')
      return this.readThroughInFlight(key, options, fetch, null, counters)
    }

    const beforeRead = await this.snapshot(tags)
    if (beforeRead === null) {
      counters.bypasses++
      options.onStatus?.('bypass')
      return this.readThroughInFlight(key, options, fetch, null, counters)
    }
    const cached = await this.safeGet<T>(key, counters)
    const afterRead = cached.ok ? await this.snapshot(tags) : null
    if (
      cached.ok &&
      cached.value !== null &&
      cached.value !== undefined &&
      sameSnapshot(beforeRead, afterRead)
    ) {
      counters.hits++
      options.onStatus?.('hit')
      return cached.value
    }

    counters.misses++
    options.onStatus?.('miss')
    return this.readThroughInFlight(key, options, fetch, afterRead ?? beforeRead, counters)
  }

  private readThroughInFlight<T>(
    key: string,
    options: CacheRuntimeReadOptions,
    fetch: () => Promise<T>,
    snapshot: EpochSnapshot | null,
    counters: CacheMetricCounters,
  ): Promise<T> {
    const existing = this.inFlight.get(key) as InFlightEntry<T> | undefined
    if (existing && sameSnapshot(existing.snapshot, snapshot)) {
      counters.coalesced++
      return existing.promise
    }

    const promise = this.fetchAndStore(key, options, fetch, snapshot, counters)
    const entry: InFlightEntry<T> = { snapshot, promise }
    this.inFlight.set(key, entry as InFlightEntry<unknown>)
    void promise.finally(() => {
      if (this.inFlight.get(key) === entry) this.inFlight.delete(key)
    }).catch(() => {})
    return promise
  }

  private async revalidate<T>(
    key: string,
    options: CacheRuntimeReadOptions,
    fetch: () => Promise<T>,
    counters: CacheMetricCounters,
  ): Promise<T> {
    options.onStatus?.('revalidated')
    const tags = options.tags ?? []
    const beforeRead = options.enabled ? await this.snapshot(tags) : null
    const previous = options.enabled && beforeRead
      ? await this.safeGet<T>(key, counters)
      : { ok: false, value: null }
    const started = Date.now()
    let value: T
    try {
      value = await fetch()
    } finally {
      counters.computes++
      counters.computeMs += Date.now() - started
    }
    if (!options.enabled) return value

    let writeSnapshot = beforeRead
    if (previous.ok && previous.value !== null && previous.value !== undefined) {
      const before = serializeForCompare(previous.value)
      const after = serializeForCompare(value)
      if (before === null || after === null || before !== after) {
        await options.onChanged?.()
        writeSnapshot = await this.snapshot(tags)
      }
    }
    await this.safeSet(key, value, options, writeSnapshot, counters)
    return value
  }

  private async invalidateProviderWithRetry(tags: string[]): Promise<boolean> {
    let lastError: unknown
    for (let attempt = 0; attempt < this.invalidationAttempts; attempt++) {
      try {
        await this.cache.invalidateTag(tags)
        return true
      } catch (error) {
        lastError = error
        if (attempt + 1 < this.invalidationAttempts) {
          await wait(this.invalidationRetryBaseMs * 2 ** attempt)
        }
      }
    }
    this.logger.error('[modern-admin] cache invalidation failed; tags quarantined', {
      error: lastError instanceof Error ? lastError.message : String(lastError),
      tags,
    })
    return false
  }

  async invalidateTags(tagsInput: string | string[]): Promise<void> {
    const tags = Array.from(new Set(Array.isArray(tagsInput) ? tagsInput : [tagsInput])).sort()
    if (tags.length === 0) return
    for (const tag of tags) {
      this.localTagEpochs.set(tag, this.localEpoch(tag) + 1)
      this.dirtyTags.add(tag)
    }
    const counters = this.counters('invalidate:tags', tags)
    counters.invalidations++
    if (await this.invalidateProviderWithRetry(tags)) {
      for (const tag of tags) this.dirtyTags.delete(tag)
      return
    }
    counters.invalidationErrors++
    this.scheduleQuarantineRetry()
  }

  private scheduleQuarantineRetry(): void {
    if (this.disposed || this.quarantineTimer || this.dirtyTags.size === 0) return
    this.quarantineTimer = setTimeout(() => {
      this.quarantineTimer = null
      void this.flushQuarantine()
    }, this.quarantineRetryMs)
    this.quarantineTimer.unref?.()
  }

  private async flushQuarantine(): Promise<void> {
    if (this.disposed || this.dirtyTags.size === 0) return
    const tags = Array.from(this.dirtyTags).sort()
    if (await this.invalidateProviderWithRetry(tags)) {
      for (const tag of tags) this.dirtyTags.delete(tag)
      this.logger.info('[modern-admin] cache quarantine drained', { tags })
    }
    this.scheduleQuarantineRetry()
  }

  stats(reset = false): CacheRuntimeStats {
    const result: CacheRuntimeStats = {
      instanceId: this.instanceId,
      entries: Array.from(this.metrics.values()).map((entry) => ({ ...entry })),
      dirtyTags: Array.from(this.dirtyTags).sort(),
      inFlight: this.inFlight.size,
    }
    if (reset) this.metrics.clear()
    return result
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.quarantineTimer) clearTimeout(this.quarantineTimer)
    this.quarantineTimer = null
    if (this.metricsTimer) clearInterval(this.metricsTimer)
    this.metricsTimer = null
  }

  get inFlightSize(): number {
    return this.inFlight.size
  }
}
