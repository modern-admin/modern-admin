# @modern-admin/core

[![npm version](https://img.shields.io/npm/v/@modern-admin/core)](https://www.npmjs.com/package/@modern-admin/core)
[![license](https://img.shields.io/npm/l/@modern-admin/core)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Core abstractions of the Modern Admin framework — adapters, resources, decorators, actions, ports.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/core
```

## Cache runtime

`ModernAdmin.cacheRuntime` is the framework cache facade. Built-in actions and
transports use it for fail-open reads and writes, tag-generation fencing,
in-process request coalescing, invalidation retry/quarantine, positive TTL
jitter, and per-namespace metrics. `NoopCacheProvider` remains the default;
`MemoryCacheProvider({ maxEntries })` provides a bounded LRU for a single
process. `admin.cache` is a low-level provider escape hatch; direct access
bypasses runtime fencing, quarantine, and metrics.

Out-of-band ORM or CLI mutations must call
`admin.invalidateResourceCaches(resourceId, recordIds)`. Writers that update
the configured roles resource outside `invoke()` must also call
`admin.invalidateRolePermissionsCache(roleName?)` so permission revocation is
active across replicas. Provider `get()` reserves `null` for cache misses; use
a non-null envelope for negative caching.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
