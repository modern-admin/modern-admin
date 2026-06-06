import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import {
  CRON_LOCK_PREFIX,
  CRON_QUEUE,
  DEFAULT_CRON_LOCK_TTL,
  DEFAULT_CRON_WORKER_CONCURRENCY,
} from './cron.constants.js'
import type { CronService } from './cron.service.js'

@Processor(CRON_QUEUE, { concurrency: DEFAULT_CRON_WORKER_CONCURRENCY })
export class CronProcessor extends WorkerHost {
  private readonly logger = new Logger(CronProcessor.name)

  constructor(
    private readonly cronService: CronService,
    @InjectQueue(CRON_QUEUE) private readonly cronQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<unknown, unknown, string>): Promise<unknown> {
    const handler = this.cronService.getHandler(job.name)
    if (!handler) {
      const msg = `No cron handler registered for "${job.name}"`
      this.logger.error(msg)
      throw new Error(msg)
    }

    return this.cronService.shouldSkipIfRunning(job.name)
      ? this.processWithLock(job, handler)
      : this.executeHandler(job, handler)
  }

  private async processWithLock(
    job: Job<unknown, unknown, string>,
    handler: (job: Job) => unknown,
  ): Promise<unknown> {
    const lockKey = `${CRON_LOCK_PREFIX}${job.name}`
    const client = await this.cronQueue.client

    // Atomic SET NX EX via the generic `runCommand` escape hatch on
    // bullmq's `IRedisClient`. We can't use `client.set(..., { EX, NX })`
    // because bullmq 5.77+ abstracted the client surface and dropped the
    // `NX` option from `set`'s typed overloads (it now only accepts
    // `{ PX?, EX? }`). `runCommand` is the documented portable way to
    // reach any Redis command across ioredis / node-redis / bun-redis
    // adapters. Returns the raw bulk-string reply ("OK") or nil.
    const acquired = (await client.runCommand('set', [
      lockKey,
      job.id!,
      'EX',
      DEFAULT_CRON_LOCK_TTL,
      'NX',
    ])) as string | null
    if (!acquired) {
      this.logger.warn(
        `Skipping "${job.name}" (jobId=${job.id}) — previous instance still running`,
      )
      return
    }

    try {
      return await this.executeHandler(job, handler)
    } finally {
      await client.del(lockKey)
    }
  }

  private async executeHandler(
    job: Job<unknown, unknown, string>,
    handler: (job: Job) => unknown,
  ): Promise<unknown> {
    const start = Date.now()
    this.logger.log(`Cron task "${job.name}" started (jobId=${job.id})`)
    try {
      const result = await handler(job)
      this.logger.log(`Cron task "${job.name}" completed in ${Date.now() - start}ms`)
      return result
    } catch (err: unknown) {
      this.logger.error(`Cron task "${job.name}" failed after ${Date.now() - start}ms`, err)
      throw err
    }
  }
}
