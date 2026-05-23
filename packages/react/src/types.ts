// Wire-shape mirror of `ResourceDecorator#toJSON()` and friends. We re-declare
// rather than re-import so the React bundle doesn't drag in the full core
// (which references Node-only deps in a few corners).

export type View = 'list' | 'show' | 'edit' | 'filter'

/**
 * Mirror of `core` `ShowWhen` — declarative rule that conditionally hides a
 * field on the edit form based on the current value of another form field.
 * Operators combine with OR semantics; `defaultWhenEmpty` triggers when the
 * control field is null / undefined / ''.
 */
export interface ShowWhenSpec {
  field: string
  equals?: unknown
  notEquals?: unknown
  in?: unknown[]
  notIn?: unknown[]
  isEmpty?: boolean
  defaultWhenEmpty?: boolean
}

/**
 * Mirror of `core` `KeyValueField` — declares one row in the key-value
 * editor used as a friendly alternative to the raw JSON editor.
 */
export interface KeyValueFieldSpec {
  key: string
  label?: string
  type?: 'string' | 'number' | 'boolean' | 'textarea' | 'select' | 'autocomplete'
  description?: string
  placeholder?: string
  isRequired?: boolean
  availableValues?: ReadonlyArray<string | { value: string; label: string }>
  /** For `type: 'autocomplete'`: pull dynamic suggestions from another resource. */
  suggestionsResource?: string
  /** Path of the field on `suggestionsResource` to project. */
  suggestionsField?: string
}

export interface PropertyJSON {
  path: string
  label: string
  type: string
  isId: boolean
  isSortable: boolean
  isRequired: boolean
  isDisabled: boolean
  isArray: boolean
  reference: string | null
  availableValues: Array<{ value: string; label: string }> | null
  components: { list?: string; edit?: string; show?: string; filter?: string } | Record<string, string>
  visibility: Record<View, boolean>
  position: number
  description?: string
  showWhen?: ShowWhenSpec
  keyValueFields?: KeyValueFieldSpec[]
  custom: Record<string, unknown>
}

export interface ActionGroup {
  name: string
  icon?: string
}

export interface ActionDescriptor {
  name: string
  actionType: 'resource' | 'record' | 'bulk'
  resourceId: string
  nesting?: ActionGroup[]
  guard?: string
  component?: string | null
  custom?: Record<string, unknown>
}

export interface RelatedResource {
  resourceId: string
  foreignKey: string
  label?: string
}

export interface ResourceJSON {
  id: string
  name: string
  navigation: { name?: string; icon?: string; group?: string } | null
  relatedResources?: RelatedResource[]
  properties: PropertyJSON[]
  actions: ActionDescriptor[]
}

export interface CurrentUser {
  id: string
  email?: string
  name?: string
  role?: string
  avatarUrl?: string
  [claim: string]: unknown
}

/**
 * Mirror of `core` `AdminFeatures`. Each flag is `true` iff the
 * corresponding backend subsystem is wired and ready. The SPA uses these
 * to hide UI surfaces (audit-log link, settings sections, revisions
 * button, AI assistant widget) for features the host hasn't enabled.
 */
export interface AdminFeatures {
  auditLog: boolean
  history: boolean
  webhooks: boolean
  apiKeys: boolean
  aiAssistant: boolean
}

const ALL_FEATURES_OFF: AdminFeatures = {
  auditLog: false,
  history: false,
  webhooks: false,
  apiKeys: false,
  aiAssistant: false,
}

/** Defensive resolver for older API servers that don't yet surface
 *  `features` in their `/admin/api/config` payload — every flag falls back
 *  to `false`, so optional surfaces stay hidden until the backend opts in. */
export const resolveFeatures = (raw?: Partial<AdminFeatures>): AdminFeatures => ({
  ...ALL_FEATURES_OFF,
  ...(raw ?? {}),
})

export interface AdminConfig {
  rootPath: string
  branding?: { companyName?: string; logo?: string; theme?: string }
  auth: Record<string, unknown>
  resources: ResourceJSON[]
  features?: Partial<AdminFeatures>
}

export interface RecordJSON {
  id: string
  title: string
  params: Record<string, unknown>
  populated: Record<string, unknown>
  errors: Record<string, unknown>
  baseError: unknown | null
}

export interface ListResponse {
  records: RecordJSON[]
  meta: { total: number; page: number; perPage: number; sortBy?: string; direction?: 'asc' | 'desc' }
}

export interface RecordResponse {
  record: RecordJSON
}

/** Generic response from a custom action invocation (record / bulk / resource). */
export interface CustomActionResponse {
  record?: RecordJSON
  records?: RecordJSON[]
  notice?: { message: string; type: 'success' | 'info' | 'error' | 'warning' }
  redirectUrl?: string
  [key: string]: unknown
}

export interface ListQuery {
  page?: number
  perPage?: number
  sortBy?: string
  direction?: 'asc' | 'desc'
  filters?: Record<string, string>
}
