import { z } from 'zod'

/**
 * Single many-to-many relation declared on a parent resource.
 *
 * The relation is materialised through a **real junction table** that is
 * itself registered with the admin as a regular `BaseResource`. The feature
 * then layers a virtual property on the parent resource that reads/writes
 * junction rows transparently — including any extra columns on the
 * junction table (e.g. `addedAt`, `position`, `role`).
 *
 * @example
 *   m2mFeature({
 *     property: 'tags',
 *     through: 'postTags',     // junction resource id
 *     localKey: 'postId',      // junction → parent FK
 *     foreignKey: 'tagId',     // junction → reference FK
 *     reference: 'tags',       // referenced resource id
 *     extraFields: ['addedAt'],
 *   })
 */
export const m2mRelationZ = z.object({
  /** Virtual property name on the parent resource (the form field). */
  property: z.string(),
  /** Resource id of the junction table. */
  through: z.string(),
  /** FK column on the junction pointing back to the parent record. */
  localKey: z.string(),
  /** FK column on the junction pointing to the referenced record. */
  foreignKey: z.string(),
  /** Resource id of the referenced (other-side) records. */
  reference: z.string(),
  /**
   * Junction columns surfaced to the editor. Any column not listed is left
   * untouched on update (preserved verbatim from the existing junction row).
   */
  extraFields: z.array(z.string()).optional(),
  /**
   * Hide the junction resource from sidebar navigation. Defaults to `true`
   * — junctions are usually implementation detail.
   */
  hideJunctionFromNav: z.boolean().optional().default(true),
  /**
   * Cascade-delete junction rows when the parent record is deleted. Most
   * databases enforce this via FK `ON DELETE CASCADE`, but for adapters
   * that don't (in-memory) we do it in user space.
   */
  cascadeDelete: z.boolean().optional().default(true),
  /**
   * Optional human label for the property — defaults to humanised
   * `property`. The label is **not** translated by the feature; supply
   * an i18n key via the resource options' `properties[<property>].label`.
   */
  label: z.string().optional(),
})

/**
 * Parsed (output) shape — defaults applied. Used internally by the feature.
 */
export type M2MRelation = z.infer<typeof m2mRelationZ>

/**
 * Public input shape for `m2mFeature(...)` — fields with defaults
 * (`hideJunctionFromNav`, `cascadeDelete`) are optional.
 */
export type M2MRelationInput = z.input<typeof m2mRelationZ>

/**
 * Shape of a single m2m item carried in `record.params[<property>]` once
 * the feature's read hook has hydrated the response.
 *
 * `id` is the **referenced** record id; everything else is the matching
 * junction-row's extra-fields.
 */
export interface M2MItem extends Record<string, unknown> {
  id: string
}

/** Junction-row representation as returned by the underlying resource. */
export interface JunctionRow extends Record<string, unknown> {
  id: string
}

/**
 * Custom payload attached to the virtual property's `custom` field; the
 * UI layer reads it to render the m2m editor with the right configuration.
 */
export interface M2MCustomData {
  m2m: {
    reference: string
    through: string
    localKey: string
    foreignKey: string
    extraFields: string[]
  }
}
