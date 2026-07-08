import type { BaseRecord, BaseResource } from '../adapters'
import type { ICacheProvider } from '../ports/cache-provider.js'
import type { CurrentAdmin } from '../ports/current-admin.js'
import type { ModernAdmin } from '../modern-admin.js'
import type { CacheRuntime } from './cache-runtime.js'

export type ActionType = 'resource' | 'record' | 'bulk'

export interface ActionGroup {
  name: string
  icon?: string
}

export type ActionNesting =
  | string
  | ActionGroup
  | ReadonlyArray<string | ActionGroup>

export const normalizeActionNesting = (
  nesting: ActionNesting | undefined,
): ActionGroup[] | undefined => {
  if (nesting === undefined) return undefined
  const items = Array.isArray(nesting) ? nesting : [nesting]
  if (items.length === 0) return undefined
  return items.map((item) =>
    typeof item === 'string'
      ? { name: item }
      : {
        name: item.name,
        ...(item.icon !== undefined ? { icon: item.icon } : {}),
      },
  )
}

export type BuiltInActionName =
  | 'list'
  | 'show'
  | 'new'
  | 'edit'
  | 'delete'
  | 'bulkDelete'
  | 'search'
  | 'values'

export interface ActionContext {
  /** Owning ModernAdmin instance — useful for cross-resource lookups. */
  admin: ModernAdmin
  resource: BaseResource
  /** Present for record actions. */
  record?: BaseRecord
  /** Present for bulk actions. */
  records?: BaseRecord[]
  action: ActionDescriptor
  currentAdmin?: CurrentAdmin
  cache: ICacheProvider
  /**
   * Shared read-through cache + in-flight dedup coordinator. Built-in
   * read actions (`list`, `show`, `search`) and the NestJS HTTP
   * interceptor route through this rather than touching `cache`
   * directly so they all observe the same coalescing semantics and
   * resource-level cache config.
   */
  cacheRuntime: CacheRuntime
  /** Free-form bag for hooks to share state. */
  [key: string]: unknown
}

export interface ActionRequest {
  params: {
    resourceId: string
    recordId?: string
    recordIds?: string
    action: string
    query?: string
    [key: string]: unknown
  }
  payload?: Record<string, unknown>
  query?: Record<string, unknown>
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /**
   * Free-form bag for transports to attach metadata that should travel
   * with the action through hooks (logging, history, webhooks) without
   * polluting the user-facing payload. Examples: revert `reason`, source
   * IP, request id. Persisted as-is by `actionLoggingPlugin` when present.
   */
  meta?: Record<string, unknown>
}

export interface ActionResponse {
  notice?: NoticeMessage
  redirectUrl?: string
  [key: string]: unknown
}

export interface RecordActionResponse extends ActionResponse {
  record: ReturnType<BaseRecord['toJSON']>
}

export interface BulkActionResponse extends ActionResponse {
  records: ReturnType<BaseRecord['toJSON']>[]
}

export interface ListActionResponse extends ActionResponse {
  records: ReturnType<BaseRecord['toJSON']>[]
  meta: {
    total: number
    page: number
    perPage: number
    direction?: 'asc' | 'desc'
    sortBy?: string
  }
}

export interface NoticeMessage {
  message: string
  type: 'success' | 'error' | 'info'
}

export type IsFunction = (context: ActionContext) => boolean | Promise<boolean>

export type ActionHandler<R extends ActionResponse> = (
  request: ActionRequest,
  context: ActionContext,
) => R | Promise<R>

export type Before = (
  request: ActionRequest,
  context: ActionContext,
) => ActionRequest | Promise<ActionRequest>

export type After<R extends ActionResponse> = (
  response: R,
  request: ActionRequest,
  context: ActionContext,
) => R | Promise<R>

/**
 * Static description of an action — what type, who can see it, what handler
 * to run. The action decorator wraps this and resolves dynamic flags at
 * request time.
 */
export interface Action<R extends ActionResponse = ActionResponse> {
  name: BuiltInActionName | string
  actionType: ActionType
  isVisible?: boolean | IsFunction
  isAccessible?: boolean | IsFunction
  nesting?: ActionNesting
  /** Optional confirmation guard message key (translated client-side). */
  guard?: string
  /** Component name registered via ComponentLoader for the UI. */
  component?: string | null
  handler: ActionHandler<R>
  before?: Before | Before[]
  after?: After<R> | After<R>[]
  /** Free-form custom payload passed through to the UI. */
  custom?: Record<string, unknown>
  /**
   * Declarative cache invalidation for custom mutating actions. After the
   * handler and after-hooks complete, `invoke()` drops the response caches
   * (list/search, record entries, HTTP) of the listed resources plus
   * everything that depends on them (populated references, m2m).
   *
   *   * `true`  → invalidate the action's own resource
   *   * `['a', 'b']` → invalidate resources `a` and `b` (in addition to
   *     nothing else — include the own resource id explicitly if needed)
   *
   * Built-in mutations (`new`/`edit`/`delete`/`bulkDelete`) invalidate
   * automatically and don't need this. Read-only custom actions should
   * omit it so their responses stay cacheable.
   */
  invalidates?: true | string[]
}

/**
 * Resolved action metadata returned from the decorator. Includes the owning
 * resource id so transports can identify the route.
 */
export interface ActionDescriptor {
  name: string
  actionType: ActionType
  resourceId: string
  nesting?: ActionGroup[]
  guard?: string
  component?: string | null
  custom?: Record<string, unknown>
}
