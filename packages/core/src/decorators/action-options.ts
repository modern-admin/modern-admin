import { z } from 'zod'

/**
 * Subset of `Action` fields that users can override via ResourceOptions.
 * The handler / before / after callbacks are not part of the schema (since
 * Zod can't represent functions); they're merged in via TypeScript types.
 */
const actionGroupZ = z.object({
  name: z.string(),
  icon: z.string().optional(),
})

export const actionOptionsZ = z
  .object({
    isVisible: z.union([z.boolean(), z.unknown()]).optional(),
    isAccessible: z.union([z.boolean(), z.unknown()]).optional(),
    nesting: z.union([z.string(), actionGroupZ, z.array(z.union([z.string(), actionGroupZ]))]).optional(),
    guard: z.string().optional(),
    component: z.union([z.string(), z.null()]).optional(),
    label: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type ActionOptions = z.infer<typeof actionOptionsZ>
