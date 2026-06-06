/**
 * Drizzle pg-core table objects for the Modern Admin system tables.
 *
 * Mirrors the `prisma/modern-admin.prisma` fragment shipped with
 * `@modern-admin/system-prisma` so the runtime stores see equivalent
 * shapes regardless of which ORM the host picks.
 *
 * Tables fall into two groups:
 *
 *   1. **Better Auth** (`maUser`, `maSession`, `maAccount`,
 *      `maVerification`, `maApiKey`) — physical tables that back Better
 *      Auth's `user/session/account/verification` and the `apikey`
 *      plugin. Better Auth is configured to remap its logical names to
 *      these `ma_*` SQL tables; declaring them here means a single CLI
 *      run (`bunx @modern-admin/create-modern-admin generate`) wires up
 *      everything the runtime needs.
 *   2. **Modern Admin core** (`maRole`, `maLog`, `maWebhook`, …) — the
 *      framework's own runtime tables.
 *
 * Usage:
 *
 *   import * as systemSchema from '@modern-admin/system-drizzle/pg'
 *   export const schema = { ...mySchema, ...systemSchema }
 *   export const db = drizzle(client, { schema })
 *
 * Naming: every table has its `ma_*` SQL name baked into the table
 * declaration. To use a different prefix, copy this file into your
 * project, rename, and pass the renamed objects into `setupDrizzleSystem`.
 */

import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

// ─── Better Auth ──────────────────────────────────────────────────────────

/**
 * Panel admin (Better Auth `user` table, remapped to `ma_user`).
 *
 * Admin plugin contributes `role`/`banned`/`banReason`/`banExpires`. The
 * `role` column references `ma_role.id` (which doubles as the
 * user-visible name) and is what `ModernAdmin.invoke()` uses to look up
 * the permissions matrix.
 */
export const maUser = pgTable('ma_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** Role id (= name); resolves to a row in `ma_role` for permissions lookup. */
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maSession = pgTable('ma_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id')
    .notNull()
    .references(() => maUser.id, { onDelete: 'cascade' }),
  /** Active impersonation source; admin plugin uses this to track
   *  "log in as" sessions so audit logs can attribute the real actor. */
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maAccount = pgTable('ma_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => maUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Hashed password for the email/password strategy. OAuth/passkey rows
   *  leave this null — credentials are encoded in the provider tokens. */
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maVerification = pgTable('ma_verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Better Auth api-key plugin storage. `permissions` is a JSON object
 * `{ resourceId: action[] }` consumed by `ModernAdmin.invoke()`'s
 * api-key gate (see also `maRole.permissions` for the role-based gate —
 * both share the same matching helper).
 */
export const maApiKey = pgTable('ma_apikey', {
  id: uuid('id').primaryKey().defaultRandom(),
  configId: text('config_id').notNull().default('default'),
  name: text('name'),
  start: text('start'),
  prefix: text('prefix'),
  key: text('key').notNull(),
  referenceId: uuid('reference_id')
    .notNull()
    .references(() => maUser.id, { onDelete: 'cascade' }),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
  lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
  enabled: boolean('enabled').notNull().default(true),
  rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(false),
  rateLimitTimeWindow: integer('rate_limit_time_window'),
  rateLimitMax: integer('rate_limit_max'),
  requestCount: integer('request_count').notNull().default(0),
  remaining: integer('remaining'),
  lastRequest: timestamp('last_request', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  permissions: jsonb('permissions'),
  metadata: jsonb('metadata'),
})

// ─── Modern Admin core ────────────────────────────────────────────────────

/**
 * Configurable role with a permissions matrix.
 *
 * `permissions` shape: `Record<resourceId, action[]>`, where `'*'` is a
 * wildcard for actions or for a resource key (matches every resource).
 * The `id` doubles as the user-visible role name — there is no separate
 * `name` column. Application code supplies `id` on insert (`'admin'`,
 * `'editor'`, …); it's a meaningful business id, not a surrogate UUID.
 *
 * Renames aren't supported (would orphan every panel admin holding the
 * role). The id is referenced from your panel-user table's `role`
 * column — e.g. Better Auth's `ma_user.role`.
 */
export const maRole = pgTable('ma_role', {
  id: text('id').primaryKey(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default(sql`'{}'::jsonb`),
  /** Built-in roles are seeded on boot and cannot be deleted via the UI. */
  isBuiltin: boolean('is_builtin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maLog = pgTable(
  'ma_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: text('resource_id').notNull(),
    action: text('action').notNull(),
    recordId: text('record_id'),
    recordIds: jsonb('record_ids'),
    userId: text('user_id'),
    payload: jsonb('payload'),
    result: jsonb('result'),
    /** Unix-ms timestamp captured at the after-hook. */
    at: bigint('at', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    resourceActionIdx: index('ma_log_resource_action_idx').on(t.resourceId, t.action),
    userIdx: index('ma_log_user_idx').on(t.userId),
    createdAtIdx: index('ma_log_created_at_idx').on(t.createdAt),
  }),
)

export const maWebhook = pgTable('ma_webhook', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: jsonb('events').notNull(),
  resourceId: text('resource_id'),
  enabled: boolean('enabled').notNull().default(true),
  secret: text('secret'),
  headers: jsonb('headers').notNull().default(sql`'{}'::jsonb`),
  filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
  payloadFields: jsonb('payload_fields').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maWebhookDelivery = pgTable(
  'ma_webhook_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => maWebhook.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    error: text('error'),
    attempt: integer('attempt').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => ({
    webhookCreatedAtIdx: index('ma_webhook_delivery_webhook_created_idx').on(
      t.webhookId,
      t.createdAt,
    ),
  }),
)

export const maConfig = pgTable(
  'ma_config',
  {
    /**
     * Surrogate primary key. Application code MUST set this with
     * `uuidv7()` from `@modern-admin/core` on insert — Drizzle's
     * `defaultRandom()` produces v4, which the project policy disallows.
     */
    id: uuid('id').primaryKey(),
    scope: text('scope').notNull(),
    /** `null` for global, userId for user, resourceId for resource. */
    scopeId: text('scope_id'),
    key: text('key').notNull(),
    value: jsonb('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Postgres treats NULL values as distinct in unique constraints by
    // default, so two `(scope='global', scopeId=null, key='foo')` rows
    // would coexist. `nullsNotDistinct()` matches the prisma fragment's
    // `@@unique` semantics and makes the global scope behave like a
    // regular composite key. Drizzle's `nullsNotDistinct` lives on the
    // `unique()` constraint builder, not on `uniqueIndex()`.
    scopeKey: unique('ma_config_scope_scope_id_key_uq')
      .on(t.scope, t.scopeId, t.key)
      .nullsNotDistinct(),
  }),
)

export const maHistory = pgTable(
  'ma_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: text('resource_id').notNull(),
    recordId: text('record_id').notNull(),
    op: text('op').notNull(),
    userId: text('user_id'),
    snapshot: jsonb('snapshot').notNull(),
    /** State of the record _before_ this revision — fed back into the
     *  resource on revert. Nullable for legacy rows. */
    snapshotBefore: jsonb('snapshot_before'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    recordIdx: index('ma_history_record_idx').on(
      t.resourceId,
      t.recordId,
      t.createdAt,
    ),
  }),
)

export const maAiTask = pgTable(
  'ma_ai_task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    resourceId: text('resource_id'),
    recordId: text('record_id'),
    userId: text('user_id'),
    status: text('status').notNull(),
    input: jsonb('input').notNull().default(sql`'{}'::jsonb`),
    output: jsonb('output'),
    error: text('error'),
    progress: integer('progress'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    kindStatusIdx: index('ma_ai_task_kind_status_idx').on(t.kind, t.status),
    userIdx: index('ma_ai_task_user_idx').on(t.userId),
    recordIdx: index('ma_ai_task_record_idx').on(t.resourceId, t.recordId),
  }),
)

export const maAiTaskEvent = pgTable(
  'ma_ai_task_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => maAiTask.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    taskCreatedIdx: index('ma_ai_task_event_task_created_idx').on(
      t.taskId,
      t.createdAt,
    ),
  }),
)

export const maCache = pgTable(
  'ma_cache',
  {
    key: text('key').primaryKey(),
    value: jsonb('value'),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    expiresIdx: index('ma_cache_expires_idx').on(t.expiresAt),
  }),
)

export const systemTables = {
  // Better Auth
  maUser,
  maSession,
  maAccount,
  maVerification,
  maApiKey,
  // Modern Admin core
  maRole,
  maLog,
  maWebhook,
  maWebhookDelivery,
  maConfig,
  maHistory,
  maAiTask,
  maAiTaskEvent,
  maCache,
} as const

export type SystemTables = typeof systemTables
