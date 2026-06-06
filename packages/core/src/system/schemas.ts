// System tables — canonical Zod schemas for entry shapes.
//
// These describe rows persisted by the modern-admin runtime in the host
// database (logs, webhooks, configs, history, AI tasks, cache fallback).
// Adapters in `@modern-admin/system-prisma` and `@modern-admin/system-drizzle`
// map directly to these shapes.
//
// Convention: every schema has `id` and `createdAt` minimum. Tables are
// scoped via the host's chosen `tablePrefix` (default `ma_`) or schema.

import { z } from 'zod'

// ─── Log entries (action log) ─────────────────────────────────────────────

/**
 * One recorded action. Canonical row shape consumed by persistent stores
 * (`@modern-admin/system-prisma`, `system-drizzle`) and by the Pro
 * `@modern-admin-pro/feature-logging` plugin so writers and stores agree
 * on the schema.
 */
export const actionLogEntryZ = z.object({
  /**
   * Stable identifier — assigned by the writer (`actionLoggingPlugin`)
   * via `uuidv7()` so React lists keyed by entry can stay stable across
   * re-renders without needing a synthetic key.
   */
  id: z.uuid().optional(),
  resourceId: z.string().min(1),
  action: z.string().min(1),
  recordId: z.string().optional(),
  recordIds: z.array(z.string()).optional(),
  /** Human-readable title of the affected record (derived from the resource's
   *  title property at write time so it survives record deletion). */
  recordTitle: z.string().optional(),
  userId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  /** Unix-ms timestamp of when the action's after-hook fired. */
  at: z.number().int(),
})
export type ActionLogEntry = z.infer<typeof actionLogEntryZ>

// ─── Webhooks ─────────────────────────────────────────────────────────────

export const webhookEventZ = z.string().min(1).max(120)

/**
 * Outgoing webhook subscription. `events` is a list of dotted event names
 * (e.g. `users.created`, `orders.*`). `headers` are extra HTTP headers
 * sent with every delivery. `secret` is used for HMAC signing.
 */
export const webhookZ = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  url: z.url(),
  events: z.array(webhookEventZ).min(1),
  /** Optional resource/model scope. `null` means every resource. */
  resourceId: z.string().min(1).nullable().default(null),
  enabled: z.boolean().default(true),
  secret: z.string().min(8).optional(),
  headers: z.record(z.string(), z.string()).default({}),
  /** List-page-style filters matched against the mutation snapshot. */
  filters: z.record(z.string(), z.string()).default({}),
  /** Optional payload projection. Empty = include the whole record snapshot. */
  payloadFields: z.array(z.string().min(1)).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Webhook = z.infer<typeof webhookZ>
export type WebhookInput = Omit<z.input<typeof webhookZ>, 'id' | 'createdAt' | 'updatedAt'>

export const webhookDeliveryStatusZ = z.enum(['pending', 'success', 'failed'])
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusZ>

/** One attempt to deliver an event to a webhook. */
export const webhookDeliveryZ = z.object({
  id: z.uuid(),
  webhookId: z.uuid(),
  event: webhookEventZ,
  payload: z.record(z.string(), z.unknown()),
  status: webhookDeliveryStatusZ,
  responseStatus: z.number().int().optional(),
  responseBody: z.string().optional(),
  error: z.string().optional(),
  attempt: z.number().int().min(1).default(1),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().optional(),
})
export type WebhookDelivery = z.infer<typeof webhookDeliveryZ>

// ─── Config (key/value) ───────────────────────────────────────────────────

export const configScopeZ = z.enum(['global', 'user', 'resource'])
export type ConfigScope = z.infer<typeof configScopeZ>

/**
 * Generic key/value config. Scope distinguishes global settings from
 * per-user preferences and per-resource overrides; the composite primary
 * key is `(scope, scopeId, key)`.
 */
export const configEntryZ = z.object({
  scope: configScopeZ,
  /** `null` for global, userId for user, resourceId for resource. */
  scopeId: z.string().nullable(),
  key: z.string().min(1).max(200),
  value: z.unknown(),
  updatedAt: z.iso.datetime(),
})
export type ConfigEntry = z.infer<typeof configEntryZ>

// ─── History (record revisions) ───────────────────────────────────────────

export const historyOpZ = z.enum(['create', 'update', 'delete'])
export type HistoryOp = z.infer<typeof historyOpZ>

/**
 * A revision of a single record. Stores the full record params snapshot
 * after the change (or before, for `delete`). Diffs are computed by the
 * UI by comparing consecutive snapshots.
 *
 * `snapshotBefore` is the state of the record _just before_ this
 * revision was applied. It is what "Revert" feeds back into the resource
 * to undo the change. For `create` revisions it is `{}`; for `delete`
 * revisions it equals `snapshot`.
 */
export const historyEntryZ = z.object({
  id: z.uuid(),
  resourceId: z.string().min(1),
  recordId: z.string().min(1),
  op: historyOpZ,
  userId: z.string().optional(),
  /** Snapshot of `record.params` after the change (or before, on delete). */
  snapshot: z.record(z.string(), z.unknown()),
  /** Snapshot of `record.params` _before_ this revision was applied. */
  snapshotBefore: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.iso.datetime(),
})
export type HistoryEntry = z.infer<typeof historyEntryZ>

// ─── AI tasks ─────────────────────────────────────────────────────────────

export const aiTaskStatusZ = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
export type AiTaskStatus = z.infer<typeof aiTaskStatusZ>

/**
 * Long-running task spawned by an AI action (e.g. "summarise these 1000
 * records"). The runtime polls/streams the row to surface progress to the UI.
 */
export const aiTaskZ = z.object({
  id: z.uuid(),
  /** Logical task kind, e.g. `summarise`, `classify`, `chat`. */
  kind: z.string().min(1).max(120),
  resourceId: z.string().optional(),
  recordId: z.string().optional(),
  userId: z.string().optional(),
  status: aiTaskStatusZ,
  /** Free-form input passed to the worker. */
  input: z.record(z.string(), z.unknown()).default({}),
  /** Final output once the task succeeds. */
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  /** 0..100 percentage; `null` for indeterminate progress. */
  progress: z.number().int().min(0).max(100).nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
})
export type AiTask = z.infer<typeof aiTaskZ>
export type AiTaskInput = Omit<
  z.input<typeof aiTaskZ>,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'progress'
>

/** Streaming event emitted by an AI task while it runs. */
export const aiTaskEventZ = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  /** `progress`, `partial`, `log`, `error`. */
  type: z.string().min(1).max(40),
  data: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.iso.datetime(),
})
export type AiTaskEvent = z.infer<typeof aiTaskEventZ>

// ─── Persistent cache (fallback when Redis unavailable) ───────────────────

/**
 * Row in the SQL fallback cache table. The framework always prefers
 * Redis when configured; this exists so single-node hosts get cross-process
 * cache invalidation for free.
 */
export const cacheEntryZ = z.object({
  key: z.string().min(1).max(400),
  value: z.unknown(),
  /** Comma-separated tags for bulk invalidation. */
  tags: z.array(z.string()).default([]),
  /** Absolute expiry; `null` = never. */
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type CacheEntry = z.infer<typeof cacheEntryZ>
