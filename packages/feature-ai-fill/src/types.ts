/**
 * Public types for `@modern-admin/feature-ai-fill`.
 */

/**
 * Per-field overrides applied when an AI model is asked to extract values
 * from an uploaded image. Each editable property of the resource is included
 * in the generated Zod schema by default; use this config to:
 *
 *   - exclude a property from the schema (`exclude: true`);
 *   - give the model an extra hint (`hint`) — what to look for, format
 *     constraints, examples — appended to the schema description.
 */
export interface AiFillFieldConfig {
  /** Free-form natural-language hint passed to the model alongside the field. */
  hint?: string
  /** Hide the field from the generated schema even though it is editable. */
  exclude?: boolean
}

/**
 * Options consumed by `aiFillFeature()`.
 */
export interface AiFillFeatureOptions {
  /**
   * Optional system-prompt suffix appended to the default instructions.
   * Useful for domain-specific guidance ("This is a passport / receipt /
   * product label, extract …").
   */
  prompt?: string
  /**
   * Override the OpenRouter model used by this resource. Defaults to the
   * `aiAssistant.defaultModel` configured on the module / stored in
   * `configStore`. The chosen model must support vision input.
   */
  model?: string
  /**
   * Per-field configuration keyed by property path.
   *
   * @default — every editable property is included with no hint.
   */
  fields?: Record<string, AiFillFieldConfig>
}

/** Wire response shape returned by `POST /actions/aiFill`. */
export interface AiFillResponse {
  /** Object map keyed by property path. Values may be null when the model
   *  could not extract them — frontend should skip nulls. */
  values: Record<string, unknown>
}
