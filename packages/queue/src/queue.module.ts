import { type DynamicModule, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import type { QueueModuleOptions, QueueRootOptions } from './queue.types.js'

/**
 * BullMQ integration module for modern-admin NestJS applications.
 *
 * 1. Call `QueueModule.forRoot()` once in the root AppModule to configure the
 *    Redis connection globally.
 * 2. Call `QueueModule.register({ queues: [...] })` in any feature module to
 *    register named queues and make their injection tokens available.
 *
 * @example
 * // AppModule
 * imports: [
 *   QueueModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
 *   QueueModule.register({ queues: ['emails', 'exports'] }),
 *   CronModule,
 * ]
 */
@Module({})
export class QueueModule {
  /**
   * Configure the BullMQ Redis connection for the whole application.
   * Must be imported once at the root level before any `register()` call.
   */
  static forRoot(options: QueueRootOptions): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRoot({
          connection: options.connection as object,
          defaultJobOptions: options.defaultJobOptions,
        }),
      ],
    }
  }

  /**
   * Async variant of `forRoot` — useful when the Redis URL comes from a
   * config service or environment variable loaded at runtime.
   *
   * @example
   * QueueModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (cfg: ConfigService) => ({
   *     connection: cfg.get('REDIS_URL'),
   *   }),
   * })
   */
  static forRootAsync(opts: {
    imports?: DynamicModule['imports']
    inject?: unknown[]
    useFactory: (...args: unknown[]) => QueueRootOptions | Promise<QueueRootOptions>
  }): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRootAsync({
          imports: opts.imports,
          inject: opts.inject as never[],
          useFactory: async (...args: unknown[]) => {
            const resolved = await opts.useFactory(...args)
            return {
              connection: resolved.connection as object,
              defaultJobOptions: resolved.defaultJobOptions,
            }
          },
        }),
      ],
    }
  }

  /**
   * Register named queues (and optional flow producers) in the current module.
   * Exports the BullMQ tokens so they can be injected via `@InjectQueue(name)`.
   */
  static register(options: QueueModuleOptions): DynamicModule {
    const queueModules = options.queues.map((name) =>
      BullModule.registerQueue({ name }),
    )
    const flowModules = (options.flows ?? []).map((name) =>
      BullModule.registerFlowProducer({ name }),
    )
    return {
      module: QueueModule,
      imports: [...queueModules, ...flowModules],
      exports: [...queueModules, ...flowModules],
    }
  }
}
