import { z } from 'zod'
import { propertyOptionsZ, type PropertyOptions } from './property-options.js'
import { actionOptionsZ } from './action-options.js'

export const navigationZ = z
  .object({
    name: z.string().optional(),
    icon: z.string().optional(),
    /** Group label for the sidebar. */
    group: z.string().optional(),
  })
  .or(z.null())

/**
 * Describes a sibling resource whose records reference the current one
 * through `foreignKey`. The frontend renders one tab per entry on the show
 * page, listing matching records pre-filtered by the open record's id.
 */
export const relatedResourceZ = z.object({
  /** Target resource id (the one *containing* the foreign key). */
  resourceId: z.string(),
  /** Property path on the target resource that points back to us. */
  foreignKey: z.string(),
  /** Optional tab label override; falls back to the target resource name. */
  label: z.string().optional(),
})

export type RelatedResource = z.infer<typeof relatedResourceZ>

export const resourceOptionsZ = z.object({
  /** Override sidebar / route id. Defaults to `resource.id()`. */
  id: z.string().optional(),
  /** Display name; defaults to a humanized id. */
  name: z.string().optional(),
  /** Property path to use as the record title in lists, breadcrumbs and
   *  audit logs. Overrides the automatic TITLE_COLUMN_NAMES detection. */
  titleProperty: z.string().optional(),
  navigation: navigationZ.optional(),
  /** Per-property overrides keyed by property path. */
  properties: z.record(z.string(), propertyOptionsZ).optional(),
  /** Per-action overrides; values get merged into BUILT_IN_ACTIONS. */
  actions: z.record(z.string(), actionOptionsZ).optional(),
  /** Listing defaults — props & sort. */
  listProperties: z.array(z.string()).optional(),
  showProperties: z.array(z.string()).optional(),
  editProperties: z.array(z.string()).optional(),
  filterProperties: z.array(z.string()).optional(),
  sort: z
    .object({
      sortBy: z.string(),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
  /** Reverse 1:N relations to render as tabs on the show page. */
  relatedResources: z.array(relatedResourceZ).optional(),
})

export type ResourceOptions = Omit<
  z.infer<typeof resourceOptionsZ>,
  'properties'
> & {
  /** Per-property overrides keyed by property path. */
  properties?: Record<string, PropertyOptions>
}
