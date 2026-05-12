---
title: Architecture
description: Package layout, core abstractions, the invoke() pipeline, ports, and the plugin system.
---

# Architecture

Modern Admin is a **framework**, not an opinionated app. It defines abstractions and
pipelines; you plug in your ORM, auth provider, cache backend, and frontend — or use
the bundled defaults. Everything converges on a single orchestrator: `ModernAdmin`.

---

## Package layout

```
apps/
  web/            — reference Vite + React frontend
  api/            — reference NestJS backend (Drizzle)
  api-prisma/     — reference NestJS backend (Prisma)
  e2e/            — Playwright end-to-end tests
  docs/           — Nextra 4 documentation site (this site)

packages/
  core/           — abstractions: BaseResource, decorators, actions, ports
  nest/           — NestJS dynamic module, REST controllers, guards, interceptors
  graphql/        — code-first GraphQL schema + Apollo wiring
  react/          — React provider, hooks, default <AdminApp />
  ui/             — shadcn/ui primitives + design tokens
  i18n/           — translation registry + 9 locales
  adapter-prisma/ — Prisma 7 adapter
  adapter-drizzle/— Drizzle 0.45 adapter
  auth-better-auth/ — Better Auth IAuthProvider implementation
  cache-redis/    — Redis-backed ICacheProvider
  queue/          — BullMQ queue + cron scheduling
  feature-upload/ — file upload FeatureFn plugin
  feature-m2m/    — many-to-many junction FeatureFn plugin
  feature-history/— record revision history FeatureFn plugin
  feature-password/ — bcrypt password hashing FeatureFn plugin
  feature-logging/  — action logging FeatureFn plugin
  feature-webhooks/ — outbound webhook FeatureFn plugin
  system-prisma/  — Prisma-backed system subsystem ports
  system-drizzle/ — Drizzle-backed system subsystem ports
  tsconfig/       — shared TypeScript presets
  create-modern-admin/ — project scaffolder CLI
```

The cardinal rule: **`packages/core` knows nothing about specific ORMs, transports,
or UI libraries.** It defines abstract classes and ports; adapters, transports, and
feature plugins plug into them from the outside.

---

## ModernAdmin — the orchestrator

`ModernAdmin` is the single top-level object every transport reads from. It holds
references to all registered resources, the active auth/cache/realtime ports, and
exposes `invoke()` as the universal request handler.

```ts
import { ModernAdmin } from '@modern-admin/core'

const admin = new ModernAdmin({
  databases: [{ client: db, schema }],          // ORM configs
  adapters:  [{ Database: DrizzleDatabase, Resource: DrizzleResource }],
  resources: [],                                 // explicit per-resource overrides
  plugins:   [],                                 // cross-cutting global plugins
  auth:      new BetterAuthProvider({ auth }),   // IAuthProvider
  cache:     new RedisCacheProvider({ client }), // ICacheProvider
  realtime:  new RedisRealtimeBus({ pub, sub }), // IRealtimeBus
  rootPath:  '/admin',
  rolesResourceId: 'roles',                      // RBAC lookup table
  branding: { companyName: 'Acme Corp' },
})
```

At construction time `ModernAdmin` calls `ResourcesFactory.buildResources()`, which
resolves the adapter for each database, builds `BaseResource` instances, and attaches
`ResourceDecorator` instances (with merged options from features → plugins → user).

After construction, transports can add more resources via `registerResources()` —
the NestJS module uses this to collect resources contributed by `forFeature()` modules.

---

## ResourcesFactory and decoration pipeline

`ResourcesFactory.buildResources()` is the assembly line that turns raw ORM configs
and resource class references into decorated `BaseResource` instances:

```
databases (raw ORM config)   resources (BaseResource instances or raw class refs)
        │                               │
  isAdapterFor(config)           isAdapterFor(target)
        │                               │
  new Database(config)           new Resource(target)
        │                               │
  database.resources()               (direct)
        │                               │
        └───────────────┬───────────────┘
                        ▼
           [{ resource, options, features }]
                        │
                        ▼
              features.reduce(feature(opts), {})
                 ↓  local FeatureFn pipeline
              plugins.reduce(plugin.apply(opts, res), fromFeatures)
                 ↓  global GlobalPlugin pipeline
              deepMerge(fromPlugins, options)
                 ↓  user options win
              new ResourceDecorator(resource, merged)
              resource.assignDecorator(decorator)
                        │
                        ▼
                 BaseResource[]   (all decorated)
```

### Priority order (later wins)

1. **Adapter defaults** — schema introspection (field types, required, sortable)
2. **Local FeatureFns** — per-resource transformations (`uploadFeature`, `m2mFeature`)
3. **Global plugins** — cross-cutting transforms (`actionLoggingPlugin`)
4. **User-provided `ResourceOptions`** — explicit overrides always win

For naming, authoring patterns, and Nest wiring in more detail, see
[Features & plugins](./features-and-plugins).

---

## BaseResource — the adapter contract

Every ORM adapter extends `BaseResource`. The required surface is small:

```ts
abstract class BaseResource {
  abstract id(): string                                       // resource identifier
  abstract databaseType(): string                            // 'prisma' | 'drizzle' | …
  abstract properties(): BaseProperty[]                      // schema metadata

  abstract count(filter: Filter): Promise<number>
  abstract find(filter: Filter, opts: FindOptions): Promise<BaseRecord[]>
  abstract findOne(id: string): Promise<BaseRecord | null>
  abstract findMany(ids: string[]): Promise<BaseRecord[]>
  abstract create(params: ParamsType): Promise<ParamsType>
  abstract update(id: string, params: ParamsType): Promise<ParamsType>
  abstract delete(id: string): Promise<void>

  // Optional extensions
  streamFind?(filter: Filter, opts: StreamOptions): AsyncIterable<BaseRecord>
  aggregate?(req: AggregationRequest, filter: Filter): Promise<AggregationResult[]>
  aggregateTimeSeries?(q: TimeSeriesQuery): Promise<TimeSeriesResult>
  transaction?<T>(fn: () => Promise<T>): Promise<T>
  supportsTimeSeries?(): boolean
}
```

Adapters also implement a static method:

```ts
static isAdapterFor(dbConfig: unknown): boolean
```

`ResourcesFactory` calls this to match each database config to the right adapter —
the Prisma adapter accepts configs with a `dmmf` field; Drizzle accepts configs with
a `schema` field.

### BaseRecord

Adapter CRUD methods return `BaseRecord` instances (or `new BaseRecord(row, resource)`
directly):

```ts
class BaseRecord {
  constructor(params: ParamsType, resource: BaseResource)

  id(): string            // value of the primary key property
  title(): string         // human-readable label (first non-id string property)
  param(path: string): unknown
  isValid(): boolean
  toJSON(): RecordJSON    // wire-safe serialisable snapshot
}
```

`params` is always **flat**: nested objects are dotted (`'address.street': 'Main St'`).
Flatten/unflatten happens at adapter boundaries so the rest of the framework never
sees nested objects in record params.

### BaseProperty

Schema metadata for a single field:

```ts
abstract class BaseProperty {
  abstract path(): string
  abstract type(): PropertyType
  abstract isId(): boolean
  abstract isEditable(): boolean
  abstract isVisible(): boolean
  abstract isRequired(): boolean
  abstract isSortable(): boolean
  abstract isArray(): boolean
  abstract reference(): string | null        // resource id of FK target
  abstract availableValues(): string[] | null // enum values
  abstract position(): number
}
```

### PropertyType reference

| Type | UI treatment |
|---|---|
| `'string'` | Text input |
| `'number'` | Number input |
| `'float'` | Number input with decimal |
| `'boolean'` | Checkbox / switch |
| `'date'` | Date picker (date-only mode) |
| `'datetime'` | Date picker (date + time mode) |
| `'json'` / `'mixed'` | JSON editor |
| `'key-value'` | KeyValueEditor (fixed schema) |
| `'enum'` | Select from `availableValues` |
| `'reference'` | Combobox that searches a related resource |
| `'uuid'` | Monospace display; auto-generated on create |
| `'richtext'` | Rich-text editor (ProseMirror) |
| `'textarea'` | Plain multi-line text |
| `'password'` | Password input with show/hide |
| `'currency'` | Number with currency formatting |
| `'phone'` | Phone number input |
| `'markdown'` | Markdown editor |
| `'file'` | File upload (`@modern-admin/feature-upload`) |
| `'m2m'` | Many-to-many picker (`@modern-admin/feature-m2m`) |
| `'previewMedia'` | Read-only media preview |

---

## Decorators

Decorators sit between the raw adapter and the transport layer. They merge user
options on top of adapter defaults without mutating the underlying resource.

### ResourceDecorator

```ts
class ResourceDecorator {
  constructor(resource: BaseResource, options: ResourceOptions)

  id: string                          // options.id ?? resource.id()
  properties(): PropertyDecorator[]   // merged + virtual properties
  propertiesForView(view): PropertyDecorator[]  // filtered by visibility
  getAction(name: string): ActionDecorator | undefined
  actions(): ActionDecorator[]

  toJSON(): ResourceJSON              // wire-safe config snapshot for the browser
}
```

`ResourceDecorator` builds its property list by:
1. Taking `resource.properties()` (from the adapter)
2. Applying `options.properties` overrides per path
3. Adding virtual (synthetic) properties from `options.properties` that have no
   matching adapter property — used by `uploadFeature`, `m2mFeature`, etc.
4. Sorting by `position`

### PropertyDecorator

Wraps one `BaseProperty` with user `PropertyOptions`. Every getter
prefers the option value when set, falling back to the adapter value:

```ts
// User can override type, label, visibility, position, reference,
// availableValues, isRequired, isSortable, isArray, isDisabled…
class PropertyDecorator {
  label(): string              // options.label ?? humanize(path)
  type(): PropertyType         // options.type ?? property.type()
  isVisibleIn(view): boolean   // per-view resolution: list/show/edit/filter
  toJSON(): PropertyJSON       // serialised for the browser
}
```

### ActionDecorator

Wraps a built-in or custom action definition with merged options. Resolves
dynamic flags (`isVisible`, `isAccessible`) at request time:

```ts
class ActionDecorator {
  name(): string
  actionType(): ActionType         // 'resource' | 'record' | 'bulk'
  isAccessible(ctx): Promise<boolean>
  isVisible(ctx): Promise<boolean>
  toDescriptor(): ActionDescriptor // wire-safe for the browser
}
```

---

## Action system

### Built-in actions

Seven actions ship with the framework. They cover the full CRUD cycle plus search:

| Name | Type | HTTP method | Description |
|------|------|-------------|-------------|
| `list` | `resource` | GET | Paginated + filtered list |
| `show` | `record` | GET | Single record detail |
| `new` | `resource` | GET + POST | Empty form / create |
| `edit` | `record` | GET + PATCH | Populated form / update |
| `delete` | `record` | DELETE | Single record delete |
| `bulkDelete` | `bulk` | POST | Multiple record delete |
| `search` | `resource` | GET | Combobox autocomplete |

### Action types

| `ActionType` | `request.params` | `context` |
|---|---|---|
| `'resource'` | `resourceId` | no record/records |
| `'record'` | `resourceId`, `recordId` | `context.record` pre-fetched |
| `'bulk'` | `resourceId`, `recordIds` (comma-separated) | `context.records` pre-fetched |

### Action definition shape

```ts
interface Action<R extends ActionResponse = ActionResponse> {
  name: string                             // unique within the resource
  actionType: ActionType
  handler: (request, context) => R | Promise<R>

  // Lifecycle hooks — arrays are executed in order
  before?: Before | Before[]               // mutate request before handler
  after?: After<R> | After<R>[]            // mutate response after handler

  // Visibility / access
  isVisible?: boolean | ((ctx) => boolean | Promise<boolean>)
  isAccessible?: boolean | ((ctx) => boolean | Promise<boolean>)

  // UI hints
  nesting?: ActionNesting                  // group label / icon
  guard?: string                           // confirmation dialog key
  component?: string | null               // custom UI component name
  custom?: Record<string, unknown>         // free-form UI payload
}
```

### Hook types

```ts
type Before = (request: ActionRequest, context: ActionContext)
  => ActionRequest | Promise<ActionRequest>

type After<R extends ActionResponse> = (response: R, request: ActionRequest, context: ActionContext)
  => R | Promise<R>
```

Hooks are composable: `uploadFeature`, `m2mFeature`, and global plugins **append**
to existing hook arrays rather than replacing them, so multiple features coexist
cleanly.

---

## The invoke() pipeline

Every request — REST, GraphQL, WebSocket, or programmatic — goes through
`ModernAdmin.invoke()`. This single funnel ensures all transports share identical
semantics:

```
ActionRequest
   { params: { resourceId, action, recordId? }, payload, query, method }
       │
       ▼
1. findResource(resourceId)              → ResourceNotFoundError if missing
2. getAction(action)                     → ActionNotFoundError if missing
3. Build ActionContext
   { admin, resource, action, cache, currentAdmin, record?, records? }
4. apiKeyAllows(currentAdmin, resource, action)   → ForbiddenError if denied
5. getRolePermissions(currentAdmin.role)
   permissionsAllow(perms, resource, action)      → ForbiddenError if denied
6. actionDecorator.isAccessible(context)          → ForbiddenError if false
7. for each Before hook: request = hook(request, context)
8. response = action.handler(request, context)
9. for each After hook:  response = hook(response, request, context)
10. emitMutationEvents(actionName, response, request, context)
    ├─ realtime.publish(event)           (created / updated / deleted)
    └─ cache.invalidateTag(...)          (via NestJS interceptor or After hook)
       │
       ▼
ActionResponse
```

The access checks run in sequence (steps 4 → 5 → 6). A later check can only
**tighten** access, never loosen it:

| Check | Applied when |
|---|---|
| API key gate | `currentAdmin.apiKey` is present |
| Role gate | `rolesResourceId` is configured **and** `currentAdmin.role` is set |
| `isAccessible` | Always — last line of defence, per-action |

---

## Ports (pluggable services)

Core defines four **port** interfaces. Each has a no-op default so the framework
works without any external dependencies:

### IAuthProvider

```ts
interface IAuthProvider {
  getCurrentUser(requestContext: unknown): Promise<CurrentAdmin | null>
  getUiProps(): Record<string, unknown>
  login?(credentials: LoginCredentials): Promise<CurrentAdmin | null>
  logout?(requestContext: unknown): Promise<void>
}
```

- Default: `AnonymousAuthProvider` — always returns `null` (anonymous mode)
- Real: `BetterAuthProvider` from `@modern-admin/auth-better-auth`

### ICacheProvider

```ts
interface ICacheProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  del(key: string | string[]): Promise<void>
  invalidateTag(tag: string | string[]): Promise<void>
  subscribe?(channel: string, handler: (message: string) => void): Promise<() => void>
  publish?(channel: string, message: string): Promise<void>
}
```

- Default: `NoopCacheProvider` — every `get` returns `null`
- Real: `RedisCacheProvider` from `@modern-admin/cache-redis`

See [Cache](./cache.md) for the full two-tier cache guide.

### IRealtimeBus

```ts
interface IRealtimeBus {
  publish(event: RealtimeEvent): Promise<void>
  subscribe(handler: RealtimeHandler): () => void
}
```

- Default: `NoopRealtimeBus` — drops all events
- In-process: `InMemoryRealtimeBus` — event emitter, single-process only
- Real: `RedisRealtimeBus` from `@modern-admin/realtime` — cross-instance via pub/sub

### IComponentLoader

```ts
interface IComponentLoader {
  add(name: string, path: string): void
  get(name: string): ComponentLoaderEntry | undefined
}
```

Lets apps register custom React components by name for custom action UIs.
The transport returns the name in `ActionDescriptor.component`; the frontend
dynamically imports the matching component at render time.

---

## Two-tier plugin system

Two plugin scopes coexist and run in order during `ResourcesFactory.decorate()`:

### 1. Local FeatureFn (per-resource)

```ts
type FeatureFn = (options: ResourceOptions) => ResourceOptions

// Declared on a resource-by-resource basis:
{
  resource: PostsResource,
  features: [uploadFeature({ ... }), m2mFeature({ ... })]
}
```

`FeatureFn` transforms `ResourceOptions` — it appends hooks, registers virtual
properties, changes action visibility, etc. Examples:

| FeatureFn | Package |
|---|---|
| `uploadFeature` | `@modern-admin/feature-upload` |
| `m2mFeature` | `@modern-admin/feature-m2m` |
| `historyFeature` | `@modern-admin/feature-history` |
| `passwordFeature` | `@modern-admin/feature-password` |
| `actionLoggingFeature` | `@modern-admin/feature-logging` |
| `webhooksFeature` | `@modern-admin/feature-webhooks` |

### 2. Global plugin (process-wide)

```ts
interface GlobalPlugin {
  name?: string
  include?: string[]    // whitelist of resource ids
  exclude?: string[]    // blacklist of resource ids
  apply: (options: ResourceOptions, resource: BaseResource) => ResourceOptions
}

// Declared at the ModernAdmin / ModernAdminModule level:
ModernAdminModule.forRoot({
  plugins: [actionLoggingPlugin({ ... })]
})
```

Global plugins receive the options **already transformed by local features** and
run before user `options`. This means global plugins can be overridden per-resource
simply by providing an explicit `ResourceOptions` value.

---

## System subsystems

`packages/core/src/system/` defines port interfaces and in-memory defaults for
optional framework subsystems. Concrete Prisma/Drizzle adapters live in
`@modern-admin/system-prisma` / `@modern-admin/system-drizzle`:

| Subsystem | Port | Purpose |
|---|---|---|
| Action log | `IActionLogStore` | Persist every `invoke()` call (actor, action, resource, diff) |
| Webhooks | `IWebhookStore` | Outbound HTTP callbacks on mutation events |
| Config | `IConfigStore` | Key/value store for admin-editable app configuration |
| History | `IHistoryStore` | Record revision snapshots for diff/restore |
| AI tasks | `IAiTaskStore` | Queue and status for AI assistant background jobs |
| SQL cache | `ISqlCacheStore` | Memoised raw SQL results for time-series queries |

Subsystems are opt-in. Register a concrete implementation in `ModernAdminModule.forRoot()`
under the corresponding port token; the NestJS module mounts the matching controller
automatically.

---

## Dashboard store

`packages/core/src/dashboard/store.ts` defines the `IDashboardStore` port and the
Zod schema for the dashboard configuration blob (`DashboardBlob`):

```ts
interface IDashboardStore {
  load(adminId: string): Promise<DashboardBlob | null>
  save(adminId: string, blob: DashboardBlob): Promise<void>
}
```

Each chart widget (`ChartDef`) describes a `TimeSeriesQuery` to execute, which
visualisation to use, and which resource/field to query. The React layer calls
`useAdminConfig()` to fetch it and renders the charts using the bundled
`recharts`-backed `Chart` component from `@modern-admin/ui`.

---

## Transport layer

Both transports are thin wrappers over `ModernAdmin.invoke()`:

### REST (NestJS)

`@modern-admin/nest` mounts a `ResourceController` at
`/admin/api/resources/:resourceId/actions/:action`. It:

1. Calls `IAuthProvider.getCurrentUser(request)` via `ModernAdminAuthGuard`
2. Maps HTTP verbs/body to `ActionRequest`
3. Calls `admin.invoke(request, currentAdmin)`
4. Applies `ModernAdminCacheInterceptor` (caches GET responses by URL, TTL 30 s)
5. Returns the `ActionResponse` as JSON

Additional controllers handle auth (`/admin/api/auth/*`), API keys, audit log,
analytics, history, AI assistant, webhooks, and OpenAPI/Scalar sandbox.

### GraphQL (`@modern-admin/graphql`)

Builds a code-first schema at boot time by introspecting `admin.resources`:

- One `Query` field per resource+action (`users_list`, `users_show`, …)
- One `Mutation` field per write action (`users_new`, `users_edit`, `users_delete`, …)
- One `Subscription` per resource (`users_events`) backed by `IRealtimeBus`
- Aggregation queries (`users_aggregate`, `users_timeSeries`) when the adapter supports it
- Custom scalars: `JSON`, `DateTime`, `Upload`

Both transports always call the same `invoke()` so hooks, access checks, cache
invalidation, and realtime events work identically regardless of transport.

---

## Request data shapes

### ActionRequest

```ts
interface ActionRequest {
  params: {
    resourceId: string
    action: string
    recordId?: string      // record actions
    recordIds?: string     // bulk actions (comma-separated)
    query?: string         // search action
    [key: string]: unknown
  }
  payload?: Record<string, unknown>   // POST/PATCH body
  query?: Record<string, unknown>     // URL query params (filters, sort, page)
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  meta?: Record<string, unknown>      // transport-level metadata (IP, request id)
}
```

### ActionContext

```ts
interface ActionContext {
  admin: ModernAdmin
  resource: BaseResource
  action: ActionDescriptor
  cache: ICacheProvider
  currentAdmin?: CurrentAdmin
  record?: BaseRecord        // record actions
  records?: BaseRecord[]     // bulk actions
  [key: string]: unknown     // hooks share state via free-form keys
}
```

### Filter

```ts
type Filter = FilterElement[]

interface FilterElement {
  path: string              // property path
  value: FilterValue        // scalar | string[] | { from?, to? }
  property: BaseProperty | null
}
```

Adapters translate `Filter` into ORM-specific WHERE clauses. The core `Filter`
class also provides a static `fromRecord()` helper that converts the flat
`query.filters` object from the request into `FilterElement[]`.

---

## Error types

All errors are exported from `@modern-admin/core`:

| Error class | HTTP | Cause |
|---|---|---|
| `ResourceNotFoundError` | 404 | No resource with that id |
| `ActionNotFoundError` | 404 | No action with that name |
| `ForbiddenError` | 403 | Access check failed |
| `RecordNotFoundError` | 404 | `findOne()` returned null |
| `ValidationError` | 422 | Adapter constraint violation (unique, FK, required) |
| `NoDatabaseAdapterError` | 500 | No adapter matched the database config |
| `NoResourceAdapterError` | 500 | No adapter matched the resource class |
| `NotImplementedError` | 501 | Optional adapter method not implemented |

The NestJS and GraphQL transports catch these and map them to the correct HTTP
status codes / GraphQL error extensions automatically.

---

## UUID v7 identifier policy

All generated identifiers — primary keys, log entry ids, queue job ids, file
storage keys, action ids — **must be UUID v7** (RFC 9562). UUID v7 is
time-ordered, keeping inserts cache- and index-friendly and enabling natural
pagination cursors.

```ts
import { uuidv7 } from '@modern-admin/core'

const id = uuidv7()   // '01956d2e-3a4b-7c8d-9e0f-1a2b3c4d5e6f'
```

Never use `crypto.randomUUID()` (v4), `nanoid`, or ORM engine defaults
(`@default(uuid())`, `defaultRandom()`) — those generate v4 in current ORM versions.
Generate ids in application code and pass them explicitly on insert.
