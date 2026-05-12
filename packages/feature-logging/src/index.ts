// @modern-admin/feature-logging — action logging plugin for modern-admin.
//
// Two scopes:
//   - actionLoggingFeature(options) → FeatureFn: per-resource (like uploadFeature)
//   - actionLoggingPlugin(options) → GlobalPlugin: registered once for all resources

export { actionLoggingFeature } from './logging-feature.js'
export { actionLoggingPlugin } from './logging-plugin.js'
export { ConsoleLogStore, MemoryLogStore } from './stores.js'
export type {
  ActionLogEntry,
  ActionLoggingOptions,
  ActionLoggingPluginOptions,
  ILogStore,
  LogCallback,
} from './types.js'
