import { type BaseResource, type ParamsType, type RecordJSON } from './adapters'
import { BUILT_IN_ACTIONS, CacheRuntime, listTag, recordTag, recordsTag, type Action, type ActionContext, type ActionRequest, type ActionResponse, type After, type Before } from './actions'
import type { ResourceDecorator, ResourceJSON } from './decorators/resource-decorator.js'
import type { ActionDecorator } from './decorators/action-decorator.js'
import { ResourcesFactory, type Adapter, type GlobalPlugin, type ResourceWithOptions } from './factories/resources-factory.js'
import { ResourceNotFoundError, ActionNotFoundError, ForbiddenError } from './errors'
import { flatten, unflatten } from './utils/flat.js'

export interface RegisterResourcesArgs {
  databases?: unknown[]
  resources?: Array<unknown | ResourceWithOptions>
  /** Defaults to adapters passed at construction time. */
  adapters?: Adapter[]
  /** Defaults to plugins passed at construction time. */
  plugins?: GlobalPlugin[]
}
import { AnonymousAuthProvider, ComponentLoader, CrossInstanceCacheProvider, NoopCacheProvider, NoopRealtimeBus, withCrossInstanceInvalidation, type CurrentAdmin, type IAuthProvider, type ICacheProvider, type IComponentLoader, type IRealtimeBus, type RealtimeEvent } from './ports'
import { setActiveFeatureFlags } from './feature-flags.js'

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
  /**
   * Cross-cutting plugins applied to **every** registered resource (subject
   * to each plugin's `include`/`exclude` filter). Use for audit logs,
   * logging, observability, etc. Per-resource plugins go in
   * `ResourceWithOptions.features`.
   */
  plugins?: GlobalPlugin[]
  /**
   * Resource id whose rows store admin role definitions. When set,
   * `invoke()` looks up the principal's `role` in that resource and
   * gates the requested action against the row's `permissions` field
   * (shape: `Record<resourceId, action[]>`, `'*'` is a wildcard).
   *
   * The resource is expected to expose at least an `id` property and a
   * `permissions` property (JSON). The reference apps in this repo wire
   * `'roles'` against `MaRole` (Prisma) or a standalone in-memory table.
   *
   * If unset, role-based gating is a no-op — the only access check is
   * the api-key gate (when the principal carries an `apiKey` claim) plus
   * any `isAccessible` overrides on individual actions.
   */
  rolesResourceId?: string
  /**
   * Capability flags surfaced to the SPA via `toJSON()`. Transports populate
   * this from the runtime configuration of optional subsystems (history
   * store, log store, webhook store, api-key service, AI assistant…). The
   * frontend uses the flags to hide navigation entries, settings sections,
   * and per-record controls for features that aren't wired up, so it never
   * issues requests that would 501/404 nor renders dead UI surfaces.
   *
   * When unset, every flag defaults to `false` — the SPA renders the bare
   * minimum (resources only) and skips every optional feature.
   */
  features?: Partial<AdminFeatures>
  /**
   * Explicit opt-in list of commercial feature flags to activate
   * (e.g. `['ai-fill', 'webhooks']`). Pro-tier packages
   * (`@modern-admin-pro/*`) only wire themselves up when their feature is
   * present here — independent of whether a valid license is detected.
   *
   * Activation is a two-layer check:
   *   1. the Pro package's own license-gate confirms a valid license that
   *      covers the feature (logs a warn + becomes a no-op otherwise);
   *   2. the orchestrator registers `featureFlags` here, and Pro plugins
   *      consult the global registry via `isFeatureActive(name)`.
   *
   * Listing a flag without a valid license still results in a no-op (the
   * license check inside the Pro package wins). Listing nothing keeps
   * every commercial plugin dormant even when its package is imported.
   */
  featureFlags?: string[]
}

/**
 * Per-role permission grant: keys are resource ids (or `'*'` to match
 * every resource), values are arrays of action names (or `['*']` to
 * match every action). Mirrors the api-key permission model exactly so
 * the same matrix UI/seed format works for both.
 */
export type RolePermissions = Record<string, string[]>

/**
 * Runtime capability flags advertised to the SPA. Each flag is `true` iff
 * the corresponding backend subsystem is wired and ready to serve
 * requests. The SPA reads these to gate optional UI surfaces.
 */
export interface AdminFeatures {
  /** Audit log page + sidebar entry. Backed by `logStore`. */
  auditLog: boolean
  /** Per-record revisions sheet. Backed by `historyStore`. */
  history: boolean
  /** Settings → Webhooks section. Backed by `webhookStore`. */
  webhooks: boolean
  /** Settings → API Keys section. Backed by `apiKeyService`. */
  apiKeys: boolean
  /** AI assistant floating widget + Settings section. Backed by `aiAssistant` options. */
  aiAssistant: boolean
  /** Realtime WebSocket gateway (`@modern-admin/realtime`). When true the
   *  SPA connects to it and live-invalidates its query cache on mutation
   *  events from other sessions/instances. */
  realtime: boolean
}

const ALL_FEATURES_OFF: AdminFeatures = {
  auditLog: false,
  history: false,
  webhooks: false,
  apiKeys: false,
  aiAssistant: false,
  realtime: false,
}

const resolveFeatures = (options?: Partial<AdminFeatures>): AdminFeatures => ({
  ...ALL_FEATURES_OFF,
  ...(options ?? {}),
})

export interface ModernAdminJSON {
  rootPath: string
  branding: ModernAdminOptions['branding']
  auth: Record<string, unknown>
  resources: ResourceJSON[]
  features: AdminFeatures
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
  public readonly cacheRuntime: CacheRuntime
  public readonly componentLoader: IComponentLoader
  public readonly realtime: IRealtimeBus
  public readonly rootPath: string

  /**
   * Process-local cache of role permissions keyed by role name. Filled on
   * first lookup, cleared whenever the configured `rolesResourceId` is
   * mutated (see `emitMutationEvents`). A null entry caches "role not
   * found" to avoid repeated misses for unknown role strings.
   */
  private readonly rolePermsCache = new Map<string, RolePermissions | null>()

  /**
   * Reverse cache-dependency map: for resource B, the set of resources
   * whose cached responses embed B's data and therefore go stale when B
   * mutates. Sources:
   *
   *   * scalar reference properties — `list` batch-populates referenced
   *     records into the response (`populateReferences`),
   *   * m2m properties — read hooks hydrate reference + junction rows
   *     into both list and show responses (dependency on the reference
   *     resource comes from the property's `reference()`, on the junction
   *     from `custom().m2m.through`).
   *
   * Built lazily, reset when `registerResources` adds resources.
   */
  private cacheDependents: Map<string, Set<string>> | null = null

  constructor(public readonly options: ModernAdminOptions = {}) {
    // Publish the opted-in commercial feature flags into the process-global
    // registry before resources are built. Pro plugins read the registry
    // during their feature-factory / plugin-apply invocations triggered by
    // `ResourcesFactory.buildResources` below.
    setActiveFeatureFlags(options.featureFlags ?? [])
    this.rootPath = options.rootPath ?? '/admin'
    this.auth = options.auth ?? new AnonymousAuthProvider()
    // Providers with pub/sub support (RedisCacheProvider with a subscriber
    // client) get wrapped so tag invalidations broadcast to sibling
    // instances; providers without it are used as-is.
    this.cache = withCrossInstanceInvalidation(options.cache ?? new NoopCacheProvider())
    this.cacheRuntime = new CacheRuntime(this.cache)
    this.componentLoader = options.componentLoader ?? new ComponentLoader()
    this.realtime = options.realtime ?? new NoopRealtimeBus()
    this.resources = ResourcesFactory.buildResources({
      databases: options.databases ?? [],
      resources: options.resources ?? [],
      adapters: options.adapters ?? [],
      plugins: options.plugins ?? [],
    })
  }

  /**
   * Resolve the permission matrix for a role name from the configured
   * roles resource. Returns null if no `rolesResourceId` is set, the
   * resource is not registered, or the row is missing.
   *
   * Caches per-role; consumers should not mutate the returned object.
   */
  async getRolePermissions(roleName: string | undefined): Promise<RolePermissions | null> {
    if (!roleName) return null
    const resourceId = this.options.rolesResourceId
    if (!resourceId) return null
    if (this.rolePermsCache.has(roleName)) {
      return this.rolePermsCache.get(roleName) ?? null
    }
    // A missing roles *resource* is a static configuration condition (the
    // feature simply isn't wired) — cache null and let the caller's gate
    // apply its upgrade-compat "unknown role stays open" stance.
    let resource: BaseResource
    try {
      resource = this.findResource(resourceId)
    } catch {
      this.rolePermsCache.set(roleName, null)
      return null
    }
    // A lookup *failure* (DB down, timeout) is NOT the same as "this role
    // has no row": swallowing it into a null would fail-open (the gate
    // skips) and, worse, pin that transient error into the cache for the
    // whole process lifetime. Let it propagate un-cached so the caller
    // denies (invoke() surfaces it as an error) and a later retry can
    // succeed once the store recovers.
    const record = await resource.findOne(roleName)
    // `record.params` is stored flat (`{ 'permissions.users': [...] }`)
    // because BaseRecord runs `flatten()` on construction. Rebuild the
    // nested object so the matrix matches the documented shape. A missing
    // row (valid role, no permissions configured) resolves to null — the
    // deliberate "unknown role stays open" upgrade-compat case.
    const nested = record ? (unflatten(record.params) as Record<string, unknown>) : {}
    const raw = nested.permissions
    let perms: RolePermissions | null = null
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      perms = raw as RolePermissions
    }
    this.rolePermsCache.set(roleName, perms)
    return perms
  }

  /** Test/operator hook: drop the cached permission matrix. */
  invalidateRolePermissionsCache(roleName?: string): void {
    if (roleName === undefined) {
      this.rolePermsCache.clear()
    } else {
      this.rolePermsCache.delete(roleName)
    }
  }

  private getCacheDependents(resourceId: string): ReadonlySet<string> {
    if (!this.cacheDependents) {
      const map = new Map<string, Set<string>>()
      const add = (dependency: string, dependent: string): void => {
        if (dependency === dependent) return
        let bucket = map.get(dependency)
        if (!bucket) {
          bucket = new Set()
          map.set(dependency, bucket)
        }
        bucket.add(dependent)
      }
      for (const resource of this.resources) {
        const decorator = resource.decorate()
        for (const property of decorator.properties) {
          const reference = property.reference()
          if (reference) add(reference, decorator.id)
          const m2m = property.custom().m2m as { through?: string } | undefined
          if (m2m?.through) add(m2m.through, decorator.id)
        }
      }
      this.cacheDependents = map
    }
    return this.cacheDependents.get(resourceId) ?? new Set()
  }

  /**
   * Drop every cached response that can be stale after `resourceId`
   * mutated: its own list/search caches, its record caches (the given
   * `recordIds` when the affected rows are known — sibling records' show
   * caches survive — or all of them via the resource-wide `records:` tag
   * when they aren't), and the list/record caches of every resource whose
   * responses embed this resource's data (populated references, m2m
   * hydration).
   *
   * Built-in mutations call this automatically after their after-hooks;
   * custom action handlers and out-of-band writers (queues, scripts using
   * the ORM directly) can call it manually.
   */
  async invalidateResourceCaches(resourceId: string, recordIds: string[] = []): Promise<void> {
    const tags = new Set<string>([listTag(resourceId)])
    if (recordIds.length > 0) {
      for (const id of recordIds) tags.add(recordTag(resourceId, id))
    } else {
      tags.add(recordsTag(resourceId))
    }
    for (const dependent of this.getCacheDependents(resourceId)) {
      tags.add(listTag(dependent))
      tags.add(recordsTag(dependent))
    }
    await this.cache.invalidateTag(Array.from(tags))
  }

  /**
   * Release long-lived resources held by the orchestrator (currently the
   * cross-instance cache invalidation subscription). Transports call this
   * on graceful shutdown.
   */
  async dispose(): Promise<void> {
    if (this.cache instanceof CrossInstanceCacheProvider) {
      await this.cache.dispose()
    }
  }

  findResource(id: string): BaseResource {
    const r = this.resources.find((res) => res.decorate().id === id)
    if (!r) throw new ResourceNotFoundError(id)
    return r
  }

  /**
   * Register additional resources after construction. Used by transports that
   * collect resources from feature modules (e.g. NestJS `forFeature`) and
   * need to attach them once all modules have initialised. Adapters default
   * to those passed at construction time.
   *
   * Resources whose decorated id already exists are silently skipped — this
   * lets the same registry drain run idempotently without throwing on a
   * second bootstrap (tests).
   */
  registerResources(args: RegisterResourcesArgs): BaseResource[] {
    const databases = args.databases ?? []
    const resources = args.resources ?? []
    const adapters = args.adapters ?? this.options.adapters ?? []
    const plugins = args.plugins ?? this.options.plugins ?? []
    if (databases.length === 0 && resources.length === 0) return []

    const built = ResourcesFactory.buildResources({ databases, resources, adapters, plugins })
    const existing = new Set(this.resources.map((r) => r.decorate().id))
    const added: BaseResource[] = []
    for (const r of built) {
      const id = r.decorate().id
      if (existing.has(id)) continue
      this.resources.push(r)
      existing.add(id)
      added.push(r)
    }
    if (added.length > 0) this.cacheDependents = null
    return added
  }

  /**
   * Execute an action end-to-end: resolve the action, run access checks,
   * before-hooks, the handler, and after-hooks. Transports call this rather
   * than touching resources directly so they share the same hook semantics.
   */
  /**
   * The principal gates every `invoke()` runs before executing an action,
   * factored out so transports that fan data out *without* going through
   * `invoke()` — WebSocket subscriptions, realtime room joins — can enforce
   * the exact same authorization instead of re-implementing it. Throws
   * `ForbiddenError` on denial; returns normally when access is granted.
   *
   * Order matches `invoke()`:
   *   1. api-key allowlist (when the principal carries an `apiKey` claim),
   *   2. role matrix (when `rolesResourceId` is configured) with default-deny
   *      for anonymous principals,
   *   3. the action's own `isAccessible` hook.
   */
  private async assertActionAccess(
    decorator: ResourceDecorator,
    actionDecorator: ActionDecorator,
    context: ActionContext,
  ): Promise<void> {
    // API-key principal gate. If the principal carries an `apiKey` claim,
    // the requested resource×action must be in its allowlist. A wildcard
    // entry (`'*'` action or a `'*'` resource key) opens the gate. This
    // runs before `isAccessible` so resource-level guards can still further
    // restrict what an api-key holder can do.
    if (!apiKeyAllows(context.currentAdmin, decorator.id, actionDecorator.name())) {
      throw new ForbiddenError(
        `API key does not grant access to action "${actionDecorator.name()}" on "${decorator.id}"`,
      )
    }

    // Role-based principal gate. When `rolesResourceId` is configured the
    // principal's `role` is resolved against that resource's permission
    // matrix. Same matching shape as the api-key gate (`'*'` wildcards
    // for resource and action). Skipped entirely when no `rolesResourceId`
    // is configured (framework-wide opt-in).
    //
    // Default-deny for anonymous: configuring `rolesResourceId` opts the
    // deployment into role enforcement, so a principal with no `role`
    // (anonymous / unauthenticated) is rejected outright instead of being
    // waved through. This closes the transport-layer fail-open where an
    // unauthenticated request whose `currentAdmin` was never populated would
    // otherwise skip the gate entirely. A principal that *has* a role but
    // whose row/matrix doesn't resolve is still open (see the "unknown role"
    // case) — that is the separate, deliberate upgrade-compat stance.
    if (this.options.rolesResourceId) {
      const role = context.currentAdmin?.role
      if (!role) {
        throw new ForbiddenError(
          `Anonymous access is not permitted for action ` +
            `"${actionDecorator.name()}" on "${decorator.id}"`,
        )
      }
      const perms = await this.getRolePermissions(role)
      if (perms && !permissionsAllow(perms, decorator.id, actionDecorator.name())) {
        throw new ForbiddenError(
          `Role "${role}" does not grant access to action ` +
            `"${actionDecorator.name()}" on "${decorator.id}"`,
        )
      }
    }

    if (!(await actionDecorator.isAccessible(context))) {
      throw new ForbiddenError(`Action "${actionDecorator.name()}" is not accessible`)
    }
  }

  /**
   * Non-throwing access check reusing the exact `invoke()` gates. Returns
   * `false` (rather than throwing) when the resource/action is unknown or the
   * principal is denied, so callers outside the action pipeline — notably the
   * realtime gateway gating room joins and GraphQL subscription setup — can
   * decide access without executing anything. Non-authorization errors
   * (e.g. a role lookup blowing up) propagate.
   */
  async canAccess(resourceId: string, action: string, currentAdmin?: CurrentAdmin): Promise<boolean> {
    let resource: BaseResource
    try {
      resource = this.findResource(resourceId)
    } catch {
      return false
    }
    const decorator = resource.decorate()
    const actionDecorator = decorator.getAction(action)
    if (!actionDecorator) return false
    const context: ActionContext = {
      admin: this,
      resource,
      action: actionDecorator.toDescriptor(),
      cache: this.cache,
      cacheRuntime: this.cacheRuntime,
      ...(currentAdmin !== undefined ? { currentAdmin } : {}),
    }
    try {
      await this.assertActionAccess(decorator, actionDecorator, context)
      return true
    } catch (err) {
      if (err instanceof ForbiddenError) return false
      throw err
    }
  }

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
      cacheRuntime: this.cacheRuntime,
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

    await this.assertActionAccess(decorator, actionDecorator, context)

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
    await this.invalidateMutationCaches(actionDecorator.name(), action.invalidates, response, request, context)
    response = await this.filterActionResponseProperties(response, context)
    await this.emitMutationEvents(actionDecorator.name(), response, request, context)
    return response
  }

  /**
   * Central post-hook cache invalidation for mutations. The built-in
   * handlers already invalidate their own tags, but they run *before*
   * after-hooks — anything an after-hook writes (m2m junction diffs,
   * upload persistence) could otherwise be re-cached by a concurrent read
   * landing between the handler's invalidation and the hook. Running the
   * full invalidation again here — after every hook completed — closes
   * that window and additionally drops dependent resources' caches
   * (populated references, m2m hydration).
   *
   * Custom actions participate by declaring `invalidates` on the action.
   */
  private async invalidateMutationCaches(
    actionName: string,
    invalidates: Action['invalidates'],
    response: ActionResponse,
    request: ActionRequest,
    context: ActionContext,
  ): Promise<void> {
    const resourceId = context.resource.decorate().id
    const isBuiltInMutation =
      actionName === 'new' || actionName === 'edit' || actionName === 'delete' || actionName === 'bulkDelete'
    if (!isBuiltInMutation && invalidates === undefined) return

    // `new` GET renders the blank form; `edit` GET renders the current
    // values — neither mutates anything.
    if (isBuiltInMutation && request.method === 'get') return

    const recordResponse = response as { record?: { id?: string } }
    const recordIds = new Set<string>()
    if (request.params.recordId) recordIds.add(request.params.recordId)
    for (const id of (request.params.recordIds ?? '').split(',').filter(Boolean)) recordIds.add(id)
    if (recordResponse.record?.id) recordIds.add(String(recordResponse.record.id))

    const targets = new Set<string>()
    if (isBuiltInMutation || invalidates === true) targets.add(resourceId)
    if (Array.isArray(invalidates)) for (const id of invalidates) targets.add(id)

    for (const target of targets) {
      await this.invalidateResourceCaches(
        target,
        target === resourceId ? Array.from(recordIds) : [],
      )
    }
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

    // Drop cached role permissions when the roles resource itself is
    // mutated through `invoke`. Doesn't catch out-of-band writes (raw
    // ORM, CLI tools) — those callers should call
    // `invalidateRolePermissionsCache()` directly.
    if (
      this.options.rolesResourceId &&
      resourceId === this.options.rolesResourceId &&
      (actionName === 'new' || actionName === 'edit' || actionName === 'delete' || actionName === 'bulkDelete')
    ) {
      this.invalidateRolePermissionsCache()
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
  toJSON(): ModernAdminJSON
  toJSON(currentAdmin: CurrentAdmin): Promise<ModernAdminJSON>
  toJSON(currentAdmin?: CurrentAdmin): ModernAdminJSON | Promise<ModernAdminJSON> {
    if (currentAdmin) {
      return Promise.all(
        this.resources.map((r) =>
          r.decorate().toJSON({
            admin: this,
            resource: r,
            cache: this.cache,
            currentAdmin,
          }),
        ),
      ).then((resources) => ({
        rootPath: this.rootPath,
        branding: this.options.branding,
        auth: this.auth.getUiProps(),
        resources,
        features: resolveFeatures(this.options.features),
      }))
    }
    return {
      rootPath: this.rootPath,
      branding: this.options.branding,
      auth: this.auth.getUiProps(),
      resources: this.resources.map((r) => r.decorate().toJSON()),
      features: resolveFeatures(this.options.features),
    }
  }

  async accessiblePropertyPaths(
    resource: BaseResource,
    currentAdmin?: CurrentAdmin,
  ): Promise<Set<string>> {
    const context = {
      admin: this,
      resource,
      cache: this.cache,
      ...(currentAdmin !== undefined ? { currentAdmin } : {}),
    }
    const entries = await Promise.all(
      resource.decorate().properties.map(async (property) => ({
        path: property.path(),
        accessible: await property.isAccessible(context),
      })),
    )
    return new Set(entries.filter((entry) => entry.accessible).map((entry) => entry.path))
  }

  async filterRecordJSON(
    record: RecordJSON,
    resource: BaseResource,
    currentAdmin?: CurrentAdmin,
  ): Promise<RecordJSON> {
    const allowed = await this.accessiblePropertyPaths(resource, currentAdmin)
    return filterRecordJSONByPropertyPaths(record, allowed)
  }

  private async filterActionResponseProperties<R extends ActionResponse>(
    response: R,
    context: ActionContext,
  ): Promise<R> {
    const recordResponse = response as R & {
      record?: RecordJSON
      records?: RecordJSON[]
    }
    if (!recordResponse.record && !recordResponse.records) return response

    const allowed = await this.accessiblePropertyPaths(
      context.resource,
      context.currentAdmin,
    )
    return {
      ...response,
      ...(recordResponse.record
        ? { record: filterRecordJSONByPropertyPaths(recordResponse.record, allowed) }
        : {}),
      ...(recordResponse.records
        ? { records: recordResponse.records.map((record) => filterRecordJSONByPropertyPaths(record, allowed)) }
        : {}),
    }
  }
}

export const ACTIONS = BUILT_IN_ACTIONS

/**
 * Permissions claim attached by `BetterAuthProvider` (or any other auth
 * provider that supports API-key principals). When present, the principal
 * is restricted to the listed resource×action pairs. Without the claim, the
 * gate is a no-op (session-authenticated user retains existing semantics).
 *
 * Shape: `permissions[resourceId] = ['list', 'show', ...]`. The literal
 * string `'*'` is a wildcard — either as an action (all actions of that
 * resource) or as a resource key (every resource).
 */
interface ApiKeyClaim {
  id: string
  permissions: Record<string, string[]>
}

/**
 * Shared matcher for both the api-key gate and the role gate. Returns
 * true iff `perms` grants `action` on `resourceId`, treating `'*'` as a
 * wildcard for either dimension.
 *
 * Exported so callers outside the `invoke()` pipeline (e.g. the AI
 * assistant's `execute_sql` gate, future feature gates) can reuse the
 * exact same wildcard semantics without re-implementing them. The
 * `resourceId` is free-form: real resource ids gate `invoke()`,
 * synthetic ids like `'__sql__'` gate side-channel capabilities.
 */
export const permissionsAllow = (
  perms: Record<string, string[]>,
  resourceId: string,
  action: string,
): boolean => {
  const wildcardActions = perms['*']
  if (Array.isArray(wildcardActions) && (wildcardActions.includes('*') || wildcardActions.includes(action))) {
    return true
  }
  const allowed = perms[resourceId]
  if (!Array.isArray(allowed)) return false
  return allowed.includes('*') || allowed.includes(action)
}

const apiKeyAllows = (
  principal: CurrentAdmin | undefined,
  resourceId: string,
  action: string,
): boolean => {
  const claim = principal?.apiKey as ApiKeyClaim | undefined
  if (!claim) return true
  return permissionsAllow(claim.permissions ?? {}, resourceId, action)
}

const pathAllowed = (path: string, allowed: Set<string>): boolean =>
  allowed.has(path) || Array.from(allowed).some((prefix) => path.startsWith(`${prefix}.`))

const filterParamsByPropertyPaths = (
  params: ParamsType,
  allowed: Set<string>,
): ParamsType => {
  const flat = flatten(params)
  const result: ParamsType = {}
  for (const [key, value] of Object.entries(flat)) {
    if (pathAllowed(key, allowed)) result[key] = value
  }
  return unflatten(result) as ParamsType
}

const filterRecordJSONByPropertyPaths = (
  record: RecordJSON,
  allowed: Set<string>,
): RecordJSON => ({
  ...record,
  params: filterParamsByPropertyPaths(record.params, allowed),
  populated: Object.fromEntries(
    Object.entries(record.populated).filter(([key]) => pathAllowed(key, allowed)),
  ),
  errors: Object.fromEntries(
    Object.entries(record.errors).filter(([key]) => pathAllowed(key, allowed)),
  ),
})
