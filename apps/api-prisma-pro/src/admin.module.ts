// Pro reference admin module — wires Prisma + Postgres host alongside
// the three Pro plugins:
//
//   * `@modern-admin-pro/feature-ai-fill`   — vision-model field auto-fill
//   * `@modern-admin-pro/feature-logging`   — persistent action log in `ma_log`
//   * `@modern-admin-pro/feature-webhooks`  — outbound webhooks + UI
//
// This file deliberately mirrors `apps/api-prisma/src/admin.module.ts` from
// the open-core repo. The diff between the two is exactly the wiring of the
// three Pro plugins (imports, module registration, `plugins[]` entries,
// `webhookDispatcher` block), plus replacing the open-core
// `CustomersAdminModule` with `CustomersProAdminModule` (which adds
// `aiFillFeature(...)` on the customers resource).
//
// Open-core helpers (`PrismaDatabase`, `PrismaResource`, `setupPrismaSystem`,
// `buildBetterAuthProvider`, …) are resolved via the file: overrides in the
// root `package.json` — see `bunfig.toml` comment for the contract.

import { Module } from '@nestjs/common'
import { type BaseDatabase, type BaseResource, type IAuthProvider } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { ModernAdminAiFillModule } from '@modern-admin-pro/feature-ai-fill/nest'
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'
import { historyPlugin } from '@modern-admin/feature-history'
import { actionLoggingPlugin } from '@modern-admin-pro/feature-logging'
import {
  BullMqWebhookDispatcher,
  WEBHOOK_QUEUE,
  webhookPlugin,
  WebhookQueueModule,
} from '@modern-admin-pro/feature-webhooks'
import { QueueModule } from '@modern-admin/queue'
import { setupPrismaSystem } from '@modern-admin/system-prisma'
import {
  AdminsAdminModule,
  buildAiAssistantConfig,
  buildApiKeyService,
  buildBetterAuthProvider,
  CategoriesAdminModule,
  CommentsAdminModule,
  PostsAdminModule,
  ProductsAdminModule,
  RegionalAdminModule,
  RolesAdminModule,
  setAuditLogStore,
  TagsAdminModule,
} from '@modern-admin/app-shared'
import { Queue } from 'bullmq'
import { dmmf, prisma } from './db.js'
import { CustomersProAdminModule } from './admin/customers-pro.module.js'
// Side-effect import: registers Prisma resources with the shared admin
// source registry before any `@AdminResource` decorator is evaluated.
import './admin-sources.js'

/** System stores shared across the app — backed by Postgres via Prisma. */
export const system = setupPrismaSystem(prisma as never)

// Wire the audit-log sink used by Better Auth's `session.create.after`
// hook. Pro builds also load `actionLoggingPlugin` to capture resource
// CRUD; the auth hook covers login events uniformly across OAuth,
// password, passkey and api-key flows.
setAuditLogStore(system.logStore)

const authProvider = buildBetterAuthProvider()
const apiKeyService = buildApiKeyService(authProvider)

// Webhook dispatch — async via BullMQ when Redis is configured, sync
// in-process fallback otherwise (matches the open-core demo's behaviour
// before the Pro split).
const webhookRedisUrl = process.env.REDIS_URL
const webhookQueue = webhookRedisUrl
  ? new Queue(WEBHOOK_QUEUE, { connection: webhookRedisUrl as never })
  : null
const webhookDispatcher = webhookQueue
  ? new BullMqWebhookDispatcher(webhookQueue)
  : undefined

@Module({
  imports: [
    ...(webhookRedisUrl
      ? [
        QueueModule.forRoot({ connection: webhookRedisUrl }),
        WebhookQueueModule.register({ store: system.webhookStore }),
      ]
      : []),
    ModernAdminAiFillModule.forRoot(),
    ModernAdminUploadModule.forRoot(),
    ModernAdminModule.forRoot({
      global: true,
      adapters: [{
        Database: PrismaDatabase as unknown as typeof BaseDatabase,
        Resource: PrismaResource as unknown as typeof BaseResource,
      }],
      databases: [{ client: prisma, dmmf: dmmf }],
      branding: { companyName: 'Modern Admin Pro (prisma demo)' },
      rolesResourceId: 'roles',
      plugins: [
        historyPlugin({ store: system.historyStore }),
        webhookPlugin({ store: system.webhookStore, dispatcher: webhookDispatcher }),
        // Action logs land in `ma_log` instead of stdout.
        actionLoggingPlugin({ store: system.logStore }),
      ],
      configStore: system.configStore,
      aiTaskStore: system.aiTaskStore,
      historyStore: system.historyStore,
      logStore: system.logStore,
      webhookStore: system.webhookStore,
      ...(webhookDispatcher ? { webhookDispatcher } : {}),
      // Execute AI assistant SQL queries inside a PostgreSQL READ ONLY
      // transaction that is always rolled back — two layers of defence:
      //   1. SET TRANSACTION READ ONLY — PostgreSQL physically blocks any
      //      write operation (INSERT/UPDATE/DELETE/DDL) at the engine level.
      //   2. Explicit ROLLBACK (via sentinel throw) — the transaction is
      //      never committed, so even exotic side-effects (triggers, deferred
      //      constraints, pg_notify calls) are discarded.
      aiAssistant: buildAiAssistantConfig({
        rawQuery: (sql) => {
          const rollback = Symbol('rollback')
          let rows: unknown[] = []
          return prisma
            .$transaction(async (tx) => {
              await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
              rows = (await tx.$queryRawUnsafe(sql)) as unknown[]
              throw rollback        // forces Prisma to issue ROLLBACK
            })
            .catch((err) => {
              if (err === rollback) return rows   // expected sentinel — return data
              throw err                           // real error — re-throw
            })
        },
      }),
      ...(authProvider ? { auth: authProvider as IAuthProvider } : {}),
      ...(apiKeyService ? { apiKeyService } : {}),
    }),
    AdminsAdminModule,
    RolesAdminModule,
    CustomersProAdminModule,
    CategoriesAdminModule,
    TagsAdminModule,
    PostsAdminModule,
    CommentsAdminModule,
    ProductsAdminModule,
    RegionalAdminModule,
  ],
})
export class AdminModule {
}
