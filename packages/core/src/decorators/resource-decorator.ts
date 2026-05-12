import { BaseProperty, type BaseResource } from '../adapters'
import type { PropertyType } from '../adapters/types.js'
import {
  BUILT_IN_ACTIONS,
  type Action,
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

export interface ResourceJSON {
  id: string
  name: string
  navigation: ResourceOptions['navigation']
  relatedResources: ReadonlyArray<RelatedResource>
  properties: PropertyJSON[]
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

  constructor(
    public readonly resource: BaseResource,
    public readonly options: ResourceOptions = {},
  ) {
    this.id = options.id ?? resource.id()
    this.name = options.name ?? humanize(this.id)
    this.navigation = normalizeNavigation(options.navigation)
    this.relatedResources = options.relatedResources ?? []
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
      const synthetic = new BaseProperty({
        path,
        type: (opts.type as PropertyType | undefined) ?? 'string',
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

  /** Properties to display in `list` view, respecting `listProperties` order. */
  propertiesForView(view: 'list' | 'show' | 'edit' | 'filter'): PropertyDecorator[] {
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

  toJSON(): ResourceJSON
  toJSON(context: PropertyContextBase): Promise<ResourceJSON>
  toJSON(context?: PropertyContextBase): ResourceJSON | Promise<ResourceJSON> {
    if (context) {
      return Promise.all(this.properties.map((p) => p.toJSON(context))).then((properties) => ({
        id: this.id,
        name: this.name,
        navigation: this.navigation,
        relatedResources: this.relatedResources,
        properties: properties.filter((p): p is PropertyJSON => p !== null),
        actions: Array.from(this.actions.values()).map((a) => a.toDescriptor()),
      }))
    }
    return {
      id: this.id,
      name: this.name,
      navigation: this.navigation,
      relatedResources: this.relatedResources,
      properties: this.properties.map((p) => p.toJSON()),
      actions: Array.from(this.actions.values()).map((a) => a.toDescriptor()),
    }
  }
}
