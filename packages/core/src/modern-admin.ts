import { BaseResource } from './adapters'
import { BUILT_IN_ACTIONS, type Action, type ActionContext, type ActionRequest, type ActionResponse, type After, type Before } from './actions'
import { ResourcesFactory, type Adapter, type ResourceWithOptions } from './factories/resources-factory.js'
import { ResourceNotFoundError, ActionNotFoundError, ForbiddenError } from './errors'
import { AnonymousAuthProvider, ComponentLoader, NoopCacheProvider, NoopRealtimeBus, type CurrentAdmin, type IAuthProvider, type ICacheProvider, type IComponentLoader, type IRealtimeBus, type RealtimeEvent } from './ports'
 
export interface ModernAdminOptions {
  databases?: unknown[]
  resources?: Array<unknown | ResourceWithOptions>
  adapters?: Adapter[]
  rootPath?: string
  branding?: {
    companyName?: string
    logo?: string
    theme?: string
  }
  auth?: IAuthProvider
  cache?: ICacheProvider
  componentLoader?: IComponentLoader
  realtime?: IRealtimeBus
}

/**
 * Top-level orchestrator. Holds adapters, resources, decorators, and shared
 * services (auth/cache/components). Transports (NestJS, GraphQL, etc.) read
 * from this instance to dispatch requests.
 */
export class ModernAdmin {
  public readonly resources: BaseResource[]
  public readonly auth: IAuthProvider
  public readonly cache: ICacheProvider
  public readonly componentLoader: IComponentLoader
  public readonly realtime: IRealtimeBus
  public readonly rootPath: string

  constructor(public readonly options: ModernAdminOptions = {}) {
    this.rootPath = options.rootPath ?? '/admin'
    this.auth = options.auth ?? new AnonymousAuthProvider()
    this.cache = options.cache ?? new NoopCacheProvider()
    this.componentLoader = options.componentLoader ?? new ComponentLoader()
    this.realtime = options.realtime ?? new NoopRealtimeBus()
    this.resources = ResourcesFactory.buildResources({
      databases: options.databases ?? [],
      resources: options.resources ?? [],
      adapters: options.adapters ?? [],
    })
  }

  findResource(id: string): BaseResource {
    const r = this.resources.find((res) => res.decorate().id === id)
    if (!r) throw new ResourceNotFoundError(id)
    return r
  }

  /**
   * Execute an action end-to-end: resolve the action, run access checks,
   * before-hooks, the handler, and after-hooks. Transports call this rather
   * than touching resources directly so they share the same hook semantics.
   */
  async invoke<R extends ActionResponse = ActionResponse>(
    request: ActionRequest,
    currentAdmin?: CurrentAdmin,
  ): Promise<R> {
    const resource = this.findResource(request.params.resourceId)
    const decorator = resource.decorate()
    const actionDecorator = decorator.getAction(request.params.action)
    if (!actionDecorator) {
      throw new ActionNotFoundError(request.params.action, decorator.id)
    }
    const context: ActionContext = {
      admin: this,
      resource,
      action: actionDecorator.toDescriptor(),
      cache: this.cache,
      ...(currentAdmin !== undefined ? { currentAdmin } : {}),
    }

    if (actionDecorator.actionType() === 'record') {
      const id = request.params.recordId
      if (id) {
        const record = await resource.findOne(id)
        if (record) context.record = record
      }
    } else if (actionDecorator.actionType() === 'bulk') {
      const ids = (request.params.recordIds ?? '').split(',').filter(Boolean)
      if (ids.length > 0) {
        context.records = await resource.findMany(ids)
      }
    }

    if (!(await actionDecorator.isAccessible(context))) {
      throw new ForbiddenError(`Action "${actionDecorator.name()}" is not accessible`)
    }

    const action = actionDecorator.merged as unknown as Action<R>
    let req = request
    if (action.before) {
      const hooks = Array.isArray(action.before) ? action.before : [action.before]
      for (const fn of hooks as Before[]) {
        req = await fn(req, context)
      }
    }
    let response = await action.handler(req, context)
    if (action.after) {
      const hooks = Array.isArray(action.after) ? action.after : [action.after]
      for (const fn of hooks as After<R>[]) {
        response = await fn(response, req, context)
      }
    }
    await this.emitMutationEvents(actionDecorator.name(), response, request, context)
    return response
  }

  /**
   * Map mutation actions onto realtime bus events. Runs after-hooks have
   * already applied so the published record reflects the final state. Errors
   * from the bus are swallowed to keep the action result the source of truth.
   */
  private async emitMutationEvents(
    actionName: string,
    response: ActionResponse,
    request: ActionRequest,
    context: ActionContext,
  ): Promise<void> {
    const events: RealtimeEvent[] = []
    const resourceId = context.resource.decorate().id
    const actorId = context.currentAdmin?.id ? String(context.currentAdmin.id) : undefined
    const at = Date.now()
    const recordResponse = response as { record?: { id?: string; params?: Record<string, unknown> } }
    const recordId = recordResponse.record?.id ?? request.params.recordId
    const params = recordResponse.record?.params

    if (actionName === 'new') {
      events.push({ kind: 'created', resourceId, at, ...(recordId ? { recordId } : {}), ...(params ? { record: params } : {}), ...(actorId ? { actorId } : {}) })
    } else if (actionName === 'edit') {
      events.push({ kind: 'updated', resourceId, at, ...(recordId ? { recordId } : {}), ...(params ? { record: params } : {}), ...(actorId ? { actorId } : {}) })
    } else if (actionName === 'delete' && recordId) {
      events.push({ kind: 'deleted', resourceId, recordId, at, ...(actorId ? { actorId } : {}) })
    } else if (actionName === 'bulkDelete') {
      const ids = (request.params.recordIds ?? '').split(',').filter(Boolean)
      for (const id of ids) {
        events.push({ kind: 'deleted', resourceId, recordId: id, at, ...(actorId ? { actorId } : {}) })
      }
    }

    for (const event of events) {
      try {
        await this.realtime.publish(event)
      } catch {
        // bus failures must not break the action result.
      }
    }
  }

  /** Public config snapshot — what UI/transports expose to the browser. */
  toJSON(): {
    rootPath: string
    branding: ModernAdminOptions['branding']
    auth: Record<string, unknown>
    resources: Array<ReturnType<BaseResource['decorate']> extends infer T ? T extends { toJSON: () => infer U } ? U : never : never>
  } {
    return {
      rootPath: this.rootPath,
      branding: this.options.branding,
      auth: this.auth.getUiProps(),
      resources: this.resources.map((r) => r.decorate().toJSON()),
    } as ReturnType<ModernAdmin['toJSON']>
  }
}

export const ACTIONS = BUILT_IN_ACTIONS
