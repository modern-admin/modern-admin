# @modern-admin/cache-redis

[![npm version](https://img.shields.io/npm/v/@modern-admin/cache-redis)](https://www.npmjs.com/package/@modern-admin/cache-redis)
[![license](https://img.shields.io/npm/l/@modern-admin/cache-redis)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Redis cache + pub/sub invalidation provider for Modern Admin.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/cache-redis
```

## Usage

```ts
import { RedisCacheProvider } from '@modern-admin/cache-redis'

const cache = new RedisCacheProvider({
  client: redis,
  subscriber: redis.duplicate(),
  prefix: 'ma:',
  defaultTtl: 300,
})
```

Use a scripting-capable Redis 7+ client. Tagged writes atomically store the
value, tag memberships, reverse index, and expected tag epochs in Lua. The
same atomic contract fences a slow computation that started before an
invalidation on another replica. Clients without `EVAL` remain supported as a
degraded, explicitly logged fallback, but cannot provide the race-free
guarantee.

`tagTtl` is a floor for indexes covering expiring values and defaults to 30
days. Persistent values always receive persistent indexes. Explicit deletes
and overwrites remove old memberships; invalidation increments tag epochs
before draining values. Optional locks use `SET PX NX` and token-checked Lua
release.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
