// Port interfaces for runtime subsystems persisted in the host database.
//
// Each port is a thin async CRUD surface — adapter packages
// (`@modern-admin/system-prisma`, `@modern-admin/system-drizzle`) implement
// them against the host's ORM client. Default no-op / in-memory variants
// live alongside the ports for tests and zero-config dev.
//
// `ILogStore` is the canonical home for the action-log sink (the Pro
// `@modern-admin-pro/feature-logging` plugin re-exports from here).

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

// ─── Logs ─────────────────────────────────────────────────────────────────

/** Action log sink. See `ActionLogEntry` in `./schemas.js`. */
export interface ILogStore {
  record(entry: ActionLogEntry): void | Promise<void>
}

/** Optional history-style log readback (not all stores support it). */
export interface IQueryableLogStore extends ILogStore {
  list(filter?: {
    resourceId?: string
    recordId?: string
    userId?: string
    actions?: string[]
    from?: Date
    to?: Date
    limit?: number
    offset?: number
    /** Cursor: return only entries with `at` strictly before this unix-ms value. */
    before?: number
  }): Promise<ActionLogEntry[]>
}

// ─── Webhooks ─────────────────────────────────────────────────────────────

export interface IWebhookStore {
  list(): Promise<Webhook[]>
  get(id: string): Promise<Webhook | null>
  create(input: WebhookInput): Promise<Webhook>
  update(id: string, patch: Partial<WebhookInput>): Promise<Webhook>
  delete(id: string): Promise<void>

  /** Append a delivery attempt. Returns the persisted row. */
  recordDelivery(
    delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>,
  ): Promise<WebhookDelivery>
  listDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>
}

// ─── Config ───────────────────────────────────────────────────────────────

export interface IConfigStore {
  get(scope: ConfigScope, scopeId: string | null, key: string): Promise<unknown>
  set(scope: ConfigScope, scopeId: string | null, key: string, value: unknown): Promise<void>
  delete(scope: ConfigScope, scopeId: string | null, key: string): Promise<void>
  list(scope: ConfigScope, scopeId: string | null): Promise<ConfigEntry[]>
}

// ─── History ──────────────────────────────────────────────────────────────

export interface IHistoryStore {
  append(input: {
    resourceId: string
    recordId: string
    op: HistoryOp
    userId?: string
    snapshot: Record<string, unknown>
    snapshotBefore?: Record<string, unknown>
  }): Promise<HistoryEntry>

  list(
    resourceId: string,
    recordId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<HistoryEntry[]>
  get(resourceId: string, recordId: string, revisionId: string): Promise<HistoryEntry | null>
  /** Latest revision for a record, or null if none exist. */
  latest(resourceId: string, recordId: string): Promise<HistoryEntry | null>
}

// ─── AI tasks ─────────────────────────────────────────────────────────────

export interface IAiTaskStore {
  enqueue(input: AiTaskInput): Promise<AiTask>
  get(id: string): Promise<AiTask | null>
  list(filter?: {
    kind?: string
    status?: AiTaskStatus | AiTaskStatus[]
    userId?: string
    resourceId?: string
    limit?: number
  }): Promise<AiTask[]>

  /** Update task status. `output`/`error` are written when terminal. */
  updateStatus(
    id: string,
    patch: {
      status: AiTaskStatus
      progress?: number | null
      output?: Record<string, unknown>
      error?: string
    },
  ): Promise<AiTask>

  /** Append a streaming event row for real-time UI updates. */
  appendEvent(
    taskId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<AiTaskEvent>

  events(taskId: string, sinceId?: string): Promise<AiTaskEvent[]>
}

// ─── Cache (SQL fallback) ─────────────────────────────────────────────────

/**
 * SQL-backed cache. Distinct from `ICacheProvider` in
 * `@modern-admin/core/ports` (which is an in-process cache facade) — this
 * one persists rows so multi-node hosts can share cached values without
 * Redis. Implementations must honour `expiresAt` lazily on read.
 */
export interface ICacheStore {
  get(key: string): Promise<CacheEntry | null>
  set(
    key: string,
    value: unknown,
    options?: { ttlMs?: number; tags?: string[] },
  ): Promise<void>
  delete(key: string): Promise<void>
  /** Invalidate every entry tagged with any of the given tags. */
  invalidateTags(tags: string[]): Promise<number>
  /** Drop expired rows. Implementations may run this on a schedule. */
  prune(): Promise<number>
}

// ─── Aggregate facade ─────────────────────────────────────────────────────

/**
 * What an adapter returns from `setupPrismaSystem` / `setupDrizzleSystem`.
 * Hosts wire individual stores into the corresponding subsystem options
 * (e.g. `actionLoggingPlugin({ store: system.logStore })`).
 */
export interface ISystemStores {
  logStore: IQueryableLogStore
  webhookStore: IWebhookStore
  configStore: IConfigStore
  historyStore: IHistoryStore
  aiTaskStore: IAiTaskStore
  cacheStore: ICacheStore
}
