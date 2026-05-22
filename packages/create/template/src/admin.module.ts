/**
 * Modern Admin wiring for {{name}}.
 *
 * Imports the framework into Nest, binds the Prisma adapter to our shared
 * client, wires Better Auth as the auth provider, configures action
 * logging into `ma_log`, and exposes Redis-backed cache invalidation when
 * `REDIS_URL` is set.
 */
import { Module } from '@nestjs/common'
import { type BaseDatabase, type BaseResource, type IAuthProvider } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase, PrismaResource } from '@modern-admin/adapter-prisma'
import { setupPrismaSystem } from '@modern-admin/system-prisma'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { actionLoggingPlugin } from '@modern-admin/feature-logging'
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import { dmmf, prisma } from './db.js'
import { auth } from './auth.js'

// System stores (logs, history, config, sessions, cache fallback) backed
// by the `ma_*` tables in schema.prisma.
const system = setupPrismaSystem(prisma as never)

const authProvider = new BetterAuthProvider({ auth }) satisfies IAuthProvider

// Redis is optional — when unset we use the in-process cache. Provide a
// REDIS_URL to enable cross-instance invalidation when scaling out.
const cacheProvider = process.env.REDIS_URL
  ? new RedisCacheProvider({ url: process.env.REDIS_URL })
  : undefined

@Module({
  imports: [
    ModernAdminModule.forRoot({
      global: true,
      adapters: [{
        Database: PrismaDatabase as unknown as typeof BaseDatabase,
        Resource: PrismaResource as unknown as typeof BaseResource,
      }],
      databases: [{ client: prisma, dmmf }],
      branding: { companyName: '{{name}}' },
      // Resolve admin permissions against `ma_role` rows. Seed at least
      // one role (id = `'admin'`, permissions = `{ "*": ["*"] }`) before
      // the first login.
      rolesResourceId: 'roles',
      plugins: [
        actionLoggingPlugin({ store: system.logStore }),
      ],
      configStore: system.configStore,
      historyStore: system.historyStore,
      logStore: system.logStore,
      auth: authProvider,
      ...(cacheProvider ? { cache: cacheProvider } : {}),
    }),
  ],
})
export class AdminModule {}
