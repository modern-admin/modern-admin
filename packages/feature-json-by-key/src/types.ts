// Types for `@modern-admin/feature-json-by-key`.
//
// `jsonByKeyFeature` lets a single JSON column on the database side
// (`{ <key>: <value>, … }`) be edited as N virtual sub-properties on the
// frontend, where the visible sub-property is picked by another form field
// — the *control field*. The classic use case is a `previews` column that
// stores per-region file URLs, plus a `region` enum that selects which
// regional preview is being edited.
//
// The feature is adapter-agnostic and works with any property type for the
// children (string, textarea, file, reference, …). For `type: 'file'`
// children, the upload provider is wired through the standard
// `UploadProviderRegistry` from `@modern-admin/feature-upload`, so the
// existing `/admin/api/resources/:id/actions/upload` controller serves
// uploads for the virtuals out of the box.

import type { IUploadProvider } from '@modern-admin/feature-upload'

/** Keyer context passed to a child's `uploadPath` callback. */
export interface JsonByKeyUploadContext {
  /** The JSON key the file will be stored under (e.g. region code). */
  key: string
  /** The original property path on the resource (the JSON column name). */
  property: string
}

/**
 * Configuration for files inside a JSON-by-key child. Surfaced as a
 * sub-object so non-file children stay simple.
 */
export interface JsonByKeyUploadConfig {
  provider: IUploadProvider
  mimeTypes?: string[]
  maxSize?: number
  /**
   * Key generator for the storage backend. Receives the original filename
   * plus a `JsonByKeyUploadContext` so the path can encode the JSON key
   * (e.g. `previews/east-eu/<uuid>.jpg`).
   */
  uploadPath?: (filename: string, ctx: JsonByKeyUploadContext) => string
}

/** Per-child shape — describes a single value inside the JSON object. */
export interface JsonByKeyChildConfig {
  /**
   * Underlying property type for the virtual sub-property. Defaults to
   * `'string'`. For files, set `type: 'file'` and supply `upload`.
   */
  type?: string
  /** Mark child as an array (e.g. multi-file gallery per region). */
  isArray?: boolean
  /** Reference target resource id when `type: 'reference'`. */
  reference?: string
  /** Whether the child is required (per-key required check). */
  isRequired?: boolean
  /** Optional helper text shown below the editor. */
  description?: string
  /** Pre-defined values for enum-like children. */
  availableValues?: Array<string | { value: string; label: string }>
  /** File-upload settings (only meaningful when `type: 'file'`). */
  upload?: JsonByKeyUploadConfig
}

/** Per-(JSON-property) configuration. */
export interface JsonByKeyPropertyConfig {
  /** Shape of one cell inside the JSON object. */
  child: JsonByKeyChildConfig
  /**
   * Optional override for the visible label of each virtual.
   * Receives the JSON key — e.g. `(region) => 'Превью ' + regionName(region)`.
   */
  label?: (key: string) => string
  /**
   * Position offset added to the original property's position. Useful when
   * a JSON column has many keys and you want the virtuals grouped.
   */
  positionOffset?: number
}

/** Top-level options for `jsonByKeyFeature`. */
export interface JsonByKeyFeatureOptions {
  /**
   * Path of the existing enum/string property whose value picks which JSON
   * key is currently being edited. Each virtual is shown only when this
   * field equals its key.
   */
  controlField: string
  /** All JSON keys that participate in the form. */
  keys: ReadonlyArray<string>
  /**
   * Key shown by default when the control field is blank. Maps to
   * `showWhen.defaultWhenEmpty`. Optional — if omitted, the user must
   * pick a value to see any of the sub-fields.
   */
  defaultKey?: string
  /**
   * Separator placed between the original property name and the JSON key
   * to form the virtual property path (e.g. `previews__east-eu`). Default
   * is `__` because it is safe in URLs, RHF field paths, and avoids
   * collisions with adapter-specific `.` nesting.
   */
  separator?: string
  /** Map of original JSON property path → per-property configuration. */
  properties: Record<string, JsonByKeyPropertyConfig>
}

/**
 * Marker payload attached to virtual properties' `custom` field so the
 * frontend can recognise them and (optionally) render extra affordances.
 */
export interface JsonByKeyCustomData {
  jsonByKey: {
    sourceProperty: string
    key: string
  }
}
