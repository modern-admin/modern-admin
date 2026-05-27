import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { InjectQueue } from '@nestjs/bullmq'
import type { Job, Queue } from 'bullmq'
import { CRON_QUEUE } from './cron.constants.js'
import type { CronHandler, CronTaskDefinition } from './cron.types.js'
import { CRON_TASK_META, type CronTaskOptions } from './cron-task.decorator.js'

@Injectable()
export class CronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronService.name)
  private readonly handlers = new Map<string, CronHandler>()
  private readonly skipIfRunningSet = new Set<string>()
  private readonly definitions: CronTaskDefinition[] = []
  private initialized = false

  constructor(
    @InjectQueue(CRON_QUEUE) private readonly cronQueue: Queue,
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Register a cron task imperatively.
   * If called before `onModuleInit`, it is picked up by `syncSchedulers`.
   * If called after `onModuleInit`, the scheduler is upserted in BullMQ immediately.
   */
  register<TData = unknown, TResult = unknown>(
    definition: CronTaskDefinition<TData, TResult>,
  ): void {
    if (this.handlers.has(definition.name)) {
      throw new Error(`Cron task "${definition.name}" is already registered`)
    }
    this.handlers.set(definition.name, definition.handler as CronHandler)
    if (definition.skipIfRunning) this.skipIfRunningSet.add(definition.name)
    this.definitions.push(definition as CronTaskDefinition)

    if (this.initialized) {
      void this.upsertScheduler(definition as CronTaskDefinition)
    }
  }

  getHandler<TData = unknown, TResult = unknown>(
    name: string,
  ): CronHandler<TData, TResult> | undefined {
    return this.handlers.get(name) as CronHandler<TData, TResult> | undefined
  }

  shouldSkipIfRunning(name: string): boolean {
    return this.skipIfRunningSet.has(name)
  }

  async onModuleInit(): Promise<void> {
    this.discoverCronTasks()
    try {
      await this.syncSchedulers()
    } catch (err: unknown) {
      this.logger.error('Failed to sync cron schedulers on init', err)
    } finally {
      this.initialized = true
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.cronQueue.close()
  }

  /**
   * Remove specific cron tasks by name — deletes their schedulers and any
   * waiting/delayed jobs from Redis.
   */
  async purgeTasks(names: string[]): Promise<void> {
    const schedulers = await this.cronQueue.getJobSchedulers()
    for (const s of schedulers) {
      if (names.includes(s.name)) {
        try {
          await this.cronQueue.removeJobScheduler(s.key)
          this.logger.log(`Purged scheduler: ${s.name}`)
        } catch (err: unknown) {
          this.logger.error(`Failed to purge scheduler ${s.name}`, err)
        }
      }
    }

    const jobs = (await this.cronQueue.getJobs(['waiting', 'delayed'])) as Job[]
    for (const j of jobs) {
      if (!j) continue
      if (names.includes(j.name)) {
        try {
          await j.remove()
          this.logger.log(`Purged job: ${j.name} (id=${j.id})`)
        } catch (err: unknown) {
          this.logger.error(`Failed to purge job ${j.name}`, err)
        }
      }
    }
  }

  private discoverCronTasks(): void {
    const providers = this.discoveryService.getProviders()
    for (const wrapper of providers) {
      const instance: unknown = wrapper.instance
      if (!instance || typeof instance !== 'object') continue

      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>
      for (const key of Object.getOwnPropertyNames(prototype)) {
        if (key === 'constructor') continue

        const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
        if (!descriptor || typeof descriptor.value !== 'function') continue

        const meta = this.reflector.get<CronTaskOptions>(CRON_TASK_META, descriptor.value)
        if (!meta) continue

        const method = (instance as Record<string, unknown>)[key]
        if (typeof method !== 'function') continue
        this.register({
          name: meta.name,
          cron: meta.cron,
          handler: (job) => method.call(instance, job),
          skipIfRunning: meta.skipIfRunning,
          opts: meta.opts,
        })
      }
    }
  }

  /**
   * Synchronise repeatable job schedulers in Redis with the current definitions.
   * Removes stale schedulers no longer defined in code, then upserts all current ones.
   */
  private async syncSchedulers(): Promise<void> {
    const registeredNames = new Set(this.definitions.map((d) => d.name))

    const existing = await this.cronQueue.getJobSchedulers()
    for (const scheduler of existing) {
      if (!registeredNames.has(scheduler.name)) {
        try {
          await this.cronQueue.removeJobScheduler(scheduler.key)
          this.logger.log(
            `Removed stale cron scheduler: ${scheduler.name} (key=${scheduler.key})`,
          )
        } catch (err: unknown) {
          this.logger.error(`Failed to remove stale scheduler ${scheduler.name}`, err)
        }
      }
    }

    for (const def of this.definitions) {
      await this.upsertScheduler(def)
    }
  }

  private async upsertScheduler(def: CronTaskDefinition): Promise<void> {
    try {
      await this.cronQueue.upsertJobScheduler(
        def.name,
        { pattern: def.cron },
        {
          name: def.name,
          opts: {
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 100 },
            ...def.opts,
          },
        },
      )
      this.logger.log(`Cron task scheduled: "${def.name}" [${def.cron}]`)
    } catch (err: unknown) {
      this.logger.error(`Failed to schedule cron task "${def.name}"`, err)
    }
  }
}
