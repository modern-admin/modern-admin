import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { QueueModule } from '../queue.module.js'
import { CRON_QUEUE } from './cron.constants.js'
import { CronService } from './cron.service.js'
import { CronProcessor } from './cron.processor.js'

/**
 * Global module that enables BullMQ-backed cron scheduling.
 *
 * Provides:
 * - `CronService` — register tasks imperatively or via `@CronTask` decorator
 * - `CronProcessor` — BullMQ worker that dispatches jobs to their handlers
 *
 * Requires `QueueModule.forRoot()` to be imported in the root module.
 *
 * @example
 * // AppModule
 * imports: [
 *   QueueModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
 *   CronModule,
 * ]
 */
@Global()
@Module({
  imports: [
    DiscoveryModule,
    QueueModule.register({ queues: [CRON_QUEUE] }),
  ],
  providers: [CronService, CronProcessor],
  exports: [CronService],
})
export class CronModule {}
