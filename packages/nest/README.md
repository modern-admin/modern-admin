# @modern-admin/nest

[![npm version](https://img.shields.io/npm/v/@modern-admin/nest)](https://www.npmjs.com/package/@modern-admin/nest)
[![license](https://img.shields.io/npm/l/@modern-admin/nest)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> NestJS module wrapping @modern-admin/core — REST controllers, guards, cache, OpenAPI.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/nest
```

## Cache safety and diagnostics

The GET response cache uses versioned canonical URLs and a per-API-key or
per-user scope. Resources with functional action/property `isAccessible`
rules bypass this layer so a filtered response never skips request-time
authorization. Role permission changes invalidate related HTTP responses.

When a cache provider is configured, the SPA exposes a Cache page backed by
`/admin/api/cache/stats`. Stats, reset, and resource invalidation endpoints
default to the `admin` role; configure `cacheRoles` to provide a different
operator allowlist. API-key principals cannot use these operator endpoints.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
