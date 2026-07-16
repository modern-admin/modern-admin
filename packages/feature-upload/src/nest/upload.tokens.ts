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
  /**
   * Hard upper bound (bytes) on a single uploaded file, applied by the
   * multipart parser regardless of per-property `maxSize`. Files are buffered
   * in memory, so this caps memory use per request and blocks OOM-style DoS.
   * A property's own `maxSize` still applies when it is *smaller* than this.
   * Default: 25 MiB.
   */
  maxFileSize?: number
  /**
   * Maximum number of files accepted in a single multipart request for an
   * `isArray` property. Single-value properties always cap at 1. Default: 20.
   */
  maxFiles?: number
  /**
   * Suppress the single-instance startup warning.
   *
   * `PendingUploadsRegistry` is an in-process `Map`: behind a load balancer
   * with ≥2 replicas the confirm/sweeper lifecycle can delete a just-saved
   * file (see the class docs). The sweeper logs a warning once at startup to
   * make this loud. Set `true` once you have confirmed a single-instance
   * deployment (or accepted the risk) to silence it.
   */
  acknowledgeSingleInstance?: boolean
}
