import type { Job, JobsOptions } from 'bullmq'

export type CronHandler<TData = unknown, TResult = unknown> = (
  job: Job<TData, TResult, string>,
) => Promise<TResult> | TResult

export interface CronTaskDefinition<TData = unknown, TResult = unknown> {
  name: string
  cron: string
  handler: CronHandler<TData, TResult>
  skipIfRunning?: boolean
  opts?: Omit<JobsOptions, 'repeat'>
}
