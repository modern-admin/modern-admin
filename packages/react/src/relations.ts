import type { PropertyJSON, RelatedResource, ResourceJSON } from './types.js'

/**
 * Prisma/ORM reverse one-to-many relation fields arrive as array references.
 * Their values are usually not included in record/list payloads, so rendering
 * them as normal fields produces empty placeholders. They belong in related
 * record tables instead.
 */
export const isToManyReferenceProperty = (property: PropertyJSON): boolean =>
  property.type === 'reference' && property.isArray && property.reference !== null

/**
 * Properties to render for a given view, in the right order.
 *
 * When `order` (the resource's `propertyOrder[view]`) is supplied it is the
 * authority: the backend already resolved visibility + `listProperties` +
 * `position`, so we simply resolve each path against `properties` (which may be
 * shorter, having had per-record-inaccessible fields stripped) preserving that
 * order. Reverse to-many references are still filtered out — they belong in the
 * related-records section, not as columns.
 *
 * Without `order` (older API servers) we fall back to the legacy behaviour:
 * filter by `visibility[view]` in the payload's own order.
 */
export const visibleRecordProperties = (
  properties: ReadonlyArray<PropertyJSON>,
  view: 'list' | 'show' | 'edit' | 'filter',
  order?: ReadonlyArray<string>,
): PropertyJSON[] => {
  if (order) {
    const byPath = new Map(properties.map((property) => [property.path, property]))
    return order
      .map((path) => byPath.get(path))
      .filter(
        (property): property is PropertyJSON =>
          property !== undefined && !isToManyReferenceProperty(property),
      )
  }
  return properties.filter((property) =>
    property.visibility[view] && !isToManyReferenceProperty(property),
  )
}

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
    // Point-hide: a to-many reference property that's hidden from the `show`
    // view opts its auto-discovered tab out of the related-records section.
    // Explicitly-configured `relatedResources` are unaffected — they're an
    // intentional opt-in and carry no backing property visibility.
    if (property.visibility.show === false) continue

    const target = byId.get(property.reference)
    if (!target) continue

    const foreignKey = target.properties.find((candidate) =>
      !candidate.isArray && candidate.reference === resource.id,
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
