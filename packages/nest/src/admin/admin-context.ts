// Strongly-typed context surface that controller methods receive.
// The scanner builds this from the core ActionRequest + ActionContext
// before invoking the user method, so subclasses get IDE-friendly access
// to payload / query / record without poking into request internals.

import type {
  ActionContext,
  ActionRequest,
  ActionResponse,
  BaseRecord,
  BaseResource,
  CurrentAdmin,
  ICacheProvider,
  ListActionResponse,
  ModernAdmin,
  RecordActionResponse,
  BulkActionResponse,
} from '@modern-admin/core'

/**
 * Generic typed context passed into every controller method (built-in
 * overrides, custom @Action handlers, @Before / @After hooks).
 *
 * `TRow` describes the underlying row shape; it flows into `payload`
 * (create/edit) and into `record.params` consumers cast at use site.
 */
export interface AdminActionContext<
  TRow extends object = Record<string, unknown>,
  TPayload = Partial<TRow>,
  TQuery extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The owning ModernAdmin instance. Use to call sibling resources. */
  admin: ModernAdmin
  /** The decorated resource the controller is bound to. */
  resource: BaseResource
  /** Present for record actions (show/edit/delete and any custom 'record' action). */
  record?: BaseRecord
  /** Present for bulk actions. */
  records?: BaseRecord[]
  /** Authenticated admin (when an auth provider is configured). */
  currentAdmin?: CurrentAdmin
  /** Mutable copy of the request payload, narrowed to Partial<TRow>. */
  payload: TPayload
  /** Mutable copy of the request query string. */
  query: TQuery
  /** Raw route params (resourceId, recordId, action, …). */
  params: ActionRequest['params']
  /** Shared cache provider. */
  cache: ICacheProvider
  /** Original request — escape hatch when typed surface is too narrow. */
  request: ActionRequest
  /** Original core context — for advanced use (e.g. bag for hook coordination). */
  core: ActionContext
}

export type ListContext<TRow extends object = Record<string, unknown>> = AdminActionContext<TRow>
export type ShowContext<TRow extends object = Record<string, unknown>> =
  AdminActionContext<TRow> & { record: BaseRecord }
export type NewContext<TRow extends object = Record<string, unknown>> = AdminActionContext<TRow>
export type EditContext<TRow extends object = Record<string, unknown>> =
  AdminActionContext<TRow> & { record: BaseRecord }
export type DeleteContext<TRow extends object = Record<string, unknown>> =
  AdminActionContext<TRow> & { record: BaseRecord }
export type BulkDeleteContext<TRow extends object = Record<string, unknown>> =
  AdminActionContext<TRow> & { records: BaseRecord[] }
export type SearchContext<TRow extends object = Record<string, unknown>> = AdminActionContext<TRow>

export type {
  ActionResponse,
  ListActionResponse,
  RecordActionResponse,
  BulkActionResponse,
}
