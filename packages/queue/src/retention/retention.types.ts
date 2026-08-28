import type { ActionLogRetention, HistoryRetention } from '@modern-admin/core'
import type { JobsOptions } from 'bullmq'

export interface PrunableStore<TRetention> {
  prune(retention: TRetention): Promise<number>
}

export interface HistoryRetentionTarget extends HistoryRetention {
  store: PrunableStore<HistoryRetention>
}

export interface AuditLogRetentionTarget extends ActionLogRetention {
  store: PrunableStore<ActionLogRetention>
}

export interface RetentionModuleOptions {
  /** BullMQ cron expression. Defaults to every day at 03:00 UTC. */
  cron?: string
  /** Revision-history retention. `keepLast` is evaluated per record. */
  history?: HistoryRetentionTarget
  /** Action-log retention. `keepLast` is evaluated globally. */
  auditLog?: AuditLogRetentionTarget
  /** BullMQ options for each scheduled maintenance job. */
  jobOptions?: Omit<JobsOptions, 'repeat'>
}

export interface RetentionRunResult {
  history?: number
  auditLog?: number
}
