// @modern-admin/queue — BullMQ queue + cron scheduling for NestJS.

export { QueueModule } from './queue.module.js'
export type { QueueModuleOptions, QueueRootOptions } from './queue.types.js'

export {
  CronModule,
  CronService,
  CronProcessor,
  CronTask,
  CRON_TASK_META,
  CRON_QUEUE,
  CRON_LOCK_PREFIX,
  DEFAULT_CRON_WORKER_CONCURRENCY,
  DEFAULT_CRON_LOCK_TTL,
  type CronTaskOptions,
  type CronHandler,
  type CronTaskDefinition,
} from './cron'

export {
  RetentionModule,
  RetentionService,
  RETENTION_OPTIONS,
  DEFAULT_RETENTION_CRON,
  SYSTEM_RETENTION_TASK,
  type AuditLogRetentionTarget,
  type HistoryRetentionTarget,
  type PrunableStore,
  type RetentionModuleOptions,
  type RetentionRunResult,
} from './retention'
