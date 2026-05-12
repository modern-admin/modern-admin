// In-memory implementations of the system ports.
//
// Used by tests, by zero-config demos, and as the default when the host
// hasn't wired a persistent adapter. Every store keeps a public `entries`
// (or equivalent) array for inspection.
//
// Not suitable for production: nothing here survives a process restart.

import { uuidv7 } from '../utils/uuid.js'
import type {
  IAiTaskStore,
  ICacheStore,
  IConfigStore,
  IHistoryStore,
  ILogStore,
  ISystemStores,
  IWebhookStore,
  IQueryableLogStore,
} from './ports.js'
import type {
  ActionLogEntry,
  AiTask,
  AiTaskEvent,
  AiTaskInput,
  AiTaskStatus,
  CacheEntry,
  ConfigEntry,
  ConfigScope,
  HistoryEntry,
  HistoryOp,
  Webhook,
  WebhookDelivery,
  WebhookInput,
} from './schemas.js'

const nowIso = (): string => new Date().toISOString()

// ─── Log ──────────────────────────────────────────────────────────────────

export class MemoryLogStore implements IQueryableLogStore {
  public readonly entries: ActionLogEntry[] = []
  record(entry: ActionLogEntry): void { this.entries.push(entry) }
  async list(filter: Parameters<IQueryableLogStore['list']>[0] = {}): Promise<ActionLogEntry[]> {
    let result = this.entries.slice()
    if (filter.resourceId) result = result.filter((e) => e.resourceId === filter.resourceId)
    if (filter.recordId) result = result.filter((e) => e.recordId === filter.recordId)
    if (filter.userId) result = result.filter((e) => e.userId === filter.userId)
    if (filter.actions?.length) {
      const set = new Set(filter.actions)
      result = result.filter((e) => set.has(e.action))
    }
    if (filter.from) result = result.filter((e) => e.at >= filter.from!.getTime())
    if (filter.to) result = result.filter((e) => e.at <= filter.to!.getTime())
    result.sort((a, b) => b.at - a.at)
    if (filter.offset) result = result.slice(filter.offset)
    if (filter.limit !== undefined) result = result.slice(0, filter.limit)
    return result
  }
  clear(): void { this.entries.length = 0 }
}

export class ConsoleLogStore implements ILogStore {
  record(entry: ActionLogEntry): void {
    // eslint-disable-next-line no-console
    console.log('[modern-admin:action-log]', JSON.stringify(entry))
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────

export class MemoryWebhookStore implements IWebhookStore {
  public readonly webhooks: Webhook[] = []
  public readonly deliveries: WebhookDelivery[] = []

  async list(): Promise<Webhook[]> { return this.webhooks.slice() }
  async get(id: string): Promise<Webhook | null> {
    return this.webhooks.find((w) => w.id === id) ?? null
  }
  async create(input: WebhookInput): Promise<Webhook> {
    const w: Webhook = {
      id: uuidv7(),
      name: input.name,
      url: input.url,
      events: input.events,
      resourceId: input.resourceId ?? null,
      enabled: input.enabled ?? true,
      headers: input.headers ?? {},
      filters: input.filters ?? {},
      payloadFields: input.payloadFields ?? [],
      ...(input.secret !== undefined ? { secret: input.secret } : {}),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.webhooks.push(w)
    return w
  }
  async update(id: string, patch: Partial<WebhookInput>): Promise<Webhook> {
    const idx = this.webhooks.findIndex((w) => w.id === id)
    if (idx < 0) throw new Error(`Webhook not found: ${id}`)
    const next: Webhook = {
      ...this.webhooks[idx]!,
      ...patch,
      ...(patch.resourceId !== undefined ? { resourceId: patch.resourceId ?? null } : {}),
      updatedAt: nowIso(),
    }
    this.webhooks[idx] = next
    return next
  }
  async delete(id: string): Promise<void> {
    const idx = this.webhooks.findIndex((w) => w.id === id)
    if (idx >= 0) this.webhooks.splice(idx, 1)
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      if (this.deliveries[i]!.webhookId === id) this.deliveries.splice(i, 1)
    }
  }
  async recordDelivery(
    delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>,
  ): Promise<WebhookDelivery> {
    const d: WebhookDelivery = { ...delivery, id: uuidv7(), createdAt: nowIso() }
    this.deliveries.push(d)
    return d
  }
  async listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    return this.deliveries
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }
}

// ─── Config ───────────────────────────────────────────────────────────────

const configKey = (scope: ConfigScope, scopeId: string | null, key: string) =>
  `${scope}::${scopeId ?? '_'}::${key}`

export class MemoryConfigStore implements IConfigStore {
  public readonly entries = new Map<string, ConfigEntry>()
  async get(scope: ConfigScope, scopeId: string | null, key: string): Promise<unknown> {
    return this.entries.get(configKey(scope, scopeId, key))?.value
  }
  async set(
    scope: ConfigScope,
    scopeId: string | null,
    key: string,
    value: unknown,
  ): Promise<void> {
    this.entries.set(configKey(scope, scopeId, key), {
      scope, scopeId, key, value, updatedAt: nowIso(),
    })
  }
  async delete(scope: ConfigScope, scopeId: string | null, key: string): Promise<void> {
    this.entries.delete(configKey(scope, scopeId, key))
  }
  async list(scope: ConfigScope, scopeId: string | null): Promise<ConfigEntry[]> {
    return [...this.entries.values()].filter(
      (e) => e.scope === scope && e.scopeId === scopeId,
    )
  }
}

// ─── History ──────────────────────────────────────────────────────────────

/**
 * In-memory revision store.
 *
 * Lifecycle: instances are stateful — every appended entry stays on
 * `entries` for the lifetime of the JS process. Hosts that wire this
 * store as the default (e.g. `apps/api`) must reuse a single
 * `MemoryHistoryStore` across all consumers (the history feature, the
 * controller, plugin) by sharing the instance via DI / module-scope
 * singleton. Spinning up multiple instances yields divergent views.
 */
export class MemoryHistoryStore implements IHistoryStore {
  public readonly entries: HistoryEntry[] = []
  async append(input: {
    resourceId: string
    recordId: string
    op: HistoryOp
    userId?: string
    snapshot: Record<string, unknown>
    snapshotBefore?: Record<string, unknown>
  }): Promise<HistoryEntry> {
    const e: HistoryEntry = {
      id: uuidv7(),
      resourceId: input.resourceId,
      recordId: input.recordId,
      op: input.op,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      snapshot: input.snapshot,
      ...(input.snapshotBefore !== undefined ? { snapshotBefore: input.snapshotBefore } : {}),
      createdAt: nowIso(),
    }
    this.entries.push(e)
    return e
  }
  async list(
    resourceId: string,
    recordId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<HistoryEntry[]> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0
    return this.entries
      .filter((e) => e.resourceId === resourceId && e.recordId === recordId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit)
  }
  async get(resourceId: string, recordId: string, revisionId: string): Promise<HistoryEntry | null> {
    return this.entries.find(
      (e) => e.resourceId === resourceId && e.recordId === recordId && e.id === revisionId,
    ) ?? null
  }
  async latest(resourceId: string, recordId: string): Promise<HistoryEntry | null> {
    const [first] = await this.list(resourceId, recordId, { limit: 1 })
    return first ?? null
  }
}

// ─── AI tasks ─────────────────────────────────────────────────────────────

export class MemoryAiTaskStore implements IAiTaskStore {
  public readonly tasks: AiTask[] = []
  /** Public buffer of stream events (named `eventLog` to avoid clashing
   *  with the `events()` method that satisfies `IAiTaskStore`). */
  public readonly eventLog: AiTaskEvent[] = []

  async enqueue(input: AiTaskInput): Promise<AiTask> {
    const t: AiTask = {
      id: uuidv7(),
      kind: input.kind,
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      status: 'pending',
      input: input.input ?? {},
      progress: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.tasks.push(t)
    return t
  }
  async get(id: string): Promise<AiTask | null> {
    return this.tasks.find((t) => t.id === id) ?? null
  }
  async list(filter: Parameters<IAiTaskStore['list']>[0] = {}): Promise<AiTask[]> {
    let result = this.tasks.slice()
    if (filter.kind) result = result.filter((t) => t.kind === filter.kind)
    if (filter.status) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status]
      const set = new Set<AiTaskStatus>(list)
      result = result.filter((t) => set.has(t.status))
    }
    if (filter.userId) result = result.filter((t) => t.userId === filter.userId)
    if (filter.resourceId) result = result.filter((t) => t.resourceId === filter.resourceId)
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (filter.limit !== undefined) result = result.slice(0, filter.limit)
    return result
  }
  async updateStatus(
    id: string,
    patch: {
      status: AiTaskStatus
      progress?: number | null
      output?: Record<string, unknown>
      error?: string
    },
  ): Promise<AiTask> {
    const idx = this.tasks.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error(`AI task not found: ${id}`)
    const prev = this.tasks[idx]!
    const next: AiTask = {
      ...prev,
      status: patch.status,
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      ...(patch.output !== undefined ? { output: patch.output } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      updatedAt: nowIso(),
      ...(patch.status === 'running' && !prev.startedAt ? { startedAt: nowIso() } : {}),
      ...(['succeeded', 'failed', 'cancelled'].includes(patch.status)
        ? { finishedAt: nowIso() }
        : {}),
    }
    this.tasks[idx] = next
    return next
  }
  async appendEvent(
    taskId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<AiTaskEvent> {
    const e: AiTaskEvent = {
      id: uuidv7(),
      taskId,
      type,
      data,
      createdAt: nowIso(),
    }
    this.eventLog.push(e)
    return e
  }
  async events(taskId: string, sinceId?: string): Promise<AiTaskEvent[]> {
    const all = this.eventLog.filter((e) => e.taskId === taskId)
    if (!sinceId) return all
    const idx = all.findIndex((e) => e.id === sinceId)
    return idx < 0 ? all : all.slice(idx + 1)
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────

interface CacheRow {
  entry: CacheEntry
  expiresAtMs: number | null
}

export class MemoryCacheStore implements ICacheStore {
  private readonly rows = new Map<string, CacheRow>()

  async get(key: string): Promise<CacheEntry | null> {
    const row = this.rows.get(key)
    if (!row) return null
    if (row.expiresAtMs !== null && row.expiresAtMs < Date.now()) {
      this.rows.delete(key)
      return null
    }
    return row.entry
  }
  async set(
    key: string,
    value: unknown,
    options: { ttlMs?: number; tags?: string[] } = {},
  ): Promise<void> {
    const now = Date.now()
    const expiresAtMs = options.ttlMs ? now + options.ttlMs : null
    const entry: CacheEntry = {
      key,
      value,
      tags: options.tags ?? [],
      expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      createdAt: this.rows.get(key)?.entry.createdAt ?? new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }
    this.rows.set(key, { entry, expiresAtMs })
  }
  async delete(key: string): Promise<void> { this.rows.delete(key) }
  async invalidateTags(tags: string[]): Promise<number> {
    if (!tags.length) return 0
    const set = new Set(tags)
    let removed = 0
    for (const [key, row] of this.rows) {
      if (row.entry.tags.some((t) => set.has(t))) {
        this.rows.delete(key)
        removed++
      }
    }
    return removed
  }
  async prune(): Promise<number> {
    const now = Date.now()
    let removed = 0
    for (const [key, row] of this.rows) {
      if (row.expiresAtMs !== null && row.expiresAtMs < now) {
        this.rows.delete(key)
        removed++
      }
    }
    return removed
  }
}

// ─── Facade ───────────────────────────────────────────────────────────────

/** Bundle of in-memory stores — handy for tests and zero-config demos. */
export function createMemorySystem(): ISystemStores & {
  log: MemoryLogStore
  webhook: MemoryWebhookStore
  config: MemoryConfigStore
  history: MemoryHistoryStore
  aiTask: MemoryAiTaskStore
  cache: MemoryCacheStore
} {
  const log = new MemoryLogStore()
  const webhook = new MemoryWebhookStore()
  const config = new MemoryConfigStore()
  const history = new MemoryHistoryStore()
  const aiTask = new MemoryAiTaskStore()
  const cache = new MemoryCacheStore()
  return {
    log, webhook, config, history, aiTask, cache,
    logStore: log,
    webhookStore: webhook,
    configStore: config,
    historyStore: history,
    aiTaskStore: aiTask,
    cacheStore: cache,
  }
}
