/**
 * Process-level upload provider registry.
 *
 * `uploadFeature()` registers upload configs here (keyed by a generated id) at
 * feature application time. The NestJS `UploadController` looks up configs by
 * the id stored in the property's `custom.uploadProviderId` field.
 *
 * The registry is intentionally a module-level singleton so it is available
 * before the NestJS DI container is initialised — the same pattern used by
 * `ModernAdminFeatureRegistry` in `@modern-admin/nest`.
 */

import type { IUploadProvider } from './types.js'

/** Everything stored per upload property registration. */
export interface RegisteredUploadConfig {
  provider: IUploadProvider
  /** Optional custom key generator (from `UploadPropertyConfig.uploadPath`). */
  uploadPath?: (filename: string) => string
  /** True for multi-file properties — controller will accept N files per request. */
  isArray?: boolean
  /**
   * Allowed MIME patterns (HTML `accept` syntax). Enforced server-side by the
   * upload controller / GraphQL resolver — a request whose file declares a
   * non-matching type is rejected. `undefined`/empty means no restriction.
   */
  mimeTypes?: string[]
  /** Maximum accepted file size in bytes. Enforced server-side (per file). */
  maxSize?: number
}

const _registry = new Map<string, RegisteredUploadConfig>()

export const UploadProviderRegistry = {
  register(id: string, config: RegisteredUploadConfig): void {
    _registry.set(id, config)
  },

  get(id: string): RegisteredUploadConfig | undefined {
    return _registry.get(id)
  },

  /** For test cleanup. */
  clear(): void {
    _registry.clear()
  },
}
