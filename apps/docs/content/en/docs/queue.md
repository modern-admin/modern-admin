---
title: Queue & Cron
description: BullMQ-backed job queues and distributed cron scheduling in Modern Admin.
---

# Queue & Cron

`@modern-admin/queue` wraps [BullMQ](https://docs.bullmq.io/) and `@nestjs/bullmq` to
provide a thin, opinionated layer for job queues and distributed cron scheduling inside
NestJS applications built with Modern Admin.

---

## Installation

```sh
bun add @modern-admin/queue bullmq @nestjs/bullmq
```

The package has four peer dependencies:

| Peer | Required version |
|---|---|
| `bullmq` | `^5.0.0` |
| `@nestjs/bullmq` | `^11.0.4` |
| `@nestjs/common` | `^11.0.0` |
| `@nestjs/core` | `^11.0.0` |

---

## Architecture overview

```
@modern-admin/queue
├── QueueModule          — BullMQ Redis connection + named queue registration
└── CronModule           — @Global cron scheduler built on top of QueueModule
    ├── CronService      — discovers @CronTask methods, syncs BullMQ schedulers
    └── CronProcessor    — @Processor worker, dispatches jobs, optional Redis lock
```

All cron state (schedules, job history) lives in **Redis** via BullMQ. The
application process only holds handler references in memory — Redis is the source
of truth for what runs and when.

---

## `QueueModule`

### `QueueModule.forRoot(options)`

Configure the BullMQ Redis connection once at the root level. The module is
`global: true`, so the connection is available to every `register()` call
in any feature module.

```ts
// app.module.ts
import { QueueModule } from '@modern-admin/queue'

@Module({
  imports: [
    QueueModule.forRoot({
      connection: process.env.REDIS_URL ?? {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
  ],
})
export class AppModule {}
```

`connection` accepts either an **ioredis connection URL** (`"redis://..."`) or a
**plain options object** (`{ host, port, password, db }`).

You can also set process-wide job defaults via `defaultJobOptions`:

```ts
QueueModule.forRoot({
  connection: process.env.REDIS_URL!,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 500 },
  },
})
```

### `QueueModule.forRootAsync(opts)`

Use when the Redis URL is only known at runtime (e.g. injected via `ConfigService`):

```ts
QueueModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    connection: cfg.get<string>('REDIS_URL'),
  }),
})
```

### `QueueModule.register({ queues, flows? })`

Register named queues (and optional flow producers) within a feature module.
Exports the BullMQ DI tokens so they can be injected via `@InjectQueue(name)`.

```ts
// emails.module.ts
import { QueueModule } from '@modern-admin/queue'
import { BullModule } from '@nestjs/bullmq'

@Module({
  imports: [
    QueueModule.register({
      queues: ['emails', 'exports'],
      flows: ['batch-flow'],        // optional, registers FlowProducers
    }),
  ],
})
export class EmailsModule {}
```

Inject a queue in any service in the same module:

```ts
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'

@Injectable()
export class EmailSenderService {
  constructor(
    @InjectQueue('emails') private readonly emailQueue: Queue,
  ) {}

  async sendWelcome(userId: string) {
    await this.emailQueue.add('welcome', { userId }, { delay: 5_000 })
  }
}
```

### `QueueRootOptions`

| Field | Type | Description |
|---|---|---|
| `connection` | `string \| { host?, port?, password?, db? }` | ioredis-compatible connection |
| `defaultJobOptions` | `DefaultJobOptions` | Defaults applied to every queue in this process |

### `QueueModuleOptions`

| Field | Type | Description |
|---|---|---|
| `queues` | `string[]` | Names of queues to register |
| `flows` | `string[]` | Names of flow producers to register (optional) |

---

## `CronModule`

`CronModule` is a **`@Global()`** module that provides distributed cron scheduling.
Import it once alongside `QueueModule.forRoot()`:

```ts
import { QueueModule, CronModule } from '@modern-admin/queue'

@Module({
  imports: [
    QueueModule.forRoot({ connection: process.env.REDIS_URL! }),
    CronModule,
  ],
})
export class AppModule {}
```

`CronModule` internally calls `QueueModule.register({ queues: ['ma:cron'] })` —
you do **not** need to register the cron queue manually.

---

## `@CronTask` decorator

`@CronTask` marks a service method as a BullMQ-backed cron task.
`CronService` discovers all decorated methods automatically via
NestJS `DiscoveryService` during module initialisation.

```ts
import { Injectable } from '@nestjs/common'
import { CronTask } from '@modern-admin/queue'
import type { Job } from 'bullmq'

@Injectable()
export class ReportService {
  @CronTask({ name: 'daily-report', cron: '0 8 * * *' })
  async runDailyReport(job: Job) {
    // job.data is the payload enqueued by BullMQ at the scheduled time
    console.log('Running daily report', job.id)
  }

  @CronTask({
    name: 'cleanup',
    cron: '0 0 * * 0',          // every Sunday at midnight UTC
    skipIfRunning: true,          // skip if the previous run is still active
    opts: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 30_000 },
    },
  })
  async weeklyCleanup(job: Job) {
    // ...
  }
}
```

### `CronTaskOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | Unique task name — used as the BullMQ job scheduler key |
| `cron` | `string` | **required** | Standard 5-field cron expression (UTC) |
| `skipIfRunning` | `boolean` | `false` | Acquire a distributed Redis lock; skip if previous run is still active |
| `opts` | `Omit<JobsOptions, 'repeat'>` | — | Extra BullMQ job options (attempts, backoff, priority, …) |

The decorated service must be a NestJS provider (annotated with `@Injectable()`) so
that `DiscoveryService` can locate it.

---

## `CronService`

`CronService` is exported by `CronModule` and injectable everywhere (the module is global).

### `register(definition)`

Register a cron task **imperatively** — useful in dynamic scenarios where the task name
or schedule is not known at compile time.

```ts
import { CronService } from '@modern-admin/queue'

@Injectable()
export class DynamicScheduler implements OnModuleInit {
  constructor(private readonly cron: CronService) {}

  onModuleInit() {
    this.cron.register({
      name: 'dynamic-task',
      cron: '*/15 * * * *',
      handler: async (job) => {
        console.log('dynamic job', job.id)
      },
      skipIfRunning: true,
    })
  }
}
```

**Timing rules:**

- If called **before** `onModuleInit` (e.g. inside another service's `onModuleInit`
  that runs earlier), the task is buffered and synced to Redis alongside all other
  tasks during `CronService.onModuleInit`.
- If called **after** `onModuleInit`, the BullMQ scheduler is upserted in Redis
  immediately.

Registering the same `name` twice throws:
```
Error: Cron task "my-task" is already registered
```

### `purgeTasks(names)`

Remove specific cron tasks from Redis — deletes their repeatable schedulers and any
`waiting` / `delayed` jobs currently in the queue.

```ts
await this.cron.purgeTasks(['dynamic-task', 'old-task'])
```

This is useful when you remove a task from code and want to clean up Redis on the
next deploy rather than waiting for the stale scheduler to be garbage-collected.

### Lifecycle

| Hook | What happens |
|---|---|
| `onModuleInit` | `discoverCronTasks()` reads `@CronTask` metadata from all providers; then `syncSchedulers()` removes stale Redis schedulers and upserts all current ones |
| `onModuleDestroy` | Closes the BullMQ queue connection |

### Stale scheduler cleanup

Every time the application starts, `CronService` compares the names registered in
code against the schedulers that exist in Redis. Any scheduler whose name is no
longer in the code is **automatically removed from Redis**. This means you can
rename or delete a `@CronTask` without manual cleanup.

---

## `CronProcessor`

`CronProcessor` is the BullMQ `@Processor` worker. It runs with a concurrency of **4**
(configurable via the `DEFAULT_CRON_WORKER_CONCURRENCY` constant) and is registered
automatically by `CronModule` — you never instantiate it directly.

### Dispatch flow

```
BullMQ fires job "task-name"
    ↓
CronProcessor.process(job)
    ↓
cronService.getHandler(job.name)     — looks up the in-memory handler
    ↓
cronService.shouldSkipIfRunning(name)?
    ├── yes → processWithLock(job, handler)
    └── no  → executeHandler(job, handler)
```

### `skipIfRunning` — distributed lock

When a task declares `skipIfRunning: true`, the processor acquires a Redis lock
before calling the handler:

```
SET ma:cron-lock:<name> <jobId> EX 300 NX
```

| Result | Action |
|---|---|
| `"OK"` (lock acquired) | Handler is called; lock is released in `finally` |
| `null` (already locked) | Execution is skipped; job returns `undefined` |

The lock TTL is **300 seconds** (`DEFAULT_CRON_LOCK_TTL`). If the handler runs longer
than 5 minutes the lock expires automatically, allowing the next invocation to proceed.
The lock is always deleted after the handler completes (or throws) so it does not
linger in Redis.

### Logging

`CronProcessor` logs at three levels:

| Event | Level |
|---|---|
| Task started | `log` — includes `jobId` |
| Task completed | `log` — includes elapsed ms |
| Task failed | `error` — includes elapsed ms and error |
| Task skipped (lock held) | `warn` — includes `jobId` of the running instance |
| No handler found | `error` — throws |

### Job retention

By default, completed and failed jobs are retained in Redis with a cap of **100
entries each** (`removeOnComplete: { count: 100 }`, `removeOnFail: { count: 100 }`).
Override per task via `opts` in `@CronTask` or `CronTaskDefinition`.

---

## `CronTaskDefinition`

The shape used by the imperative `register()` API:

```ts
interface CronTaskDefinition<TData = unknown, TResult = unknown> {
  name: string
  cron: string
  handler: (job: Job<TData, TResult, string>) => Promise<TResult> | TResult
  skipIfRunning?: boolean
  opts?: Omit<JobsOptions, 'repeat'>
}
```

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `CRON_QUEUE` | `"ma:cron"` | BullMQ queue name used by `CronModule` |
| `CRON_LOCK_PREFIX` | `"ma:cron-lock:"` | Redis key prefix for `skipIfRunning` locks |
| `DEFAULT_CRON_LOCK_TTL` | `300` | Lock TTL in seconds |
| `DEFAULT_CRON_WORKER_CONCURRENCY` | `4` | `CronProcessor` concurrency setting |

---

## Complete wiring example

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueModule, CronModule } from '@modern-admin/queue'
import { ReportsModule } from './reports/reports.module'

@Module({
  imports: [
    ConfigModule.forRoot(),
    QueueModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: cfg.get<string>('REDIS_URL')!,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 500 },
        },
      }),
    }),
    CronModule,
    ReportsModule,
  ],
})
export class AppModule {}
```

```ts
// reports/reports.module.ts
import { Module } from '@nestjs/common'
import { QueueModule } from '@modern-admin/queue'
import { ReportsService } from './reports.service'

@Module({
  imports: [QueueModule.register({ queues: ['reports'] })],
  providers: [ReportsService],
})
export class ReportsModule {}
```

```ts
// reports/reports.service.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { CronTask } from '@modern-admin/queue'
import type { Job, Queue } from 'bullmq'

@Injectable()
export class ReportsService {
  constructor(
    @InjectQueue('reports') private readonly reportsQueue: Queue,
  ) {}

  // Scheduled cron task — runs every day at 08:00 UTC
  @CronTask({
    name: 'daily-report',
    cron: '0 8 * * *',
    skipIfRunning: true,
    opts: { attempts: 2 },
  })
  async dailyReport(job: Job) {
    // Heavy work — enqueue individual report generation jobs
    const userIds = await this.getUserIds()
    for (const id of userIds) {
      await this.reportsQueue.add('generate', { userId: id })
    }
  }

  // On-demand: enqueue a report immediately
  async requestReport(userId: string) {
    return this.reportsQueue.add('generate', { userId }, { priority: 1 })
  }

  private async getUserIds(): Promise<string[]> {
    return []
  }
}
```

---

## Cron expression reference

The `cron` field uses standard 5-field format interpreted as **UTC**:

```
┌─── minute        (0-59)
│ ┌─── hour         (0-23)
│ │ ┌─── day of month (1-31)
│ │ │ ┌─── month        (1-12)
│ │ │ │ ┌─── day of week  (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour at :00 |
| `0 8 * * *` | Every day at 08:00 UTC |
| `0 0 * * 1` | Every Monday at midnight UTC |
| `0 0 1 * *` | First day of every month at midnight UTC |
| `0 0 1 1 *` | Once a year on Jan 1 at midnight UTC |

---

## Testing

Because cron tasks are plain async methods, they are straightforward to unit-test
without any BullMQ connection. Pass a synthetic `Job` object and assert on
side effects:

```ts
import { describe, test, expect, mock } from 'bun:test'
import type { Job } from 'bullmq'

const makeJob = (data: unknown) => ({ id: 'test-id', name: 'test', data } as unknown as Job)

describe('ReportsService › dailyReport', () => {
  test('enqueues one job per user', async () => {
    const addMock = mock(() => Promise.resolve())
    const service = new ReportsService({ add: addMock } as unknown as any)

    await service.dailyReport(makeJob({}))

    // assert addMock was called the expected number of times
    expect(addMock.mock.calls.length).toBeGreaterThan(0)
  })
})
```

For integration tests that need real BullMQ, use a local Redis instance
(e.g. via Docker) and the `@nestjs/testing` module the same way the
[package's own tests](https://github.com/your-org/modern-admin/tree/main/packages/queue/test)
do — mock the `Queue` object with `mock()` and assert on its method calls.
