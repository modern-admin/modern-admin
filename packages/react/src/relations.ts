import type { PropertyJSON, RelatedResource, ResourceJSON } from './types.js'

/**
 * Prisma/ORM reverse one-to-many relation fields arrive as array references.
 * Their values are usually not included in record/list payloads, so rendering
 * them as normal fields produces empty placeholders. They belong in related
 * record tables instead.
 */
export const isToManyReferenceProperty = (property: PropertyJSON): boolean =>
  property.type === 'reference' && property.isArray && property.reference !== null

export const visibleRecordProperties = (
  properties: ReadonlyArray<PropertyJSON>,
  view: 'list' | 'show' | 'edit' | 'filter',
): PropertyJSON[] =>
  properties.filter((property) =>
    property.visibility[view] && !isToManyReferenceProperty(property)
  )

const relatedKey = (related: RelatedResource): string =>
  `${related.resourceId}::${related.foreignKey}`

export const resolveRelatedResources = (
  resource: ResourceJSON,
  allResources: ReadonlyArray<ResourceJSON>,
): RelatedResource[] => {
  const byId = new Map(allResources.map((item) => [item.id, item]))
  const result = [...(resource.relatedResources ?? [])]
  const seen = new Set(result.map(relatedKey))

  for (const property of resource.properties) {
    if (!isToManyReferenceProperty(property) || !property.reference) continue

    const target = byId.get(property.reference)
    if (!target) continue

    const foreignKey = target.properties.find((candidate) =>
      !candidate.isArray && candidate.reference === resource.id
    )
    if (!foreignKey) continue

    const related: RelatedResource = {
      resourceId: target.id,
      foreignKey: foreignKey.path,
      label: property.label,
    }
    const key = relatedKey(related)
    if (seen.has(key)) continue

    seen.add(key)
    result.push(related)
  }

  return result
}
