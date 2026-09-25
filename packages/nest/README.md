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

## API keys

An API key authenticates as its owner, and its `resource × action` permissions
are enforced only by the core action gate (`ModernAdmin.invoke()` /
`canAccess()`). `ModernAdminAuthGuard` therefore answers **403** to API-key
principals on every route except those marked `@AllowApiKey()`: resource
actions, global search and `GET /admin/api/auth/me`. Audit log, history,
webhooks, dashboard, analytics, cache, AI assistant, media generation and API
key management are session-only. Mark your own controllers `@AllowApiKey()`
only when everything they read or change goes through that gate.

`createBetterAuthMiddleware` likewise answers 403 to any request presenting an
API key on Better Auth's own paths (`/get-session`, `/list-sessions`,
`/api-key/create`, …), where a key would otherwise act as a full session of its
owner. Pass `{ apiKeyHeaders }` if the api-key plugin uses custom headers. Mount
Better Auth through it rather than a bare `toNodeHandler(auth)`, whatever the
prefix.

`IApiKeyService` receives `expiresIn` in **seconds**, the unit of Better Auth's
api-key plugin; `ApiKeysController` converts the `expiresInDays` it accepts.

## Analytics

`POST /admin/api/timeseries` aggregates record data, so it applies the `list`
gate: the resource must pass `canAccess(resource, 'list', currentAdmin)` and
`dateField`, `field` and `groupBy` must be properties the caller may read,
otherwise 403. FK labels (`groupByLabelResource`) are only resolved from a
resource the caller may list.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
