import type { BaseProperty, BaseResource } from '../adapters'
import {
  BUILT_IN_ACTIONS,
  type Action,
  type ActionResponse,
} from '../actions'
import { ActionDecorator } from './action-decorator.js'
import { PropertyDecorator } from './property-decorator.js'
import type { ResourceOptions } from './resource-options.js'

const humanize = (value: string): string =>
  value.replace(/[._-]/g, ' ').replace(/^./, (c) => c.toUpperCase())

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

  constructor(
    public readonly resource: BaseResource,
    public readonly options: ResourceOptions = {},
  ) {
    this.id = options.id ?? resource.id()
    this.name = options.name ?? humanize(this.id)
    this.navigation = options.navigation ?? null
    this.properties = this.buildPropertyDecorators(resource.properties())
    this.actions = this.buildActionDecorators(options.actions ?? {})
  }

  private buildPropertyDecorators(properties: BaseProperty[]): PropertyDecorator[] {
    const overrides = this.options.properties ?? {}
    return properties.map(
      (p) => new PropertyDecorator(p, overrides[p.path()] ?? {}),
    )
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

  toJSON(): {
    id: string
    name: string
    navigation: ResourceOptions['navigation']
    properties: ReturnType<PropertyDecorator['toJSON']>[]
    actions: ReturnType<ActionDecorator['toDescriptor']>[]
  } {
    return {
      id: this.id,
      name: this.name,
      navigation: this.navigation,
      properties: this.properties.map((p) => p.toJSON()),
      actions: Array.from(this.actions.values()).map((a) => a.toDescriptor()),
    }
  }
}
