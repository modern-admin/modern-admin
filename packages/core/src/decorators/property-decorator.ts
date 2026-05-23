import type { BaseProperty } from '../adapters/base-property.js'
import type { PropertyType } from '../adapters/types.js'
import type {
  KeyValueField,
  PropertyComponents,
  PropertyContext,
  PropertyContextBase,
  PropertyOptions,
  PropertyVisibility,
  ShowWhen,
} from './property-options.js'

const humanize = (path: string): string =>
  path
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

const VIEWS = ['list', 'show', 'edit', 'filter'] as const
type View = (typeof VIEWS)[number]

export interface PropertyJSON {
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
  showWhen?: ShowWhen
  keyValueFields?: KeyValueField[]
  custom: Record<string, unknown>
}

const resolveFlag = async (
  flag: PropertyOptions['isAccessible'],
  ctx: PropertyContext,
  fallback: boolean,
): Promise<boolean> => {
  if (flag === undefined) return fallback
  if (typeof flag === 'boolean') return flag
  return Boolean(await flag(ctx))
}

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

  /**
   * Tri-state opt-in/out for the resource's `search` action (drives the
   * global-search palette):
   * - `true`     → always searched, even for non-string types.
   * - `false`    → always skipped (mute noisy/long-text or PII columns).
   * - `undefined`→ auto: included for visible, non-id string properties;
   *                the resolved title property is always searched.
   */
  isSearchable(): boolean | undefined {
    return this.options.isSearchable
  }

  isId(): boolean {
    return this.property.isId()
  }

  isArray(): boolean {
    return this.options.isArray ?? this.property.isArray()
  }

  reference(): string | null {
    return this.options.reference ?? this.property.reference()
  }

  availableValues(): { value: string; label: string }[] | null {
    if (this.options.availableValues) {
      // User-provided list — strings double as their own label, objects pass through.
      return this.options.availableValues.map((v) =>
        typeof v === 'string' ? { value: v, label: v } : v,
      )
    }
    const raw = this.property.availableValues()
    return raw ? raw.map((v) => ({ value: v, label: v })) : null
  }

  components(): PropertyComponents {
    return this.options.components ?? {}
  }

  custom(): Record<string, unknown> {
    return this.options.custom ?? {}
  }

  showWhen(): ShowWhen | undefined {
    return this.options.showWhen
  }

  keyValueFields(): KeyValueField[] | undefined {
    return this.options.keyValueFields
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

  async isAccessible(context: PropertyContextBase): Promise<boolean> {
    return resolveFlag(
      this.options.isAccessible,
      { ...context, property: this.property },
      true,
    )
  }

  toJSON(): PropertyJSON
  toJSON(context: PropertyContextBase): Promise<PropertyJSON | null>
  toJSON(
    context?: PropertyContextBase,
  ): PropertyJSON | Promise<PropertyJSON | null> {
    if (context) {
      return this.isAccessible(context).then((accessible) =>
        accessible ? this.toJSON() : null,
      )
    }
    const visibility = VIEWS.reduce((acc, view) => {
      acc[view] = this.isVisibleIn(view)
      return acc
    }, {} as Record<View, boolean>)
    const json: PropertyJSON = {
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
    const sw = this.showWhen()
    if (sw !== undefined) json.showWhen = sw
    const kvf = this.keyValueFields()
    if (kvf !== undefined) json.keyValueFields = kvf
    return json
  }
}
