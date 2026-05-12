---
title: Cache
description: Two-tier cache — server-side ICacheProvider (Redis) and client-side TanStack Query.
---

# Cache

Modern Admin uses a **two-tier cache**:

1. **Server-side** — `ICacheProvider` port in `@modern-admin/core`. The bundled
   implementation (`@modern-admin/cache-redis`) uses Redis. Each GET response is stored
   with a tag so that any mutation through `invoke()` drops exactly the affected entries
   in a single round-trip.

2. **Client-side** — TanStack Query (`@tanstack/react-query`) in `packages/react`.
   Every resource list, show, and search result is stored in the browser's in-process
   cache and invalidated when the matching mutation succeeds.

---

## How it works end-to-end

```
Browser                       NestJS                        Redis
──────                        ──────                        ─────
TanStack Query cache
  useRecords('users')
  → cache miss →  GET /admin/api/resources/users/actions/list
                        │
                  CacheInterceptor
                    cache.get('nest:GET:/admin/api/…')
                    → cache miss →  invoke() → DB query
                                    ← response ←
                    cache.set(key, response, {
                      ttl: 30,
                      tags: ['resource:users']
                    })                          → SET ma:nest:GET:/…  EX 30
                                                  SADD ma:tag:resource:users  key
                  ← response ←
  ← data ←
  (stored in TanStack Query cache)

  useUpdateRecord('users').mutate(…)
  → POST /admin/api/resources/users/actions/edit/123
                        │
                  invoke() runs edit handler
                  cache.invalidateTag('resource:users')
                                                → SMEMBERS ma:tag:resource:users
                                                → DEL ma:nest:GET:/…  ma:tag:resource:users
                  ← 200 OK ←
  qc.invalidateQueries(['modern-admin', 'users'])
  → cache miss on next render → re-fetches from server
```

---

## ICacheProvider port

```ts
interface ICacheProvider {
  get<T = unknown>(key: string): Promise<T | null>

  set<T = unknown>(
    key: string,
    value: T,
    options?: CacheSetOptions,
  ): Promise<void>

  del(key: string | string[]): Promise<void>

  invalidateTag(tag: string | string[]): Promise<void>

  // Optional — used by RedisCacheProvider for cross-instance pub/sub
  subscribe?(channel: string, handler: (message: string) => void): Promise<() => void>
  publish?(channel: string, message: string): Promise<void>
}

interface CacheSetOptions {
  ttl?: number      // seconds
  tags?: string[]
}
```

The default implementation is `NoopCacheProvider` — every `get` returns `null`, every
`set` / `del` / `invalidateTag` is a no-op. The framework works correctly without a
Redis connection; you just don't get caching.

---

## Redis backend

### Installation

```sh
bun add @modern-admin/cache-redis ioredis
```

### Setup

```ts
// admin.module.ts
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true })
redis.connect().catch((err) => {
  console.warn('[cache] Redis connect failed; falling back to noop cache', err)
})

ModernAdminModule.forRoot({
  // …
  cache: new RedisCacheProvider({ client: redis }),
})
```

### Configuration reference

`RedisCacheOptions`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `client` | `ioredis`-compatible client | — | Main Redis connection |
| `prefix` | `string` | `'ma:'` | Prepended to every key and tag key |
| `defaultTtl` | `number` (seconds) | none | TTL applied to `set()` calls that don't supply one |
| `subscriber` | `ioredis`-compatible client | — | Dedicated connection for pub/sub (ioredis requires a separate client) |

### Lazy connection (recommended)

Use `lazyConnect: true` and call `.connect()` manually. This way a Redis outage does not
block API startup — the provider degrades to noop behaviour until the connection comes up.

```ts
const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true })
redis.connect().catch((err) =>
  console.warn('Redis unavailable; cache disabled:', err.message),
)
```

---

## Key structure

Every key is prefixed so multiple services can share a Redis instance without
collisions:

| Type | Pattern | Example |
|------|---------|---------|
| Response key | `<prefix>nest:GET:<url>` | `ma:nest:GET:/admin/api/resources/users/actions/list?page=1` |
| Tag set key | `<prefix>tag:<tag>` | `ma:tag:resource:users` |

### Tag sets

Each `set(key, value, { tags: ['resource:users'] })` call executes:

```redis
SET  ma:nest:GET:/admin/…  <json>  EX 30
SADD ma:tag:resource:users  ma:nest:GET:/admin/…
```

`invalidateTag('resource:users')` then executes:

```redis
SMEMBERS ma:tag:resource:users       → ['ma:nest:GET:/admin/…', …]
DEL      ma:nest:GET:/admin/…  ma:tag:resource:users
```

All affected keys and the tag set itself are deleted in a **single `DEL` call** —
no scanning, no `KEYS *`, no Lua scripts.

---

## NestJS cache interceptor

`ModernAdminCacheInterceptor` is applied automatically to every route in
`ResourceController`. It caches only **GET** requests that carry a `:resourceId` param.

### Cache key

```
nest:GET:<originalUrl>
```

The `originalUrl` includes the full path and query string:
```
nest:GET:/admin/api/resources/users/actions/list?page=1&perPage=25&sortBy=createdAt&direction=desc
```

Different page/filter/sort combinations produce distinct cache entries — no stale
data bleeds across different list views.

### Default TTL

`30 seconds`. Controlled by the interceptor's hard-coded `ttl: 30`. You can override
this at the resource level via decorator options (see below).

### What gets cached

| Action | Cached | Tag |
|--------|--------|-----|
| `list` | Yes | `resource:<id>` |
| `show` | Yes | `resource:<id>` |
| `search` | Yes | `resource:<id>` |
| `new` (GET form) | Yes | `resource:<id>` |
| `edit` (GET form) | Yes | `resource:<id>` |
| `new` (POST) | No (mutation) | — |
| `edit` (PATCH) | No (mutation) | — |
| `delete` (DELETE) | No (mutation) | — |

---

## Automatic invalidation

Every call to `ModernAdmin.invoke()` that completes a mutation emits a realtime event
**and** invalidates the resource's cache tag. This happens after all after-hooks have
run, so the published record reflects the final state.

| `invoke()` action | Tag invalidated |
|---|---|
| `new` | `resource:<resourceId>` |
| `edit` | `resource:<resourceId>` |
| `delete` | `resource:<resourceId>` |
| `bulkDelete` | `resource:<resourceId>` |
| Custom actions | No automatic invalidation — call `cache.invalidateTag()` manually in an after-hook |

### Manual invalidation in a custom action

```ts
import type { After, ActionResponse } from '@modern-admin/core'

const afterCreateOrder: After<ActionResponse> = async (response, _request, context) => {
  // Invalidate related caches when a custom action modifies multiple resources
  await context.cache.invalidateTag(['resource:orders', 'resource:inventory'])
  return response
}
```

---

## Cross-instance invalidation

When running multiple API instances behind a load balancer, all instances share the same
Redis keyspace. A mutation on instance A calls `invalidateTag` which deletes keys from
Redis — the next GET on instance B misses the cache and re-fetches from the database.

No additional configuration is needed: the shared Redis connection provides this
behaviour automatically.

For **real-time live-list updates** (pushing new rows to the browser without a manual
refresh), see the [Realtime](./realtime.md) page — it uses Redis pub/sub on the same
connection.

---

## Client-side cache (TanStack Query)

`packages/react` wraps every API call in TanStack Query hooks. The query key hierarchy
mirrors the resource structure:

| Hook | Query key | Stale time |
|------|-----------|-----------|
| `useAdminConfig()` | `['modern-admin', 'config']` | 60 s |
| `useRecords(id, query)` | `['modern-admin', id, 'list', query]` | default |
| `useRecord(id, recordId)` | `['modern-admin', id, 'show', recordId]` | default |
| `useSearch(id, q)` | `['modern-admin', id, 'search', q]` | default |

### Mutation invalidation

Every mutation hook invalidates the relevant query keys on success:

| Mutation | Invalidated keys |
|---|---|
| `useCreateRecord(id)` | `['modern-admin', id]` (all list + show) |
| `useUpdateRecord(id)` | `['modern-admin', id]` + `['modern-admin', id, 'show', recordId]` |
| `useDeleteRecord(id)` | `['modern-admin', id]` |
| `useBulkDeleteRecords(id)` | `['modern-admin', id]` |

The invalidation uses the `['modern-admin', id]` prefix, which covers all queries for
that resource regardless of page, filter, or sort parameters.

### Relationship to server cache

The two tiers are independent but complementary:

1. The **browser** makes a request — TanStack Query checks its in-process cache first.
2. If a browser cache miss occurs, the request reaches the **server**, which checks Redis.
3. If the Redis cache also misses, the server queries the **database**.

A `useUpdateRecord` success invalidates the TanStack Query cache immediately in the
browser. The server-side Redis cache is invalidated concurrently by the `invoke()` call.
This means:

- Within the same browser session, the UI re-fetches after every mutation.
- Other browser sessions (or API consumers) served from the same Redis will also see the
  invalidation automatically — their next request will bypass the (now-deleted) cache entry.

---

## Writing a custom cache provider

Implement `ICacheProvider` from `@modern-admin/core`:

```ts
import type { CacheSetOptions, ICacheProvider } from '@modern-admin/core'

export class MyMemoryCache implements ICacheProvider {
  private readonly store = new Map<string, unknown>()
  private readonly tagIndex = new Map<string, Set<string>>()

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    this.store.set(key, value)
    for (const tag of options.tags ?? []) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set())
      this.tagIndex.get(tag)!.add(key)
    }
    if (options.ttl != null) {
      setTimeout(() => this.store.delete(key), options.ttl * 1000)
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key]
    keys.forEach((k) => this.store.delete(k))
  }

  async invalidateTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag]
    for (const t of tags) {
      const keys = this.tagIndex.get(t)
      if (keys) {
        keys.forEach((k) => this.store.delete(k))
        this.tagIndex.delete(t)
      }
    }
  }
}
```

Register it in `ModernAdminModule.forRoot({ cache: new MyMemoryCache() })`.

---

## Disabling auth via environment

Set `REDIS_URL` in your `.env` file. The reference apps check for this variable and
fall back to `NoopCacheProvider` when it is absent:

```sh
# .env
REDIS_URL=redis://localhost:6379
```

```ts
// admin.module.ts
const buildCache = () => {
  const url = process.env.REDIS_URL
  if (!url) return undefined  // → NoopCacheProvider (default)
  const client = new Redis(url, { lazyConnect: true })
  client.connect().catch(console.warn)
  return new RedisCacheProvider({ client: client as never })
}

ModernAdminModule.forRoot({
  // …
  cache: buildCache(),
})
```
