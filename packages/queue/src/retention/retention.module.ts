import { type DynamicModule, Module } from '@nestjs/common'
import { CronModule } from '../cron/cron.module.js'
import { RetentionService } from './retention.service.js'
import { RETENTION_OPTIONS } from './retention.tokens.js'
import type { RetentionModuleOptions } from './retention.types.js'

const assertBound = (name: string, value: number | undefined): void => {
  if (value === undefined) return
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}

const validateOptions = (options: RetentionModuleOptions): void => {
  if (options.cron !== undefined && options.cron.trim().length === 0) {
    throw new Error('retention cron must not be empty')
  }
  assertBound('history.keepLast', options.history?.keepLast)
  assertBound('history.keepDays', options.history?.keepDays)
  assertBound('auditLog.keepLast', options.auditLog?.keepLast)
  assertBound('auditLog.keepDays', options.auditLog?.keepDays)
}

/**
 * Schedules history and action-log pruning as a durable BullMQ cron task.
 * Requires `QueueModule.forRoot()` in the host application's root module.
 */
@Module({})
export class RetentionModule {
  static forRoot(options: RetentionModuleOptions): DynamicModule {
    validateOptions(options)
    return {
      module: RetentionModule,
      imports: [CronModule],
      providers: [{ provide: RETENTION_OPTIONS, useValue: options }, RetentionService],
      exports: [RetentionService],
    }
  }
}
