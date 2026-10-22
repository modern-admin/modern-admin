import type { BaseResource } from '../adapters'
import type { PropertyDecorator } from '../decorators/property-decorator.js'
import type { PropertyContextBase } from '../decorators/property-options.js'
import { ForbiddenError, ValidationError } from '../errors'

const MAX_RELATION_DEPTH = 5

export interface RelationPathEntry {
  resource: BaseResource
  property: PropertyDecorator
}

export const invalidRelationFilter = (
  path: string,
  message = 'errors:invalidRelationFilter',
): ValidationError =>
  new ValidationError(
    {
      [path]: { type: 'invalid', message },
    },
    { type: 'invalid', message },
  )

/** Resolve scalar foreign-key paths, independently of ORM relation names. */
export function resolveRelationPath(
  resource: BaseResource,
  path: string,
  findResource: (id: string) => BaseResource,
): RelationPathEntry[] {
  const entries: RelationPathEntry[] = []
  let remaining = path
  let current = resource
  for (;;) {
    // A real dotted property (e.g. a JSON-by-key field) takes precedence.
    const direct = current.property(remaining)
    if (direct) {
      const property = current.decorate().getPropertyByKey(remaining)!
      if (property.isArray() || !direct.isStored()) throw invalidRelationFilter(path)
      entries.push({ resource: current, property })
      return entries
    }
    const separator = remaining.indexOf('.')
    if (separator < 1 || entries.length >= MAX_RELATION_DEPTH) throw invalidRelationFilter(path)
    const head = remaining.slice(0, separator)
    const raw = current.property(head)
    const property = raw?.isStored() ? current.decorate().getPropertyByKey(head) : null
    const reference = property?.reference()
    if (!property || property.isArray() || !reference) throw invalidRelationFilter(path)
    const target = findResource(reference)
    const fields = raw!.referenceFields()
    if (fields) {
      const key = fields.length === 1 ? target.property(fields[0]!) : null
      // Scalar traversal cannot preserve a composite foreign key's tuple.
      if (!key || key.isArray() || !key.isStored()) throw invalidRelationFilter(path)
    }
    entries.push({ resource: current, property })
    current = target
    remaining = remaining.slice(separator + 1)
  }
}

/** Relation predicates must not become an oracle for inaccessible fields. */
export async function canAccessRelationPath(
  entries: RelationPathEntry[],
  context: PropertyContextBase,
): Promise<boolean> {
  for (const [index, entry] of entries.entries()) {
    const resourceId = entry.resource.decorate().id
    if (!(await context.admin.canAccess(resourceId, 'list', context.currentAdmin))) return false
    if (!(await entry.property.isAccessible({ ...context, resource: entry.resource }))) return false
    const fields = entry.property.property.referenceFields()
    const target = entries[index + 1]?.resource
    if (fields && target) {
      const key = target.decorate().getPropertyByKey(fields[0]!)
      if (!key || (!key.isId() && !(await key.isAccessible({ ...context, resource: target }))))
        return false
    }
  }
  return true
}

export async function assertRelationPathAccess(
  entries: RelationPathEntry[],
  context: PropertyContextBase,
  path?: string,
): Promise<void> {
  const configured = path ? context.resource.decorate().getPropertyByKey(path) : null
  if (
    !(await canAccessRelationPath(entries, context)) ||
    (configured && !(await configured.isAccessible(context)))
  ) {
    throw new ForbiddenError('errors:forbidden')
  }
}
