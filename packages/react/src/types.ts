// Wire-shape mirror of `ResourceDecorator#toJSON()` and friends. We re-declare
// rather than re-import so the React bundle doesn't drag in the full core
// (which references Node-only deps in a few corners).

export type View = 'list' | 'show' | 'edit' | 'filter'

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
  custom: Record<string, unknown>
}

export interface ActionDescriptor {
  name: string
  actionType: 'resource' | 'record' | 'bulk'
  resourceId: string
  guard?: string
  component?: string | null
  custom?: Record<string, unknown>
}

export interface ResourceJSON {
  id: string
  name: string
  navigation: { name?: string; icon?: string; group?: string } | null
  properties: PropertyJSON[]
  actions: ActionDescriptor[]
}

export interface AdminConfig {
  rootPath: string
  branding?: { companyName?: string; logo?: string; theme?: string }
  auth: Record<string, unknown>
  resources: ResourceJSON[]
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

export interface ListQuery {
  page?: number
  perPage?: number
  sortBy?: string
  direction?: 'asc' | 'desc'
  filters?: Record<string, string>
}
