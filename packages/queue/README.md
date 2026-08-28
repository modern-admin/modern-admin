# @modern-admin/queue

[![npm version](https://img.shields.io/npm/v/@modern-admin/queue)](https://www.npmjs.com/package/@modern-admin/queue)
[![license](https://img.shields.io/npm/l/@modern-admin/queue)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> BullMQ-based queue + cron module for Modern Admin (NestJS).

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/queue
```

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## System retention

`RetentionModule` runs history and audit-log pruning in the existing BullMQ
cron queue. Import `QueueModule.forRoot()` once, then configure whichever
stores need retention:

```ts
import { QueueModule, RetentionModule } from '@modern-admin/queue'

@Module({
  imports: [
    QueueModule.forRoot({ connection: process.env.REDIS_URL! }),
    RetentionModule.forRoot({
      cron: '0 3 * * *',
      history: {
        store: system.historyStore,
        keepDays: 90,
        keepLast: 100,
      },
      auditLog: {
        store: system.logStore,
        keepDays: 365,
      },
    }),
  ],
})
export class AppModule {}
```

The task uses the cron worker's distributed lock, retries failures three
times, and does not run when no `keepDays`/`keepLast` bound is configured.
History `keepLast` is per record; audit-log `keepLast` is global.

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
