---
title: Backend
description: NestJS module architecture, AdminController pattern, decorators, DI, caching, and bootstrap sequence.
---

# Backend

`@modern-admin/nest` is the NestJS transport layer for Modern Admin. It converts NestJS
controllers into fully-typed admin resources, wires HTTP routes, guards, caching, and the
bootstrap sequence — all while keeping `@modern-admin/core` free of any NestJS dependency.

---

## Module registration

### `ModernAdminModule.forRoot(options)`

Register once at the root level. Accepts a `ModernAdminModuleOptions` object (see the
[full reference](#moduleoptions-reference) below) and makes the `ModernAdmin` instance
available application-wide via the `MODERN_ADMIN` injection token.

```ts
// app.module.ts
import { ModernAdminModule } from '@modern-admin/nest'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { RedisCache } from '@modern-admin/cache-redis'
import { RedisRealtimeBus } from '@modern-admin/realtime'

@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [drizzleDatabase],
      resources: [],           // resources from controllers are auto-discovered
      auth: new BetterAuthProvider(auth),
      cache: new RedisCache(redis),
      realtime: new RedisRealtimeBus(redis),
      plugins: [actionLoggingPlugin],
    }),
    UsersModule,
    PostsModule,
  ],
})
export class AppModule {}
```

### `ModernAdminModule.forFeature(controllers)`

Register resource controllers from a feature module without re-declaring the global
`ModernAdmin` instance. Uses standard NestJS `forwardRef`-safe DI.

```ts
// users.module.ts
@Module({
  imports: [ModernAdminModule.forFeature([UsersController])],
})
export class UsersModule {}
```

### `ModernAdminModule.forRootAsync(options)`

Async variant for when configuration values are only available after DI resolution
(e.g. pulling a Redis URL from `ConfigService`).

```ts
ModernAdminModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (cfg: ConfigService) => ({
    databases: [drizzleDatabase],
    auth: new BetterAuthProvider(auth),
    cache: new RedisCache(createRedis(cfg.get('REDIS_URL'))),
  }),
  inject: [ConfigService],
})
```

---

## `AdminController<TRow>` — the resource base class

Every admin resource is a NestJS controller that **extends `AdminController<TRow>`**.
The generic parameter `TRow` is the plain object type of a single record (e.g. the Prisma
or Drizzle model type). The base class exposes seven typed methods that map to the seven
built-in admin actions:

```ts
import { AdminController, AdminResource, ListContext, ShowContext,
         EditContext, DeleteContext, BulkDeleteContext } from '@modern-admin/nest'
import { DrizzleResource } from '@modern-admin/adapter-drizzle'
import { users } from '../db/schema'

@AdminResource({
  source: () => new DrizzleResource(db, users),
  label: 'Users',
  icon: 'Users',
})
export class UsersController extends AdminController<typeof users.$inferSelect> {

  // Override any built-in method to customise its behaviour:
  override async list(ctx: ListContext<typeof users.$inferSelect>) {
    // add custom filters, sorting, etc.
    return super.list(ctx)
  }

  override async show(ctx: ShowContext<typeof users.$inferSelect>) {
    return super.show(ctx)
  }

  // new / edit / delete / bulkDelete / search work the same way
}
```

Methods you do **not** override fall through to the built-in core handler automatically.
You never need to implement all seven.

### Typed context aliases

| Alias | Extra field(s) |
|---|---|
| `ListContext<TRow>` | — |
| `ShowContext<TRow>` | `record: BaseRecord<TRow>` |
| `NewContext<TRow>` | — |
| `EditContext<TRow>` | `record: BaseRecord<TRow>` |
| `DeleteContext<TRow>` | `record: BaseRecord<TRow>` |
| `BulkDeleteContext<TRow>` | `records: BaseRecord<TRow>[]` |
| `SearchContext<TRow>` | — |

All are specialisations of the generic `AdminActionContext<TRow, TPayload, TQuery>`:

```ts
interface AdminActionContext<TRow, TPayload = unknown, TQuery = unknown> {
  admin: ModernAdmin           // the orchestrator
  resource: BaseResource       // the resolved resource
  record?: BaseRecord<TRow>    // for record-scoped actions
  records?: BaseRecord<TRow>[] // for bulk actions
  currentAdmin?: Admin         // the authenticated admin (if any)
  payload: TPayload            // parsed request body
  query: TQuery                // parsed query string
  params: Record<string, string>
  cache: ICacheProvider
  request: Request             // raw NestJS request
  core: AdminActionParams      // raw params passed to invoke()
}
```

---

## Decorators

### `@AdminResource(meta)`

Applied to a controller class. Internally calls `@Controller()` and `@Injectable()` and
stores resource metadata in `reflect-metadata` under the `ADMIN_RESOURCE_META` symbol.

```ts
import { AdminResource } from '@modern-admin/nest'

@AdminResource({
  source: () => new DrizzleResource(db, posts),
  label: 'Posts',
  icon: 'FileText',
  navigation: { section: 'Content', order: 1 },
  features: [uploadFeature({ ... })],
})
export class PostsController extends AdminController<Post> {}
```

`meta` extends `ResourceOptions` (from `@modern-admin/core`) with three extra fields:

| Field | Type | Description |
|---|---|---|
| `source` | `() => BaseResource` | Factory for the underlying ORM resource |
| `features` | `FeatureFn[]` | Local feature plugins applied before global plugins |
| `relatedResources` | `BaseResource[]` | Extra resources needed by this controller (e.g. junction tables for M2M) |

### `@Action(options)`

Registers a custom action on the controller. The method receives
`AdminActionContext` and must return an `ActionResponse`.

```ts
import { Action } from '@modern-admin/nest'

@Action({
  name: 'approve',
  actionType: 'record',
  label: 'Approve',
  icon: 'CheckCircle',
  guard: (ctx) => ctx.currentAdmin?.role === 'superAdmin',
})
async approve(ctx: ShowContext<Post>) {
  await db.update(posts).set({ status: 'approved' }).where(eq(posts.id, ctx.record!.id()))
  return { notice: { message: 'Post approved', type: 'success' } }
}
```

Action metadata is stored under `ADMIN_ACTIONS_META` and read by the scanner at bootstrap.

### `@Before(actionName)` / `@After(actionName)`

Register before/after hooks for any action (built-in or custom).

```ts
import { Before, After } from '@modern-admin/nest'

@Before('edit')
async hashPasswordBefore(ctx: EditContext<User>) {
  if (ctx.payload.password) {
    ctx.payload.password = await bcrypt.hash(ctx.payload.password, 10)
  }
  return ctx
}

@After('delete')
async cleanupFiles(ctx: DeleteContext<User>) {
  await storage.delete(ctx.record!.get('avatarKey'))
  return ctx
}
```

A single method can be a hook for multiple actions by stacking decorators:

```ts
@Before('new')
@Before('edit')
async normalizeEmail(ctx: NewContext<User> | EditContext<User>) {
  if (ctx.payload.email) ctx.payload.email = ctx.payload.email.toLowerCase()
  return ctx
}
```

---

## Bootstrap sequence

The module performs resource registration in three ordered phases:

```
1. Module init (standard NestJS)
   ModernAdminModule.forRoot() → creates ModernAdmin instance, registers DI tokens
   Feature modules → AdminControllerScanner is available via DI

2. onApplicationBootstrap() — ModernAdminBootstrapService
   a. AdminControllerScanner.scan()
      ↳ DiscoveryService iterates all providers + controllers
      ↳ Reads ADMIN_RESOURCE_META from each decorated class
      ↳ Reads ADMIN_ACTIONS_META → wraps custom action methods as core handlers
      ↳ Reads ADMIN_HOOKS_META → registers before/after hooks
      ↳ Detects which of the 7 built-in methods are overridden on the subclass
      ↳ Returns ResourcePair[] (resource + options)
   b. admin.registerResources(pairs)
      ↳ Merges FeatureFns → GlobalPlugins → user ResourceOptions
      ↳ Stores in admin.resources map
   c. Wires controller.admin + controller.resource references
      so that AdminController methods have typed access to both
```

This sequencing guarantees all NestJS modules and their providers are fully initialised
before any resource is registered, so factories like `source: () => new DrizzleResource(db, table)`
run against a connected database client.

---

## Scanner internals

`AdminControllerScanner` uses NestJS `DiscoveryService` and `MetadataScanner`:

```
DiscoveryService.getProviders()
  → filter by hasMetadata(ADMIN_RESOURCE_META)
  → for each provider:
      read AdminResourceMeta
      find overridden built-in methods (list/show/new/edit/delete/bulkDelete/search)
      read @Action methods → wrap with wrapHandler() (preserves DI instance binding)
      read @Before/@After methods → map to hook definitions
      build ResourceOptions with actions + hooks
      return ResourcePair { resource, options }
```

`wrapHandler()` captures the bound DI instance so that `this` inside action methods
correctly resolves all `@Inject()`-ed services:

```ts
// Conceptually:
function wrapHandler(instance: object, method: Function): ActionHandler {
  return async (context) => method.call(instance, context)
}
```

---

## Cache interceptor

`ModernAdminCacheInterceptor` is an `NestInterceptor` applied globally to all admin
GET routes.

**Strategy:**

- Only GET requests are cached.
- Cache key: `nest:GET:<originalUrl>` (full URL including query string).
- Cache tag: `resource:<resourceId>` (extracted from the URL path segment).
- TTL: 30 seconds.
- On cache hit the response is returned immediately; `next.handle()` is never called.
- On any mutating request (POST/PATCH/DELETE) to a resource, the `ICacheProvider`
  invalidates all entries tagged with `resource:<id>`.

```
GET /admin/api/resources/users/actions/list?page=1
→ key: "nest:GET:/admin/api/resources/users/actions/list?page=1"
→ tag: "resource:users"
→ TTL: 30s

POST /admin/api/resources/users/records/42/actions/edit
→ cache.invalidateTag("resource:users")
→ all GET cache entries for the users resource are evicted
```

---

## Auth guard

`ModernAdminAuthGuard` implements NestJS `CanActivate`. It delegates to the
`IAuthProvider` port registered in `ModernAdminModuleOptions.auth`:

```
IAuthProvider.getCurrentUser(request) → Admin | null
```

If the provider returns `null` and the route requires authentication, the guard throws
`UnauthorizedException`. Public routes (login, `ui-props`, `config`) are excluded via
the `@Public()` decorator.

The default provider is `AnonymousAuthProvider` — it always returns a synthetic admin
object with the `superAdmin` role, making the API fully open. Replace it with
`BetterAuthProvider` (or any custom `IAuthProvider` implementation) to enforce auth.

---

## `ModernAdminModuleOptions` reference

| Field | Type | Default | Description |
|---|---|---|---|
| `databases` | `BaseDatabase[]` | **required** | ORM database adapters (Drizzle / Prisma) |
| `resources` | `ResourceWithOptions[]` | `[]` | Statically declared resources (alternative to controller-based) |
| `plugins` | `GlobalPlugin[]` | `[]` | Global plugins applied to all resources |
| `auth` | `IAuthProvider` | `AnonymousAuthProvider` | Authentication provider |
| `cache` | `ICacheProvider` | `NoopCacheProvider` | Cache provider |
| `realtime` | `IRealtimeBus` | `NoopRealtimeBus` | Realtime event bus |
| `configStore` | `IConfigStore` | in-memory | Key-value store for `MaConfig` system table |
| `historyStore` | `IHistoryStore` | no-op | Record history (requires `@modern-admin/feature-history`) |
| `logStore` | `ILogStore` | no-op | Audit log store |
| `webhookStore` | `IWebhookStore` | no-op | Webhook registry store |
| `webhookDispatcher` | `IWebhookDispatcher` | no-op | Webhook delivery engine |
| `apiKeyService` | `IApiKeyService` | no-op | API key validation |
| `aiAssistant` | `IAiAssistantConfig` | disabled | AI assistant configuration |
| `aiTaskStore` | `IAiTaskStore` | in-memory | AI task persistence |
| `timeseriesSqlRoles` | `string[]` | `['superAdmin']` | Roles allowed to run timeseries queries |
| `historyRoles` | `string[]` | `['superAdmin']` | Roles allowed to access history |
| `auditLogRoles` | `string[]` | `['superAdmin']` | Roles allowed to view audit log |
| `webhookRoles` | `string[]` | `['superAdmin']` | Roles allowed to manage webhooks |
| `global` | `boolean` | `false` | Make the `MODERN_ADMIN` token globally available |

---

## DI tokens

`@modern-admin/nest` exports a set of injection tokens for use in your own services:

```ts
import {
  MODERN_ADMIN,         // ModernAdmin orchestrator
  MODERN_ADMIN_OPTIONS, // ModernAdminModuleOptions
  MODERN_ADMIN_AUTH,    // IAuthProvider
  MODERN_ADMIN_CACHE,   // ICacheProvider
  MODERN_ADMIN_REALTIME,// IRealtimeBus
} from '@modern-admin/nest'
```

Inject in any NestJS service:

```ts
@Injectable()
export class MyService {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_AUTH) private readonly auth: IAuthProvider,
  ) {}
}
```

---

## Complete wiring example

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import { RedisCache } from '@modern-admin/cache-redis'
import { RedisRealtimeBus } from '@modern-admin/realtime'
import { actionLoggingPlugin } from '@modern-admin-pro/feature-logging'
import { drizzleDatabase } from './db'
import { auth } from './auth'
import { redis } from './redis'
import { UsersModule } from './users/users.module'
import { PostsModule } from './posts/posts.module'

@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [drizzleDatabase],
      auth: new BetterAuthProvider(auth),
      cache: new RedisCache(redis),
      realtime: new RedisRealtimeBus(redis),
      plugins: [actionLoggingPlugin],
      logStore: drizzleLogStore,
      webhookStore: drizzleWebhookStore,
      webhookDispatcher: httpWebhookDispatcher,
      historyStore: drizzleHistoryStore,
    }),
    UsersModule,
    PostsModule,
  ],
})
export class AppModule {}
```

```ts
// users/users.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { UsersController } from './users.controller'

@Module({
  imports: [ModernAdminModule.forFeature([UsersController])],
  providers: [UsersController],
})
export class UsersModule {}
```

```ts
// users/users.controller.ts
import { Inject } from '@nestjs/common'
import {
  AdminController, AdminResource, Action, Before, After,
  EditContext, ShowContext,
} from '@modern-admin/nest'
import { DrizzleResource } from '@modern-admin/adapter-drizzle'
import { uploadFeature } from '@modern-admin/feature-upload'
import { db } from '../db'
import { users } from '../db/schema'
import type { User } from '../db/schema'

@AdminResource({
  source: () => new DrizzleResource(db, users),
  label: 'Users',
  icon: 'Users',
  navigation: { section: 'Access', order: 1 },
  features: [
    uploadFeature({
      properties: { avatar: { provider: localProvider } },
    }),
  ],
  properties: {
    password: { type: 'password' },
    role: { type: 'select', availableValues: [
      { value: 'user', label: 'User' },
      { value: 'admin', label: 'Admin' },
    ]},
  },
})
export class UsersController extends AdminController<User> {

  constructor(
    @Inject(MailService) private readonly mail: MailService,
  ) {
    super()
  }

  @Before('new')
  @Before('edit')
  async hashPassword(ctx: EditContext<User>) {
    if (ctx.payload.password) {
      ctx.payload.password = await bcrypt.hash(ctx.payload.password, 10)
    }
    return ctx
  }

  @Action({
    name: 'sendWelcome',
    actionType: 'record',
    label: 'Send welcome email',
    icon: 'Mail',
    guard: (ctx) => ctx.currentAdmin?.role === 'superAdmin',
  })
  async sendWelcome(ctx: ShowContext<User>) {
    await this.mail.send({
      to: ctx.record!.get('email'),
      subject: 'Welcome!',
    })
    return { notice: { message: 'Email sent', type: 'success' } }
  }

  @After('delete')
  async cleanupAvatar(ctx: ShowContext<User>) {
    const key = ctx.record!.get('avatarKey')
    if (key) await storage.delete(key)
    return ctx
  }
}
```

---

## Patterns summary

| Pattern | Where | Purpose |
|---|---|---|
| `AdminController<TRow>` base class | Controller | Typed method overrides for 7 built-in actions |
| `@AdminResource(meta)` | Controller class | Declares resource metadata, auto-discovered at bootstrap |
| `@Action(opts)` | Controller method | Custom action registered as a core handler |
| `@Before(name)` / `@After(name)` | Controller method | Action lifecycle hooks |
| `wrapHandler()` | Scanner internals | Preserves `this` binding so injected services work |
| `ModernAdminBootstrapService` | Framework | Deferred registration after full DI init |
| `AdminControllerScanner` | Framework | NestJS `DiscoveryService`-based metadata reader |
| `ModernAdminCacheInterceptor` | Framework | GET-only cache with tag-based invalidation |
| `ModernAdminAuthGuard` | Framework | `IAuthProvider` delegation, `@Public()` escape hatch |
| `forFeature([...])` | Module | Feature-module-scoped controller registration |
| `forRootAsync({ useFactory })` | Module | Async configuration via `ConfigService` or other providers |
