// Abstract base class every admin resource controller extends.
//
// Subclasses are tagged with @AdminResource, get instantiated by Nest DI,
// and are discovered at bootstrap by AdminControllerScanner. The scanner
// replaces the abstract delegates below with handlers that route through
// the user's overridden methods (or the default built-ins if not
// overridden).
//
// Provided methods correspond 1:1 to the seven core built-in actions and
// delegate to the matching core handler when called. Subclasses override
// any of them to inject custom behaviour and may invoke `super.<method>()`
// to chain into the default implementation.

import {
  bulkDeleteAction,
  deleteAction,
  editAction,
  listAction,
  newAction,
  searchAction,
  showAction,
  type BaseResource,
  type ModernAdmin,
} from '@modern-admin/core'
import type {
  AdminActionContext,
  ActionResponse,
  BulkDeleteContext,
  DeleteContext,
  EditContext,
  ListActionResponse,
  ListContext,
  NewContext,
  RecordActionResponse,
  SearchContext,
  ShowContext,
} from './admin-context.js'

// Fall-through helper: bridge AdminActionContext -> core (request, context)
// pair expected by built-in handlers. We reconstruct request from the
// (possibly mutated) typed context, while reusing the original ActionContext.
const dispatch = <R extends ActionResponse>(
  handler: (req: never, ctx: never) => R | Promise<R>,
  ctx: AdminActionContext,
): Promise<R> => {
  const request = {
    ...ctx.request,
    payload: ctx.payload as Record<string, unknown>,
    query: ctx.query,
  }
  return Promise.resolve(handler(request as never, ctx.core as never))
}

/**
 * Generic base for all admin controllers. `TRow` describes the underlying
 * row shape; it flows into typed payload / record helpers.
 */
export abstract class AdminController<
  TRow extends object = Record<string, unknown>,
> {
  /** Wired by the scanner before any method is invoked. */
  public admin!: ModernAdmin
  /** Wired by the scanner once the resource has been built. */
  public resource!: BaseResource

  // The seven built-in actions, exposed as protected typed methods.
  // Subclasses override any of them to customise behaviour.

  async list(ctx: ListContext<TRow>): Promise<ListActionResponse> {
    return dispatch<ListActionResponse>(
      listAction.handler as never,
      ctx,
    )
  }

  async show(ctx: ShowContext<TRow>): Promise<RecordActionResponse> {
    return dispatch<RecordActionResponse>(
      showAction.handler as never,
      ctx,
    )
  }

  async new(ctx: NewContext<TRow>): Promise<RecordActionResponse> {
    return dispatch<RecordActionResponse>(
      newAction.handler as never,
      ctx,
    )
  }

  async edit(ctx: EditContext<TRow>): Promise<RecordActionResponse> {
    return dispatch<RecordActionResponse>(
      editAction.handler as never,
      ctx,
    )
  }

  async delete(ctx: DeleteContext<TRow>): Promise<RecordActionResponse> {
    return dispatch<RecordActionResponse>(
      deleteAction.handler as never,
      ctx,
    )
  }

  async bulkDelete(ctx: BulkDeleteContext<TRow>): Promise<ActionResponse> {
    return dispatch<ActionResponse>(
      bulkDeleteAction.handler as never,
      ctx,
    )
  }

  async search(ctx: SearchContext<TRow>): Promise<ActionResponse> {
    return dispatch<ActionResponse>(
      searchAction.handler as never,
      ctx,
    )
  }
}

export type AdminControllerClass<TRow extends object = Record<string, unknown>> =
  new (...args: never[]) => AdminController<TRow>
