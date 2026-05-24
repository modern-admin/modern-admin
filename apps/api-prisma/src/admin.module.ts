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
//     `Ma*` tables included in `prisma/schema.prisma`. These stores back
//     the corresponding Pro feature plugins when the host app wires them in.
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
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'
import { historyPlugin } from '@modern-admin/feature-history'
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
  setAuditLogStore,
  TagsAdminModule,
} from '@modern-admin/app-shared'
import { dmmf, prisma } from './db.js'
// Side-effect import: registers Prisma resources with the shared admin
// source registry before any `@AdminResource` decorator is evaluated.
import './admin-sources.js'

/** System stores shared across the app — backed by Postgres via Prisma. */
export const system = setupPrismaSystem(prisma as never)

// Wire the audit-log sink used by Better Auth's `session.create.after`
// hook. Must run AFTER `setupPrismaSystem()` (which builds the store) and
// BEFORE any login attempt — admin-module construction is the natural
// place since it happens during Nest bootstrap, before the HTTP layer
// starts accepting requests.
setAuditLogStore(system.logStore)

const authProvider = buildBetterAuthProvider()
const apiKeyService = buildApiKeyService(authProvider)

@Module({
  imports: [
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
      ],
      configStore: system.configStore,
      aiTaskStore: system.aiTaskStore,
      historyStore: system.historyStore,
      logStore: system.logStore,
      webhookStore: system.webhookStore,
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
