import { BaseProperty, type BaseResource } from '../adapters'
import type { PropertyType } from '../adapters/types.js'
import {
  BUILT_IN_ACTIONS,
  type Action,
  type ActionContext,
  type ActionResponse,
} from '../actions'
import { ActionDecorator } from './action-decorator.js'
import { PropertyDecorator, type PropertyJSON } from './property-decorator.js'
import type { PropertyContextBase } from './property-options.js'
import type { RelatedResource, ResourceOptions } from './resource-options.js'

const humanize = (value: string): string =>
  value.replace(/[._-]/g, ' ').replace(/^./, (c) => c.toUpperCase())

const DEFAULT_NAVIGATION_ICON = 'Database'

type Navigation = NonNullable<Exclude<ResourceOptions['navigation'], null>>

type View = 'list' | 'show' | 'edit' | 'filter'
const VIEWS: readonly View[] = ['list', 'show', 'edit', 'filter']

export interface ResourceJSON {
  id: string
  name: string
  navigation: ResourceOptions['navigation']
  relatedResources: ReadonlyArray<RelatedResource>
  showRelatedResources: boolean
  properties: PropertyJSON[]
  /**
   * Per-view ordered list of property paths, computed by
   * {@link ResourceDecorator.propertiesForView}. This is the single source of
   * truth for *which* columns/fields a view shows and *in what order* —
   * honouring `listProperties`/`showProperties`/… (explicit whitelist + order)
   * and `position` (sort key), neither of which the flat `properties` array
   * encodes. The SPA resolves these paths against `properties`; anything not
   * listed (e.g. hidden by visibility, or stripped by per-record access) is
   * simply absent from the array.
   */
  propertyOrder: Record<View, string[]>
  actions: ReturnType<ActionDecorator['toDescriptor']>[]
}

const normalizeNavigation = (
  navigation: ResourceOptions['navigation'] | undefined,
): ResourceOptions['navigation'] => {
  if (navigation === undefined || navigation === null) return navigation ?? null
  return {
    ...navigation,
    icon: navigation.icon ?? DEFAULT_NAVIGATION_ICON,
  } as Navigation
}

/**
 * Wraps a BaseResource with merged options + per-property/action decorators.
 * Transports query the decorator to render UIs and route requests.
 */
export class ResourceDecorator {
  public readonly id: string
  public readonly name: string
  public readonly properties: PropertyDecorator[]
  public readonly actions: Map<string, ActionDecorator<ActionResponse>>
  public readonly navigation: ResourceOptions['navigation']
  public readonly relatedResources: ReadonlyArray<RelatedResource>
  public readonly showRelatedResources: boolean

  constructor(
    public readonly resource: BaseResource,
    public readonly options: ResourceOptions = {},
  ) {
    this.id = options.id ?? resource.id()
    this.name = options.name ?? humanize(this.id)
    this.navigation = normalizeNavigation(options.navigation)
    this.relatedResources = options.relatedResources ?? []
    this.showRelatedResources = options.showRelatedResources ?? true
    this.properties = this.buildPropertyDecorators(resource.properties())
    this.actions = this.buildActionDecorators(options.actions ?? {})
  }

  private buildPropertyDecorators(properties: BaseProperty[]): PropertyDecorator[] {
    const overrides = this.options.properties ?? {}
    const fromResource = properties.map(
      (p) => new PropertyDecorator(p, overrides[p.path()] ?? {}),
    )
    // Promote option entries that don't match an existing resource property
    // into virtual fields. Used by features (e.g. passwords) to expose
    // form-only inputs that don't exist on the underlying table — paired
    // with a `before` hook that strips them from the payload before save.
    const knownPaths = new Set(properties.map((p) => p.path()))
    const virtual: PropertyDecorator[] = []
    for (const [path, opts] of Object.entries(overrides)) {
      if (knownPaths.has(path)) continue
      // Give synthetic fields a trailing position so the position-based sort in
      // `propertiesForView` keeps them after the real (adapter-numbered)
      // columns, matching their append-at-end placement. A user-supplied
      // `position` override still wins via PropertyDecorator.position().
      const synthetic = new BaseProperty({
        path,
        type: (opts.type as PropertyType | undefined) ?? 'string',
        position: fromResource.length + virtual.length + 1,
      })
      virtual.push(new PropertyDecorator(synthetic, opts))
    }
    return [...fromResource, ...virtual]
  }

  private buildActionDecorators(
    overrides: NonNullable<ResourceOptions['actions']>,
  ): Map<string, ActionDecorator<ActionResponse>> {
    const result = new Map<string, ActionDecorator<ActionResponse>>()

    // Built-ins first; user overrides may tweak / disable.
    for (const action of Object.values(BUILT_IN_ACTIONS)) {
      const override = overrides[action.name]
      result.set(action.name, new ActionDecorator(action, override ?? {}, this.id))
    }
    // Custom actions defined entirely in options (must include handler).
    for (const [name, candidate] of Object.entries(overrides)) {
      if (result.has(name)) continue
      const c = candidate as Partial<Action<ActionResponse>>
      if (typeof c.handler !== 'function' || !c.actionType) continue
      const action: Action<ActionResponse> = {
        name,
        actionType: c.actionType,
        handler: c.handler,
        ...(c.before !== undefined ? { before: c.before } : {}),
        ...(c.after !== undefined ? { after: c.after } : {}),
        ...(c.isAccessible !== undefined ? { isAccessible: c.isAccessible } : {}),
        ...(c.isVisible !== undefined ? { isVisible: c.isVisible } : {}),
        ...(c.nesting !== undefined ? { nesting: c.nesting } : {}),
        ...(c.guard !== undefined ? { guard: c.guard } : {}),
        ...(c.component !== undefined ? { component: c.component } : {}),
        ...(c.custom !== undefined ? { custom: c.custom } : {}),
        ...(c.invalidates !== undefined ? { invalidates: c.invalidates } : {}),
      }
      result.set(name, new ActionDecorator(action, {}, this.id))
    }
    return result
  }

  getPropertyByKey(path: string): PropertyDecorator | null {
    return this.properties.find((p) => p.path() === path) ?? null
  }

  getAction(name: string): ActionDecorator<ActionResponse> | null {
    return this.actions.get(name) ?? null
  }

  resourceActions(): ActionDecorator<ActionResponse>[] {
    return Array.from(this.actions.values()).filter(
      (a) => a.actionType() === 'resource',
    )
  }

  recordActions(): ActionDecorator<ActionResponse>[] {
    return Array.from(this.actions.values()).filter(
      (a) => a.actionType() === 'record',
    )
  }

  bulkActions(): ActionDecorator<ActionResponse>[] {
    return Array.from(this.actions.values()).filter(
      (a) => a.actionType() === 'bulk',
    )
  }

  /**
   * Ordered, view-visible properties. When the matching option
   * (`listProperties`/`showProperties`/`editProperties`/`filterProperties`) is
   * set it acts as an explicit whitelist + order (AdminJS semantics); otherwise
   * the view-visible properties are sorted by `position()`. Serialised into
   * `ResourceJSON.propertyOrder` and consumed by the SPA — do not inline this
   * logic elsewhere.
   */
  propertiesForView(view: View): PropertyDecorator[] {
    const explicit = view === 'list'
      ? this.options.listProperties
      : view === 'show'
        ? this.options.showProperties
        : view === 'edit'
          ? this.options.editProperties
          : this.options.filterProperties
    if (explicit && explicit.length > 0) {
      return explicit
        .map((path) => this.getPropertyByKey(path))
        .filter((p): p is PropertyDecorator => p !== null)
    }
    return this.properties
      .filter((p) => p.isVisibleIn(view))
      .sort((a, b) => a.position() - b.position())
  }

  /** Ordered visible property paths per view — the wire form of the config. */
  private buildPropertyOrder(): Record<View, string[]> {
    return VIEWS.reduce((acc, view) => {
      acc[view] = this.propertiesForView(view).map((p) => p.path())
      return acc
    }, {} as Record<View, string[]>)
  }

  toJSON(): ResourceJSON
  toJSON(context: PropertyContextBase): Promise<ResourceJSON>
  toJSON(context?: PropertyContextBase): ResourceJSON | Promise<ResourceJSON> {
    if (context) {
      return (async () => {
        const properties = (await Promise.all(this.properties.map((p) => p.toJSON(context))))
          .filter((p): p is PropertyJSON => p !== null)
        // Filter out actions the current admin cannot access, so the SPA can
        // gate UI on capability — e.g. <ReferenceLink> renders a plain badge
        // instead of a clickable show link when `show` is missing from the
        // referenced resource. Resource-level checks here use a context
        // without a `record`; per-record gating still re-runs at invoke time.
        const entries = Array.from(this.actions.values())
        const descriptors = await Promise.all(entries.map(async (a) => {
          const descriptor = a.toDescriptor()
          const actionContext = { ...context, action: descriptor } as ActionContext
          return (await a.isAccessible(actionContext)) ? descriptor : null
        }))
        return {
          id: this.id,
          name: this.name,
          navigation: this.navigation,
          relatedResources: this.relatedResources,
          showRelatedResources: this.showRelatedResources,
          properties,
          propertyOrder: this.buildPropertyOrder(),
          actions: descriptors.filter((d): d is ReturnType<ActionDecorator['toDescriptor']> => d !== null),
        }
      })()
    }
    return {
      id: this.id,
      name: this.name,
      navigation: this.navigation,
      relatedResources: this.relatedResources,
      showRelatedResources: this.showRelatedResources,
      properties: this.properties.map((p) => p.toJSON()),
      propertyOrder: this.buildPropertyOrder(),
      actions: Array.from(this.actions.values()).map((a) => a.toDescriptor()),
    }
  }
}
