# @modern-admin/feature-history

[![npm version](https://img.shields.io/npm/v/@modern-admin/feature-history)](https://www.npmjs.com/package/@modern-admin/feature-history)
[![license](https://img.shields.io/npm/l/@modern-admin/feature-history)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Record revision history feature plugin for Modern Admin.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/feature-history
```

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

Persistent retention is intentionally not executed from resource action
hooks. Configure `RetentionModule` from `@modern-admin/queue` to run
`historyStore.prune()` as a BullMQ cron task:

```ts
RetentionModule.forRoot({
  history: {
    store: system.historyStore,
    keepDays: 90,
    keepLast: 100,
  },
})
```

`historyFeature({ keepDays, keepLast })` only bounds its automatic in-memory
fallback. Database-backed stores must use the queue module.

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
