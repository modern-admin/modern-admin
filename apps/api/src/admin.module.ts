// Reference wiring of @modern-admin/nest. Demonstrates how a host app
// composes adapter, auth provider, and cache provider into a single Nest
// module that exposes /admin/api/*.

import { Module } from '@nestjs/common'
import { InMemoryRealtimeBus, type BaseDatabase, type BaseResource, type ICacheProvider, type IAuthProvider, type IRealtimeBus } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { ModernAdminGraphqlModule } from '@modern-admin/graphql'
import { ModernAdminRealtimeModule, RedisRealtimeBus } from '@modern-admin/realtime'
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { Redis } from 'ioredis'
import { InMemoryDatabase, InMemoryResource } from './demo/in-memory-adapter.js'
import { seed } from './demo/seed.js'

const buildCache = (): ICacheProvider | undefined => {
  const url = process.env.REDIS_URL
  if (!url) return undefined
  const client = new Redis(url, { lazyConnect: true })
  client.connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[modern-admin/api] redis connect failed; falling back to noop cache', err)
  })
  // ioredis' overloads are wider than the structural RedisLike contract; cast
  // to the surface ICacheProvider actually exercises.
  return new RedisCacheProvider({ client: client as never })
}

const buildRealtime = (): IRealtimeBus => {
  const url = process.env.REDIS_URL
  if (!url) return new InMemoryRealtimeBus()
  const client = new Redis(url, { lazyConnect: true })
  client.connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[modern-admin/api] redis connect failed; falling back to in-memory bus', err)
  })
  return new RedisRealtimeBus({ client: client as never })
}

const realtimeBus = buildRealtime()

const buildAuth = (): IAuthProvider | undefined => {
  // The host app instantiates Better Auth and passes it in. We only wire the
  // adapter when the env explicitly opts in so the dev experience stays
  // friction-free without OAuth/SMTP configuration.
  if (process.env.BETTER_AUTH_ENABLED !== 'true') return undefined
  const auth = (globalThis as { __betterAuth?: unknown }).__betterAuth
  if (!auth) return undefined
  return new BetterAuthProvider({ auth: auth as never })
}

@Module({
  imports: [
    ModernAdminModule.forRoot({
      global: true,
      databases: [seed()],
      adapters: [{
        Database: InMemoryDatabase as unknown as typeof BaseDatabase,
        Resource: InMemoryResource as unknown as typeof BaseResource,
      }],
      branding: { companyName: 'Modern Admin (demo)' },
      realtime: realtimeBus,
      ...(buildCache() ? { cache: buildCache()! } : {}),
      ...(buildAuth() ? { auth: buildAuth()! } : {}),
    }),
    ModernAdminGraphqlModule.forRoot(),
    ModernAdminRealtimeModule.forRoot({ bus: realtimeBus }),
  ],
})
export class AdminModule {}
