---
title: Cache
description: ICacheProvider port, Redis backend, and tag-based invalidation.
---

# Cache

Cache is a **port**: `ICacheProvider` lives in core, real packages plug in.

```ts
interface ICacheProvider {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, opts?: { ttlMs?: number; tags?: string[] }): Promise<void>
  del(key: string): Promise<void>
  invalidateTag(tag: string): Promise<void>
}
```

The cache interceptor in `@modern-admin/nest` automatically wraps `find`,
`findOne`, and `count` actions; mutations call `invalidateTag` on
`resource:<id>` and `record:<resourceId>:<recordId>`.

## Redis backend

```sh
bun add @modern-admin/cache-redis ioredis
```

```ts
import { RedisCacheProvider } from '@modern-admin/cache-redis'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)

ModernAdminModule.forRoot({
  databases: [...],
  resources: [...],
  cache: new RedisCacheProvider(redis, { keyPrefix: 'modern-admin:' }),
})
```

Tag invalidation uses Redis sets keyed by `<prefix>tag:<tag>`. Each tagged
write registers its key under every tag set; `invalidateTag` reads the set,
deletes all referenced keys, and finally drops the set.

## Cross-instance invalidation

When you run multiple API instances, mutations on instance A must
invalidate caches on instance B. The Redis backend handles this naturally
— writes/deletes hit a shared keyspace. For *event* fan-out (e.g. live
list updates), see [Realtime](./realtime.md).

## Per-action TTL

Override the default TTL per action via the action option:

```ts
{
  actions: {
    list: { cache: { ttlMs: 5_000 } },
    show: { cache: { ttlMs: 30_000 } },
  },
}
```

Set `cache: false` to skip caching for an action entirely (useful for
admin dashboards that need real-time numbers).
