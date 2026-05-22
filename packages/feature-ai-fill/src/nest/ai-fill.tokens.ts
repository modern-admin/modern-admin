/**
 * DI tokens + option types for `ModernAdminAiFillModule`.
 */

export const AI_FILL_MODULE_OPTIONS = Symbol.for('modern-admin.ai-fill.module-options')

export interface AiFillThrottleOptions {
  /**
   * Time window in milliseconds.
   * @default 60_000 (1 minute)
   */
  ttl?: number
  /**
   * Maximum requests per principal per window.
   * @default 5
   */
  limit?: number
}

export interface ModernAdminAiFillModuleOptions {
  /** Mark this module as global. Defaults to false. */
  global?: boolean
  /**
   * Maximum image size accepted by the controller, in bytes. Larger uploads
   * are rejected before being sent to the model.
   *
   * @default 10 MB
   */
  maxImageBytes?: number
  /**
   * Fallback OpenRouter model used when the resource's `aiFillFeature` did
   * not declare its own override and no stored AI-assistant settings model
   * has been saved by the admin. Defaults to a widely-available vision model.
   *
   * @default 'google/gemini-3.1-flash-lite-preview'
   */
  defaultModel?: string
  /**
   * Override the OpenRouter API key resolution. By default the controller
   * reads the same `modern-admin.ai-assistant` settings blob that powers the
   * AI assistant (via the `configStore` configured on the root admin module).
   * Provide this to short-circuit that lookup.
   */
  apiKey?: string
  /**
   * Caller identification forwarded to OpenRouter for usage analytics.
   */
  appName?: string
  /** Public URL for OpenRouter usage metadata. */
  appUrl?: string
  /**
   * Per-user rate limit applied to the `/ai-fill` endpoint.
   * Pass `false` to disable throttling entirely (e.g. in tests).
   *
   * @default { ttl: 60_000, limit: 5 }
   */
  throttle?: AiFillThrottleOptions | false
}
