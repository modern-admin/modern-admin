import { SetMetadata } from '@nestjs/common'
import type { JobsOptions } from 'bullmq'

export const CRON_TASK_META = 'MODERN_ADMIN_CRON_TASK_META'

export interface CronTaskOptions {
  /** Unique task name — used as the BullMQ job scheduler key. */
  name: string
  /** Cron expression, e.g. `"0 8 * * *"` for every day at 08:00 UTC. */
  cron: string
  /**
   * When `true`, a distributed Redis lock is acquired before the handler runs.
   * If the previous execution is still active, the new invocation is skipped.
   */
  skipIfRunning?: boolean
  /** Extra BullMQ job options (excluding `repeat` which is controlled by `cron`). */
  opts?: Omit<JobsOptions, 'repeat'>
}

/**
 * Marks a service method as a BullMQ-backed cron task.
 * The `CronService` discovers all decorated methods automatically on module init.
 *
 * @example
 * @Injectable()
 * export class ReportService {
 *   @CronTask({ name: 'daily-report', cron: '0 8 * * *' })
 *   async run(job: Job) {
 *     // ...
 *   }
 * }
 */
export const CronTask = (options: CronTaskOptions): MethodDecorator =>
  SetMetadata(CRON_TASK_META, options)
