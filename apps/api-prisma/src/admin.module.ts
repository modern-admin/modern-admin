// Reference wiring of @modern-admin/nest with a real Prisma 7 + Postgres
// host database.
//
// Highlights:
//
//   - The Prisma adapter is bound to the *same* PrismaClient that powers
//     Better Auth — one connection pool, one migration history.
//   - `setupPrismaSystem(prisma)` builds the system stores (action log,
//     webhooks, config, history, AI tasks, cache fallback) on top of the
//     `Ma*` tables included in `prisma/schema.prisma`. These stores back
//     the corresponding Pro feature plugins when the host app wires them in.
//
// Resources are sourced from the shared `@modern-admin/app-shared`
// package: the same `CustomersAdminModule`, `PostsAdminModule`, … wire
// one set of `@AdminResource` controllers, and this host provides its
// Prisma-backed raw source through `registerAdminSource(...)`. The
// wiring lives in `./admin-sources.ts`, which is imported for side
// effects below.

import { Module } from '@nestjs/common'
import {
  InMemoryRealtimeBus,
  MemoryCacheProvider,
  type IAuthProvider,
  type ICacheProvider,
  type IRealtimeBus,
} from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { ModernAdminGraphqlModule } from '@modern-admin/graphql'
import { ModernAdminRealtimeModule, RedisRealtimeBus, type RealtimeRedisLike } from '@modern-admin/realtime'
import { RedisCacheProvider, type RedisCacheOptions } from '@modern-admin/cache-redis'
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'
import { uploadGraphqlExtension } from '@modern-admin/feature-upload/graphql'
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
import { Redis } from 'ioredis'
import { dmmf, prisma } from './db.js'
// Side-effect import: registers Prisma resources with the shared admin
// source registry before any `@AdminResource` decorator is evaluated.
import './admin-sources.js'

const buildCache = (): ICacheProvider | undefined => {
  // `CACHE_BACKEND=memory` opts into the in-process MemoryCacheProvider.
  // Used by the Playwright e2e suite so cache behaviour is observable
  // without standing up Redis. Production deployments should leave this
  // unset and provide `REDIS_URL` instead.
  if (process.env.CACHE_BACKEND === 'memory') return new MemoryCacheProvider()
  const url = process.env.REDIS_URL
  if (!url) return undefined
  const client = new Redis(url, { lazyConnect: true })
  client.connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[modern-admin/api-prisma] redis connect failed; falling back to noop cache', err)
  })
  return new RedisCacheProvider({ client: client as unknown as RedisCacheOptions['client'] })
}

const buildRealtime = (): IRealtimeBus => {
  const url = process.env.REDIS_URL
  if (!url) return new InMemoryRealtimeBus()
  const client = new Redis(url, { lazyConnect: true })
  client.connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[modern-admin/api-prisma] redis connect failed; falling back to in-memory bus', err)
  })
  return new RedisRealtimeBus({ client: client as unknown as RealtimeRedisLike })
}

const realtimeBus = buildRealtime()

/** System stores shared across the app — backed by Postgres via Prisma. */
export const system = setupPrismaSystem(prisma)

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
        Database: PrismaDatabase,
        Resource: PrismaResource,
      }],
      databases: [{ client: prisma, dmmf: dmmf }],
      branding: { companyName: 'Modern Admin (prisma demo)' },
      // Enable role-based access control. Each admin's `MaUser.role`
      // string is resolved against `MaRole.permissions` and gates every
      // call to `invoke()`. Built-in roles `admin` (full) and `viewer`
      // (read-only) are seeded by `seed-demo.ts`.
      rolesResourceId: 'roles',
      realtime: realtimeBus,
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
      ...(buildCache() ? { cache: buildCache()! } : {}),
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
    ModernAdminGraphqlModule.forRoot({
      extensions: [uploadGraphqlExtension()],
    }),
    ModernAdminRealtimeModule.forRoot({ bus: realtimeBus }),
  ],
})
export class AdminModule {
}
