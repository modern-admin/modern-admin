import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import type { ActionLogRetention, HistoryRetention } from '@modern-admin/core'
import { CronService } from '../cron/cron.service.js'
import { DEFAULT_RETENTION_CRON, SYSTEM_RETENTION_TASK } from './retention.constants.js'
import { RETENTION_OPTIONS } from './retention.tokens.js'
import type {
  AuditLogRetentionTarget,
  HistoryRetentionTarget,
  RetentionModuleOptions,
  RetentionRunResult,
} from './retention.types.js'

const hasBounds = (retention: { keepLast?: number; keepDays?: number }): boolean =>
  retention.keepLast !== undefined || retention.keepDays !== undefined

@Injectable()
export class RetentionService implements OnModuleInit {
  constructor(
    @Inject(RETENTION_OPTIONS) private readonly options: RetentionModuleOptions,
    private readonly cron: CronService,
  ) {}

  onModuleInit(): void {
    if (!this.hasWork()) return

    this.cron.register({
      name: SYSTEM_RETENTION_TASK,
      cron: this.options.cron ?? DEFAULT_RETENTION_CRON,
      skipIfRunning: true,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        ...this.options.jobOptions,
      },
      handler: () => this.run(),
    })
  }

  /** Execute every configured retention target. Called by the BullMQ worker. */
  async run(): Promise<RetentionRunResult> {
    const result: RetentionRunResult = {}
    const failures: unknown[] = []

    if (this.options.history && hasBounds(this.options.history)) {
      try {
        result.history = await this.pruneHistory(this.options.history)
      } catch (err: unknown) {
        failures.push(err)
      }
    }
    if (this.options.auditLog && hasBounds(this.options.auditLog)) {
      try {
        result.auditLog = await this.pruneAuditLog(this.options.auditLog)
      } catch (err: unknown) {
        failures.push(err)
      }
    }

    if (failures.length === 1) {
      throw failures[0]
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple retention targets failed')
    }

    return result
  }

  private hasWork(): boolean {
    return Boolean(
      (this.options.history && hasBounds(this.options.history))
      || (this.options.auditLog && hasBounds(this.options.auditLog)),
    )
  }

  private pruneHistory(target: HistoryRetentionTarget): Promise<number> {
    const retention: HistoryRetention = {
      ...(target.keepLast !== undefined ? { keepLast: target.keepLast } : {}),
      ...(target.keepDays !== undefined ? { keepDays: target.keepDays } : {}),
    }
    return target.store.prune(retention)
  }

  private pruneAuditLog(target: AuditLogRetentionTarget): Promise<number> {
    const retention: ActionLogRetention = {
      ...(target.keepLast !== undefined ? { keepLast: target.keepLast } : {}),
      ...(target.keepDays !== undefined ? { keepDays: target.keepDays } : {}),
    }
    return target.store.prune(retention)
  }
}
