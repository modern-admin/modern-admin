/**
 * Modern Admin wiring for {{name}}.
 *
 * Imports the framework into Nest, binds the Prisma adapter to our shared
 * client, wires Better Auth as the auth provider, and exposes Redis-backed
 * cache invalidation when `REDIS_URL` is set.
 */
import { Module } from '@nestjs/common'
import { type IAuthProvider } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { setupPrismaSystem } from '@modern-admin/system-prisma'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import { Redis } from 'ioredis'
import { dmmf, prisma } from './db.js'
import { auth, setAuditLogStore } from './auth.js'

// System stores (logs, history, config, sessions, cache fallback) backed
// by the `ma_*` tables in schema.prisma.
const system = setupPrismaSystem(prisma)

// Wire the audit-log sink used by Better Auth's `session.create.after`
// hook (see auth.ts). Doing it here — after `setupPrismaSystem()` builds
// the store — guarantees the hook resolves it on every login event.
setAuditLogStore(system.logStore)

const authProvider = new BetterAuthProvider({ auth }) satisfies IAuthProvider

// Redis is optional — when unset we use the in-process cache. Provide a
// REDIS_URL to enable cross-instance invalidation when scaling out.
//
// `RedisCacheProvider` takes a Redis-like client, not a URL. ioredis
// requires a *separate* subscriber connection for pub/sub (it won't
// multiplex pub/sub on a command connection), so we create two.
const cacheProvider = process.env.REDIS_URL
  ? new RedisCacheProvider({
      client:     new Redis(process.env.REDIS_URL),
      subscriber: new Redis(process.env.REDIS_URL),
    })
  : undefined

@Module({
  imports: [
    ModernAdminModule.forRoot({
      global: true,
      adapters: [{
        Database: PrismaDatabase,
        Resource: PrismaResource,
      }],
      databases: [{ client: prisma, dmmf }],
      branding: { companyName: '{{name}}' },
      // Resolve admin permissions against `ma_role` rows. Seed at least
      // one role (id = `'admin'`, permissions = `{ "*": ["*"] }`) before
      // the first login.
      rolesResourceId: 'roles',
      configStore: system.configStore,
      historyStore: system.historyStore,
      logStore: system.logStore,
      webhookStore: system.webhookStore,
      aiTaskStore: system.aiTaskStore,
      auth: authProvider,
      ...(cacheProvider ? { cache: cacheProvider } : {}),
    }),
  ],
})
export class AdminModule {}
