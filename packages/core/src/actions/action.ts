import type { BaseRecord, BaseResource } from '../adapters'
import type { ICacheProvider } from '../ports/cache-provider.js'
import type { CurrentAdmin } from '../ports/current-admin.js'
import type { ModernAdmin } from '../modern-admin.js'

export type ActionType = 'resource' | 'record' | 'bulk'

export type BuiltInActionName =
  | 'list'
  | 'show'
  | 'new'
  | 'edit'
  | 'delete'
  | 'bulkDelete'
  | 'search'

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
  /** Optional confirmation guard message key (translated client-side). */
  guard?: string
  /** Component name registered via ComponentLoader for the UI. */
  component?: string | null
  handler: ActionHandler<R>
  before?: Before | Before[]
  after?: After<R> | After<R>[]
  /** Free-form custom payload passed through to the UI. */
  custom?: Record<string, unknown>
}

/**
 * Resolved action metadata returned from the decorator. Includes the owning
 * resource id so transports can identify the route.
 */
export interface ActionDescriptor {
  name: string
  actionType: ActionType
  resourceId: string
  guard?: string
  component?: string | null
  custom?: Record<string, unknown>
}
