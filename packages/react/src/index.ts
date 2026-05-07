// @modern-admin/react — React-side runtime: provider, hooks, property-type
// renderers, ComponentLoader, and a default <AdminApp> shell.

export { AdminClient, AdminApiError, type AdminClientOptions } from './client.js'
export { ComponentLoader, type ComponentEntry } from './component-loader.js'
export {
  ModernAdminProvider,
  useAdminClient,
  useAdminContext,
  type ModernAdminProviderProps,
} from './provider.js'
export {
  useAdminConfig,
  useResource,
  useResources,
  useRecords,
  useRecord,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
  useBulkDeleteRecords,
  useSearchRecords,
} from './hooks.js'
export {
  PropertyDisplay,
  PropertyEditor,
  type PropertyDisplayProps,
  type PropertyEditorProps,
} from './property-renderer.js'
export {
  ReferenceLink,
  ReferenceLinkList,
  ReferenceCombobox,
  ReferenceMultiCombobox,
} from './reference.js'
export { I18nProvider, useI18n, type I18nProviderProps } from './i18n.js'
export { ThemeToggle, LanguageSwitcher } from './header-controls.js'
export { NotifyToaster, useNotify, type NotifyMessage } from './notify.js'
export {
  DialogsProvider,
  useDialogs,
  type DialogsApi,
  type ConfirmOptions,
  type AlertOptions,
  type OpenOptions,
  type DialogsProviderProps,
} from './dialogs.js'
export {
  buildValidationSchema,
  buildPropertySchema,
  defaultValueFor,
  type Translator,
} from './validation.js'
export {
  Router,
  Link,
  useRoute,
  useNavigate,
  buildHref,
  type Route,
  type ListQueryState,
  type LinkProps,
} from './router.js'
export { AdminApp } from './admin-app.js'
export {
  useRealtimeInvalidation,
  applyDeletionLocally,
  type RealtimeSubscriber,
  type RealtimeWireEvent,
} from './realtime.js'
export { ResourceListPage } from './pages/list-page.js'
export { ResourceShowPage } from './pages/show-page.js'
export { ResourceEditPage } from './pages/edit-page.js'
export { HomePage } from './pages/home-page.js'
export { ExportDialog, type ExportDialogProps } from './pages/export-dialog.js'
export {
  PageBreadcrumbs,
  homeCrumb,
  type BreadcrumbItemSpec,
  type PageBreadcrumbsProps,
} from './breadcrumbs.js'
export {
  fetchAllRecords,
  recordsToCsv,
  recordsToJson,
  csvEscape,
  downloadText,
  exportFilename,
  type ExportFormat,
  type FetchAllOptions,
  type SerializeOptions,
} from './export.js'
export type {
  AdminConfig,
  ActionDescriptor,
  ListQuery,
  ListResponse,
  PropertyJSON,
  RecordJSON,
  RecordResponse,
  ResourceJSON,
  View,
} from './types.js'
