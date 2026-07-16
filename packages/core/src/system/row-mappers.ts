// Shared row → domain mappers for the ORM-backed system stores.
//
// `@modern-admin/system-prisma` and `@modern-admin/system-drizzle` persist the
// same logical rows (the schema in `modern-admin.prisma` / `schema/pg.ts` is a
// 1:1 mirror), so the row → entry projection is identical between them. It
// lives here so both adapters share one copy instead of maintaining
// byte-identical duplicates.
//
// The input row shapes are described loosely where the two ORMs disagree on the
// physical column type: `log.at` is a `bigint` under Prisma but a `number`
// under Drizzle (both round-trip through `Number()`), and `config.scopeId` is a
// non-null sentinel-encoded string under Prisma but a nullable column under
// Drizzle (the caller decodes the sentinel before mapping).

import type {
  ActionLogEntry,
  AiTask,
  AiTaskEvent,
  AiTaskStatus,
  CacheEntry,
  ConfigEntry,
  ConfigScope,
  HistoryEntry,
  HistoryOp,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './schemas.js'

export interface LogRow {
  id: string
  resourceId: string
  action: string
  recordId: string | null
  recordIds: unknown
  userId: string | null
  payload: unknown
  result: unknown
  at: bigint | number
  createdAt?: Date
}

export const rowToLogEntry = (row: LogRow): ActionLogEntry => ({
  id: row.id,
  resourceId: row.resourceId,
  action: row.action,
  ...(row.recordId !== null ? { recordId: row.recordId } : {}),
  ...(Array.isArray(row.recordIds) ? { recordIds: row.recordIds as string[] } : {}),
  ...(row.userId !== null ? { userId: row.userId } : {}),
  ...(row.payload !== null && row.payload !== undefined
    ? { payload: row.payload as Record<string, unknown> }
    : {}),
  ...(row.result !== null && row.result !== undefined
    ? { result: row.result as Record<string, unknown> }
    : {}),
  at: Number(row.at),
})

export interface TaskRow {
  id: string
  kind: string
  resourceId: string | null
  recordId: string | null
  userId: string | null
  status: string
  input: unknown
  output: unknown
  error: string | null
  progress: number | null
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

export const rowToTask = (row: TaskRow): AiTask => ({
  id: row.id,
  kind: row.kind,
  ...(row.resourceId !== null ? { resourceId: row.resourceId } : {}),
  ...(row.recordId !== null ? { recordId: row.recordId } : {}),
  ...(row.userId !== null ? { userId: row.userId } : {}),
  status: row.status as AiTaskStatus,
  input: (row.input as Record<string, unknown>) ?? {},
  ...(row.output !== null && row.output !== undefined
    ? { output: row.output as Record<string, unknown> }
    : {}),
  ...(row.error !== null ? { error: row.error } : {}),
  progress: row.progress,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  ...(row.startedAt !== null ? { startedAt: row.startedAt.toISOString() } : {}),
  ...(row.finishedAt !== null ? { finishedAt: row.finishedAt.toISOString() } : {}),
})

export interface EventRow {
  id: string
  taskId: string
  type: string
  data: unknown
  createdAt: Date
}

export const rowToEvent = (row: EventRow): AiTaskEvent => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type,
  data: (row.data as Record<string, unknown>) ?? {},
  createdAt: row.createdAt.toISOString(),
})

export interface CacheRow {
  key: string
  value: unknown
  tags: unknown
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export const rowToCacheEntry = (row: CacheRow): CacheEntry => ({
  key: row.key,
  value: row.value,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export interface ConfigRow {
  scope: string
  /** Already decoded to `null` for the global scope by the caller. */
  scopeId: string | null
  key: string
  value: unknown
  updatedAt: Date
}

export const rowToConfigEntry = (row: ConfigRow): ConfigEntry => ({
  scope: row.scope as ConfigScope,
  scopeId: row.scopeId,
  key: row.key,
  value: row.value,
  updatedAt: row.updatedAt.toISOString(),
})

export interface HistoryRow {
  id: string
  resourceId: string
  recordId: string
  op: string
  userId: string | null
  snapshot: unknown
  snapshotBefore: unknown
  createdAt: Date
}

export const rowToHistoryEntry = (row: HistoryRow): HistoryEntry => ({
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

export interface WebhookRow {
  id: string
  name: string
  url: string
  events: unknown
  resourceId: string | null
  enabled: boolean
  secret: string | null
  headers: unknown
  filters: unknown
  payloadFields: unknown
  createdAt: Date
  updatedAt: Date
}

export const rowToWebhook = (row: WebhookRow): Webhook => ({
  id: row.id,
  name: row.name,
  url: row.url,
  events: Array.isArray(row.events) ? (row.events as string[]) : [],
  resourceId: row.resourceId,
  enabled: row.enabled,
  ...(row.secret !== null ? { secret: row.secret } : {}),
  headers: (row.headers as Record<string, string>) ?? {},
  filters: (row.filters as Record<string, string>) ?? {},
  payloadFields: Array.isArray(row.payloadFields) ? (row.payloadFields as string[]) : [],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export interface DeliveryRow {
  id: string
  webhookId: string
  event: string
  payload: unknown
  status: string
  responseStatus: number | null
  responseBody: string | null
  error: string | null
  attempt: number
  createdAt: Date
  deliveredAt: Date | null
}

export const rowToDelivery = (row: DeliveryRow): WebhookDelivery => ({
  id: row.id,
  webhookId: row.webhookId,
  event: row.event,
  payload: (row.payload as Record<string, unknown>) ?? {},
  status: row.status as WebhookDeliveryStatus,
  ...(row.responseStatus !== null ? { responseStatus: row.responseStatus } : {}),
  ...(row.responseBody !== null ? { responseBody: row.responseBody } : {}),
  ...(row.error !== null ? { error: row.error } : {}),
  attempt: row.attempt,
  createdAt: row.createdAt.toISOString(),
  ...(row.deliveredAt !== null ? { deliveredAt: row.deliveredAt.toISOString() } : {}),
})
