import type { BaseProperty } from '../adapters/base-property.js'
import type { PropertyType } from '../adapters/types.js'
import type {
  PropertyComponents,
  PropertyOptions,
  PropertyVisibility,
} from './property-options.js'

const humanize = (path: string): string =>
  path
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

const VIEWS = ['list', 'show', 'edit', 'filter'] as const
type View = (typeof VIEWS)[number]

/**
 * Wraps a BaseProperty with user-provided overrides. Resolves visibility,
 * components and metadata for transports without leaking adapter internals.
 */
export class PropertyDecorator {
  constructor(
    public readonly property: BaseProperty,
    public readonly options: PropertyOptions,
  ) {}

  name(): string {
    return this.property.name()
  }

  path(): string {
    return this.property.path()
  }

  label(): string {
    return this.options.label ?? humanize(this.property.path())
  }

  description(): string | undefined {
    return this.options.description
  }

  type(): PropertyType | string {
    return (this.options.type as PropertyType | undefined) ?? this.property.type()
  }

  position(): number {
    return this.options.position ?? this.property.position()
  }

  isSortable(): boolean {
    return this.options.isSortable ?? this.property.isSortable()
  }

  isRequired(): boolean {
    return this.options.isRequired ?? this.property.isRequired()
  }

  isDisabled(): boolean {
    return this.options.isDisabled ?? !this.property.isEditable()
  }

  isId(): boolean {
    return this.property.isId()
  }

  isArray(): boolean {
    return this.property.isArray()
  }

  reference(): string | null {
    return this.options.reference ?? this.property.reference()
  }

  availableValues(): { value: string; label: string }[] | null {
    if (this.options.availableValues) return this.options.availableValues
    const raw = this.property.availableValues()
    return raw ? raw.map((v) => ({ value: v, label: v })) : null
  }

  components(): PropertyComponents {
    return this.options.components ?? {}
  }

  custom(): Record<string, unknown> {
    return this.options.custom ?? {}
  }

  isVisibleIn(view: View): boolean {
    const v: PropertyVisibility | undefined = this.options.isVisible
    if (typeof v === 'boolean') return v
    if (v && view in v) {
      const flag = v[view as keyof typeof v]
      if (typeof flag === 'boolean') return flag
    }
    // Default fallbacks per view type.
    if (view === 'edit') return !this.property.isId() && this.property.isVisible()
    if (view === 'filter') return this.property.isVisible() && !this.property.isId()
    return this.property.isVisible()
  }

  toJSON(): {
    path: string
    label: string
    type: string
    isId: boolean
    isSortable: boolean
    isRequired: boolean
    isDisabled: boolean
    isArray: boolean
    reference: string | null
    availableValues: { value: string; label: string }[] | null
    components: PropertyComponents
    visibility: Record<View, boolean>
    position: number
    description?: string
    custom: Record<string, unknown>
  } {
    const visibility = VIEWS.reduce((acc, view) => {
      acc[view] = this.isVisibleIn(view)
      return acc
    }, {} as Record<View, boolean>)
    const json: ReturnType<PropertyDecorator['toJSON']> = {
      path: this.path(),
      label: this.label(),
      type: String(this.type()),
      isId: this.isId(),
      isSortable: this.isSortable(),
      isRequired: this.isRequired(),
      isDisabled: this.isDisabled(),
      isArray: this.isArray(),
      reference: this.reference(),
      availableValues: this.availableValues(),
      components: this.components(),
      visibility,
      position: this.position(),
      custom: this.custom(),
    }
    const desc = this.description()
    if (desc !== undefined) json.description = desc
    return json
  }
}
