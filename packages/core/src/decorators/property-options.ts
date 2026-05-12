import { z } from 'zod'
import type { BaseProperty, BaseResource } from '../adapters'
import type { ModernAdmin } from '../modern-admin.js'
import type { CurrentAdmin, ICacheProvider } from '../ports'

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

/**
 * Declarative conditional-visibility rule for a property in the edit form.
 *
 * The frontend evaluates the rule against the live form values and skips
 * rendering (and validation) when the rule does not match. Use it to model
 * dependent fields, region-specific inputs, "select reference based on type"
 * UX, etc.
 *
 * Operators are combined with OR semantics — the field shows when **any**
 * of the configured operators matches (in addition to `defaultWhenEmpty`
 * triggering when the control field is blank).
 */
export const showWhenZ = z.object({
  /** Path of the sibling form field whose value drives visibility. */
  field: z.string(),
  /** Show when the control field equals this scalar value. */
  equals: z.unknown().optional(),
  /** Show when the control field does NOT equal this scalar value. */
  notEquals: z.unknown().optional(),
  /** Show when the control field equals one of these values. */
  in: z.array(z.unknown()).optional(),
  /** Show when the control field is NOT one of these values. */
  notIn: z.array(z.unknown()).optional(),
  /** Show when the control field is empty (null / undefined / ''). */
  isEmpty: z.boolean().optional(),
  /**
   * Fallback flag — show this field when the control field is blank.
   * Used to declare a "default branch" so something is visible before the
   * user picks a value. Mirrors legacy `isDefaultSwitcher`.
   */
  defaultWhenEmpty: z.boolean().optional(),
})
export type ShowWhen = z.infer<typeof showWhenZ>

/**
 * One declared key inside a JSON object rendered with the key-value editor.
 *
 * Use `keyValueFields` on a JSON-typed property to swap the default
 * `JsonEditor` (raw braces/quotes) for a friendly key/value form: each
 * declared field becomes its own labeled row with the appropriate input.
 */
export const keyValueFieldZ = z.object({
  /** JSON key on the underlying object. */
  key: z.string(),
  /** Visible label. Defaults to `key`. */
  label: z.string().optional(),
  /** Editor kind. Default: `'string'`. */
  type: z
    .enum(['string', 'number', 'boolean', 'textarea', 'select', 'autocomplete'])
    .optional(),
  /** Helper text shown under the input. */
  description: z.string().optional(),
  /** Placeholder for text/number inputs. */
  placeholder: z.string().optional(),
  /** Visual `*` marker; required-ness is enforced by the form layer. */
  isRequired: z.boolean().optional(),
  /**
   * Enum source for `type: 'select'` and static suggestions for
   * `type: 'autocomplete'`. Either a list of strings (used both as value
   * and label) or `{ value, label }` objects.
   */
  availableValues: z
    .array(
      z.union([
        z.string(),
        z.object({ value: z.string(), label: z.string() }),
      ]),
    )
    .optional(),
  /**
   * For `type: 'autocomplete'`: pull dynamic suggestions from the named
   * field of records of another resource (e.g. `users.email`). The React
   * layer fetches a page of records and projects this field; values are
   * deduped and concatenated with `availableValues`.
   */
  suggestionsResource: z.string().optional(),
  /** Path of the field on `suggestionsResource` to project. */
  suggestionsField: z.string().optional(),
})
export type KeyValueField = z.infer<typeof keyValueFieldZ>

export interface PropertyContextBase {
  /** Owning ModernAdmin instance — useful for cross-resource lookups. */
  admin: ModernAdmin
  resource: BaseResource
  currentAdmin?: CurrentAdmin
  cache: ICacheProvider
  /** Free-form bag for callers to pass request-specific metadata. */
  [key: string]: unknown
}

export interface PropertyContext extends PropertyContextBase {
  property: BaseProperty
}

export type PropertyAccessFunction = (
  context: PropertyContext,
) => boolean | Promise<boolean>

export const propertyOptionsZ = z.object({
  /** Display name (defaults to humanized property path). */
  label: z.string().optional(),
  /** Optional helper text shown next to the field. */
  description: z.string().optional(),
  type: z.string().optional(),
  isVisible: propertyVisibilityZ.optional(),
  isAccessible: z.union([z.boolean(), z.unknown()]).optional(),
  isSortable: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
  /**
   * Treat the property as an array of values (e.g. multi-file upload, array
   * of references). Overrides the underlying schema's array flag — useful when
   * a feature plugin needs to widen a single-value column into a list at the
   * resource layer.
   */
  isArray: z.boolean().optional(),
  /** Override resource id for `reference` typed properties. */
  reference: z.string().optional(),
  /**
   * Enum / radio source. Accepts either a flat list of strings — each
   * doubles as both the stored value and the displayed label — or a list
   * of `{ value, label }` objects when label and value differ.
   */
  availableValues: z
    .array(
      z.union([
        z.string(),
        z.object({ value: z.string(), label: z.string() }),
      ]),
    )
    .optional(),
  components: propertyComponentsZ.optional(),
  position: z.number().optional(),
  /**
   * Conditional visibility for the edit form. When set, the field shows
   * only while the rule matches the current form values. Hidden fields
   * also skip required/format validation, so unrelated branches do not
   * block submission.
   */
  showWhen: showWhenZ.optional(),
  /**
   * For JSON-typed properties: declare the fixed set of keys to render with
   * the key-value editor instead of the raw JSON editor. Each entry becomes
   * a labelled row with a typed input. When omitted the JSON property keeps
   * its default raw editor.
   */
  keyValueFields: z.array(keyValueFieldZ).optional(),
  /** Free-form payload forwarded to the UI component. */
  custom: z.record(z.string(), z.unknown()).optional(),
})

export type PropertyOptions = Omit<
  z.infer<typeof propertyOptionsZ>,
  'isAccessible'
> & {
  isAccessible?: boolean | PropertyAccessFunction
}
