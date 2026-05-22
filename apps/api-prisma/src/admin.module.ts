// Reference wiring of @modern-admin/nest with a real Prisma 7 + Postgres
// host database.
//
// The interesting bits compared to `apps/api/src/admin.module.ts` (the
// SQLite demo) are:
//
//   - The Prisma adapter is bound to the *same* PrismaClient that powers
//     Better Auth — one connection pool, one migration history.
//   - `setupPrismaSystem(prisma)` builds the system stores (action log,
//     webhooks, config, history, AI tasks, cache fallback) on top of the
//     `Ma*` tables included in `prisma/schema.prisma`.
//   - `actionLoggingPlugin({ store: system.logStore })` redirects the
//     plugin from `ConsoleLogStore` to a persistent SQL row in `ma_log`.
//
// Resources are shared with `apps/api` via `@modern-admin/app-shared`:
// the same `CustomersAdminModule`, `PostsAdminModule`, … wire one set of
// `@AdminResource` controllers, and each host app provides its
// adapter-specific raw source through `registerAdminSource(...)`. For
// this app that wiring lives in `./admin-sources.ts`, which is imported
// for side effects below.

import { Module } from '@nestjs/common'
import { type BaseDatabase, type BaseResource, type IAuthProvider } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { ModernAdminAiFillModule } from '@modern-admin/feature-ai-fill/nest'
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'
import { historyPlugin } from '@modern-admin/feature-history'
import { actionLoggingPlugin } from '@modern-admin/feature-logging'
import {
  BullMqWebhookDispatcher,
  WEBHOOK_QUEUE,
  webhookPlugin,
  WebhookQueueModule,
} from '@modern-admin/feature-webhooks'
import { QueueModule } from '@modern-admin/queue'
import { setupPrismaSystem } from '@modern-admin/system-prisma'
import {
  AdminsAdminModule,
  buildAiAssistantConfig,
  buildApiKeyService,
  buildBetterAuthProvider,
  CategoriesAdminModule,
  CommentsAdminModule,
  CustomersAdminModule,
  PostsAdminModule,
  ProductsAdminModule,
  RegionalAdminModule,
  RolesAdminModule,
  TagsAdminModule,
} from '@modern-admin/app-shared'
import { Queue } from 'bullmq'
import { dmmf, prisma } from './db.js'
// Side-effect import: registers Prisma resources with the shared admin
// source registry before any `@AdminResource` decorator is evaluated.
import './admin-sources.js'

/** System stores shared across the app — backed by Postgres via Prisma. */
export const system = setupPrismaSystem(prisma as never)

const authProvider = buildBetterAuthProvider()
const apiKeyService = buildApiKeyService(authProvider)

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
      branding: { companyName: 'Modern Admin (prisma demo)' },
      // Enable role-based access control. Each admin's `MaUser.role`
      // string is resolved against `MaRole.permissions` and gates every
      // call to `invoke()`. Built-in roles `admin` (full) and `viewer`
      // (read-only) are seeded by `seed-demo.ts`.
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
    CustomersAdminModule,
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
