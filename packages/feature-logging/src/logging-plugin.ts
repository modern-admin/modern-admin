/**
 * `actionLoggingPlugin` — process-wide variant of `actionLoggingFeature`.
 *
 * Returns a `GlobalPlugin` registered once via `ModernAdminOptions.plugins`,
 * which fans the same logging hooks out across **every** resource the admin
 * instance manages. Use `include` / `exclude` to scope it.
 *
 * @example
 * new ModernAdmin({
 *   adapters: [...],
 *   resources: [...],
 *   plugins: [
 *     actionLoggingPlugin({
 *       store: new MemoryLogStore(),
 *       includePayload: true,
 *       exclude: ['health-check'],   // skip noisy resources
 *     }),
 *   ],
 * })
 */

import type { GlobalPlugin } from '@modern-admin/core'
import { actionLoggingFeature } from './logging-feature.js'
import type { ActionLoggingPluginOptions } from './types.js'

export function actionLoggingPlugin(options: ActionLoggingPluginOptions = {}): GlobalPlugin {
  // Reuse the local feature so behaviour stays identical between scopes.
  const { include, exclude, ...featureOptions } = options
  const feature = actionLoggingFeature(featureOptions)
  return {
    name: 'action-logging',
    ...(include !== undefined ? { include } : {}),
    ...(exclude !== undefined ? { exclude } : {}),
    apply: (resourceOptions) => feature(resourceOptions),
  }
}
