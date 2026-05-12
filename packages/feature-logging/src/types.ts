/**
 * Local types for the action-logging plugin.
 *
 * The canonical home of the `ILogStore` port and `ActionLogEntry` row
 * shape is now `@modern-admin/core/system` so persistent adapters
 * (`@modern-admin/system-prisma`, `@modern-admin/system-drizzle`) and
 * this plugin all reach for the same source of truth. We re-export the
 * core symbols below so legacy imports of
 * `@modern-admin/feature-logging` keep working unchanged.
 */

export type { ActionLogEntry, ILogStore } from '@modern-admin/core'

import type { ActionLogEntry } from '@modern-admin/core'

/** Callback shorthand — used in place of an `ILogStore`. */
export type LogCallback = (entry: ActionLogEntry) => void | Promise<void>

/** Default action allowlist — every mutating built-in. */
export const DEFAULT_LOGGED_ACTIONS = ['new', 'edit', 'delete', 'bulkDelete'] as const

/** Options shared by both the local feature and the global plugin. */
export interface ActionLoggingOptions {
  /**
   * Where to send entries. Pass an `ILogStore`, a plain callback, or omit
   * for the default `ConsoleLogStore`.
   */
  store?: import('@modern-admin/core').ILogStore | LogCallback
  /**
   * Action names to log. Defaults to `['new','edit','delete','bulkDelete']`.
   * Pass `'*'` to log every action present on the resource (including
   * read-only ones like `list`/`show`).
   */
  actions?: string[] | '*'
  /** Attach `request.payload` to entries. Default `false`. */
  includePayload?: boolean
  /** Attach `response.record.params` to entries. Default `false`. */
  includeResult?: boolean
}

/** Options for the global plugin variant: adds resource-id filters. */
export interface ActionLoggingPluginOptions extends ActionLoggingOptions {
  /** Whitelist: only log these resource ids. Omit for all. */
  include?: string[]
  /** Blacklist: skip these resource ids. */
  exclude?: string[]
}
