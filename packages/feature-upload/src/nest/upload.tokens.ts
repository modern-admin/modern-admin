/**
 * DI tokens + option types shared between `ModernAdminUploadModule`,
 * `UploadController`, and the sweeper service.
 */

export const UPLOAD_MODULE_OPTIONS = Symbol.for('modern-admin.upload.module-options')

export interface ModernAdminUploadModuleOptions {
  /** Mark this module as global. Defaults to false. */
  global?: boolean
  /**
   * TTL applied to freshly uploaded files before the sweeper deletes them.
   * Default: 1 hour.  Files are confirmed (TTL becomes irrelevant) as soon
   * as the parent record is saved, via the action hooks installed by
   * `uploadFeature`.
   */
  pendingTtlMs?: number
  /**
   * Interval at which the sweeper runs. Default: 5 minutes.  Set to `0` to
   * disable the periodic sweeper entirely (the registry still works — entries
   * just never expire).
   */
  sweepIntervalMs?: number
}
