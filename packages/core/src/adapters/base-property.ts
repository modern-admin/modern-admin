import type { PropertyType } from './types.js'

const TITLE_COLUMN_NAMES = ['title', 'name', 'subject', 'email']

export interface BasePropertyAttrs {
  path: string
  type?: PropertyType
  isId?: boolean
  isSortable?: boolean
  isRequired?: boolean
  isArray?: boolean
  position?: number
  reference?: string | null
  availableValues?: string[] | null
  subProperties?: BaseProperty[]
}

/**
 * Adapter-level descriptor of a single field on a resource. Adapters may
 * subclass this to expose ORM-specific knowledge, but the public API is
 * intentionally minimal so transports can rely on it.
 */
export class BaseProperty {
  protected readonly attrs: Required<
    Pick<
      BasePropertyAttrs,
      'path' | 'type' | 'isId' | 'isSortable' | 'isRequired' | 'isArray' | 'position'
    >
  > & {
    reference: string | null
    availableValues: string[] | null
    subProperties: BaseProperty[]
  }

  constructor(attrs: BasePropertyAttrs) {
    if (!attrs.path) {
      throw new Error('BaseProperty requires a non-empty `path`')
    }
    this.attrs = {
      path: attrs.path,
      type: attrs.type ?? 'string',
      isId: attrs.isId ?? false,
      isSortable: attrs.isSortable ?? true,
      isRequired: attrs.isRequired ?? false,
      isArray: attrs.isArray ?? false,
      position: attrs.position ?? 1,
      reference: attrs.reference ?? null,
      availableValues: attrs.availableValues ?? null,
      subProperties: attrs.subProperties ?? [],
    }
  }

  name(): string {
    return this.attrs.path
  }

  path(): string {
    return this.attrs.path
  }

  type(): PropertyType {
    return this.attrs.type
  }

  isId(): boolean {
    return this.attrs.isId
  }

  isSortable(): boolean {
    return this.attrs.isSortable
  }

  isRequired(): boolean {
    return this.attrs.isRequired
  }

  isArray(): boolean {
    return this.attrs.isArray
  }

  position(): number {
    return this.attrs.position
  }

  reference(): string | null {
    return this.attrs.reference
  }

  availableValues(): string[] | null {
    return this.attrs.availableValues
  }

  subProperties(): BaseProperty[] {
    return this.attrs.subProperties
  }

  isTitle(): boolean {
    return TITLE_COLUMN_NAMES.includes(this.attrs.path.toLowerCase())
  }

  isVisible(): boolean {
    // Default: hide explicit password fields. Decorator can override.
    return !/password/i.test(this.attrs.path)
  }

  isEditable(): boolean {
    return !this.attrs.isId
  }
}
