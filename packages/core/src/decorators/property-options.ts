import { z } from 'zod'

/**
 * Visibility map: which views does this property appear in. `true`/`false`
 * shorthand toggles all views at once.
 */
export const propertyVisibilityZ = z.union([
  z.boolean(),
  z.object({
    list: z.boolean().optional(),
    show: z.boolean().optional(),
    edit: z.boolean().optional(),
    filter: z.boolean().optional(),
  }),
])
export type PropertyVisibility = z.infer<typeof propertyVisibilityZ>

/**
 * Custom UI components per view. Strings reference names registered with
 * `ComponentLoader`.
 */
export const propertyComponentsZ = z.object({
  list: z.string().optional(),
  show: z.string().optional(),
  edit: z.string().optional(),
  filter: z.string().optional(),
})
export type PropertyComponents = z.infer<typeof propertyComponentsZ>

export const propertyOptionsZ = z.object({
  /** Display name (defaults to humanized property path). */
  label: z.string().optional(),
  /** Optional helper text shown next to the field. */
  description: z.string().optional(),
  type: z.string().optional(),
  isVisible: propertyVisibilityZ.optional(),
  isSortable: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
  /** Override resource id for `reference` typed properties. */
  reference: z.string().optional(),
  /** Enum / radio source. */
  availableValues: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  components: propertyComponentsZ.optional(),
  position: z.number().optional(),
  /** Free-form payload forwarded to the UI component. */
  custom: z.record(z.string(), z.unknown()).optional(),
})

export type PropertyOptions = z.infer<typeof propertyOptionsZ>
