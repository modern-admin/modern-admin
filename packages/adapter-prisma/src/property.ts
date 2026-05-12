import { BaseProperty, type PropertyType } from '@modern-admin/core'
import type { DmmfEnum, DmmfField } from './types.js'

const SCALAR_TO_PROPERTY: Readonly<Record<string, PropertyType>> = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  BigInt: 'number',
  Float: 'float',
  Decimal: 'float',
  DateTime: 'datetime',
  Json: 'json',
  Bytes: 'string',
}

const isUuidColumn = (name: string): boolean => /(^id$|Id$|_id$|uuid)/i.test(name)

/**
 * Property descriptor backed by a Prisma DMMF field. Maps Prisma scalar kinds
 * onto the core PropertyType taxonomy, surfaces enum values, and exposes
 * relation metadata so the decorator layer can render reference inputs.
 */
export class PrismaProperty extends BaseProperty {
  public readonly field: DmmfField

  constructor(field: DmmfField, enums: readonly DmmfEnum[] = [], position = 1, referenceOverride: string | null = null) {
    const enumDef = field.kind === 'enum' ? enums.find((e) => e.name === field.type) : undefined
    const reference = field.kind === 'object' ? field.type : referenceOverride
    const type = PrismaProperty.resolveType(field, enumDef !== undefined, reference !== null)
    super({
      path: field.name,
      type,
      isId: field.isId,
      isSortable: field.kind === 'scalar' && !field.isList,
      isRequired: field.isRequired && !field.hasDefaultValue && !field.isId,
      isArray: field.isList,
      position,
      reference,
      availableValues: enumDef ? enumDef.values.map((v) => v.name) : null,
    })
    this.field = field
  }

  private static resolveType(field: DmmfField, isEnum: boolean, isReference: boolean): PropertyType {
    if (isEnum) return 'enum'
    if (field.kind === 'object' || isReference) return 'reference'
    if (field.kind === 'scalar') {
      const mapped = SCALAR_TO_PROPERTY[field.type]
      if (mapped) {
        // Promote string ids that look like uuids to a dedicated type.
        if (mapped === 'string' && field.isId && isUuidColumn(field.name)) return 'uuid'
        return mapped
      }
    }
    return 'mixed'
  }

  /**
   * Foreign-key field names backing this relation (Prisma's
   * `relationFromFields`). Empty for non-relation properties.
   */
  foreignKeyFields(): readonly string[] {
    return this.field.relationFromFields ?? []
  }

  override isEditable(): boolean {
    if (this.field.kind === 'object') return false
    if (this.field.isReadOnly && this.reference() === null) return false
    return super.isEditable()
  }
}
