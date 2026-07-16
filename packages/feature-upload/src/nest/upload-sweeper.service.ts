/**
 * UploadSweeperService — periodic background task that purges expired entries
 * from `PendingUploadsRegistry`.
 *
 * The interval starts when Nest calls `onModuleInit` and stops on
 * `onModuleDestroy`. Set `sweepIntervalMs: 0` in the module options to
 * disable scheduling (useful for tests that drive `sweep()` manually).
 *
 * TODO(roadmap): replace the in-process `setInterval` driver with a BullMQ
 * (Redis-backed) job queue. Reasons:
 *   - the registry will move to Redis in the multi-instance deployment story,
 *     and the sweeper job belongs in the same place;
 *   - BullMQ gives us cron scheduling, retries on transient storage errors,
 *     visibility/metrics through Bull Board, and crash safety (a process
 *     restart resumes scheduled sweeps instead of forgetting them);
 *   - per-key cancel can become a delayed job (`removeJob` on confirm) which
 *     is more efficient than a periodic full-table scan once we have many
 *     pending entries.
 * The migration should keep the same `PendingUploadsRegistry` API surface so
 * call sites (controller, hooks) do not need to change — only the storage
 * (Map → Redis) and the sweeper driver (setInterval → BullMQ Worker) flip.
 */

import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PendingUploadsRegistry } from '../pending-registry.js'
import { UPLOAD_MODULE_OPTIONS, type ModernAdminUploadModuleOptions } from './upload.tokens.js'

const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class UploadSweeperService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(@Inject(UPLOAD_MODULE_OPTIONS) private readonly options: ModernAdminUploadModuleOptions) {}

  onModuleInit(): void {
    const interval = this.options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
    if (interval <= 0) return
    if (!this.options.acknowledgeSingleInstance) {
      console.warn(
        '[modern-admin/feature-upload] The pending-upload registry and sweeper are ' +
          'in-process (single-instance). Behind a load balancer with ≥2 replicas the ' +
          'sweeper can delete a just-saved file (see PendingUploadsRegistry docs). ' +
          'Run single-instance until a shared store lands, or pass ' +
          '`acknowledgeSingleInstance: true` to silence this warning.',
      )
    }
    this.timer = setInterval(() => {
      void PendingUploadsRegistry.sweep()
    }, interval)
    // Allow the Node.js process to exit even if the timer is still scheduled.
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
