import { z } from 'zod'
import { propertyOptionsZ } from './property-options.js'
import { actionOptionsZ } from './action-options.js'

export const navigationZ = z
  .object({
    name: z.string().optional(),
    icon: z.string().optional(),
    /** Group label for the sidebar. */
    group: z.string().optional(),
  })
  .or(z.null())

export const resourceOptionsZ = z.object({
  /** Override sidebar / route id. Defaults to `resource.id()`. */
  id: z.string().optional(),
  /** Display name; defaults to a humanized id. */
  name: z.string().optional(),
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
})

export type ResourceOptions = z.infer<typeof resourceOptionsZ>
