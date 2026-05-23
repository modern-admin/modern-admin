// Reference wiring of @modern-admin/nest. Demonstrates how a host app
// composes adapter, auth provider, and cache provider into a single Nest
// module that exposes /admin/api/*.
//
// Resources are split across per-feature modules under ./admin/* so a real
// host app can scale to many resources by just adding new feature modules
// — `forRoot()` declares only adapters/auth/cache, and each
// `forFeature()` plugs its own resource(s) into the running ModernAdmin.

import { Module } from '@nestjs/common'
import { InMemoryRealtimeBus, createMemorySystem, type BaseDatabase, type BaseResource, type ICacheProvider, type IAuthProvider, type IRealtimeBus } from '@modern-admin/core'
import { ModernAdminModule } from '@modern-admin/nest'
import { ModernAdminGraphqlModule } from '@modern-admin/graphql'
import { ModernAdminRealtimeModule, RedisRealtimeBus } from '@modern-admin/realtime'
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import { ModernAdminAiFillModule } from '@modern-admin/feature-ai-fill/nest'
import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'
import { uploadGraphqlExtension } from '@modern-admin/feature-upload/graphql'
import { historyPlugin } from '@modern-admin/feature-history'
import { actionLoggingPlugin } from '@modern-admin/feature-logging'
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
import { Redis } from 'ioredis'
// Side-effect import: registers InMemory tables with the shared admin
// source registry before any `@AdminResource` decorator is evaluated.
import './admin-sources.js'
import { InMemoryDatabase, InMemoryResource } from './demo/in-memory-adapter.js'

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
const system = createMemorySystem()

// `auth.ts` publishes the Better Auth instance onto globalThis as an
// import-time side-effect; the helpers below pick it up here. Set
// `BETTER_AUTH_ENABLED=false` to bypass (e.g. when running without a
// writable session DB).
const authProvider = buildBetterAuthProvider()
const apiKeyService = buildApiKeyService(authProvider)

@Module({
  imports: [
    ModernAdminAiFillModule.forRoot(),
    ModernAdminUploadModule.forRoot(),
    ModernAdminModule.forRoot({
      global: true,
      adapters: [{
        Database: InMemoryDatabase as unknown as typeof BaseDatabase,
        Resource: InMemoryResource as unknown as typeof BaseResource,
      }],
      branding: { companyName: 'Modern Admin (demo)' },
      // Enable role-based access control. Demo `roles` table seeds
      // `admin`/`viewer`/`editor` and admins reference roles by name.
      // Note: this in-memory `admins` table is a UI-only demo; real
      // login still flows through Better Auth (bun:sqlite ma_user).
      rolesResourceId: 'roles',
      realtime: realtimeBus,
      configStore: system.configStore,
      aiTaskStore: system.aiTaskStore,
      historyStore: system.historyStore,
      logStore: system.logStore,
      webhookStore: system.webhookStore,
      plugins: [
        historyPlugin({ store: system.historyStore }),
        actionLoggingPlugin({ store: system.logStore }),
      ],
      aiAssistant: buildAiAssistantConfig(),
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
export class AdminModule {}
