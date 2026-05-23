// @modern-admin/react — React-side runtime: provider, hooks, property-type
// renderers, ComponentLoader, and a default <AdminApp> shell.

export {
  AdminClient,
  AdminApiError,
  type AdminClientOptions,
  type AiAssistantChatEnqueueResponse,
  type AiAssistantChatMessage,
  type AiAssistantChatResponse,
  type AiAssistantCitation,
  type AiAssistantSettings,
  type AiAssistantTask,
  type ApiKeyRecord,
  type UploadedFileInfo,
  type UploadProgress,
  type UploadFileOptions,
  type UploadFilesOptions,
} from './client.js'
export { ComponentLoader, type ComponentEntry } from './component-loader.js'
export {
  ModernAdminProvider,
  useAdminClient,
  useAdminContext,
  type ModernAdminProviderProps,
} from './provider.js'
export {
  useAdminConfig,
  useFeatures,
  useResource,
  useResources,
  useRecords,
  useRecord,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
  useBulkDeleteRecords,
  useInvokeResourceAction,
  useSearchRecords,
  useCurrentUser,
  useLogin,
  useLogout,
  type CurrentUserResult,
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
export {
  I18nProvider,
  useI18n,
  type I18nProviderProps,
  type MetadataKeyValueFieldTranslations,
  type MetadataPropertyTranslations,
  type MetadataActionTranslations,
  type MetadataResourceTranslations,
  type MetadataLocaleTranslations,
  type MetadataTranslations,
} from './i18n.js'
export { useHotkey, type HotkeyOptions } from './use-hotkey.js'
export {
  HotkeyRegistryProvider,
  useRegisteredHotkeys,
  type HotkeyDescriptor,
} from './hotkey-registry.js'
export { HotkeyHelpButton } from './hotkey-help.js'
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
  type FormValuesGetter,
  type Translator,
} from './validation.js'
export { evaluateShowWhen } from './show-when.js'
export {
  Link,
  useRoute,
  useNavigate,
  buildHref,
  parseLocation,
  type Route,
  type ListQueryState,
  type LinkProps,
} from './router.js'
export { AdminApp, type AdminAppProps } from './admin-app.js'
export { LoginPage, type LoginPageProps } from './pages/login-page.js'
export {
  useRealtimeInvalidation,
  applyDeletionLocally,
  type RealtimeSubscriber,
  type RealtimeWireEvent,
} from './realtime.js'
export { ResourceListPage } from './pages/list-page.js'
export { ResourceShowPage } from './pages/show-page.js'
export { ResourceEditPage } from './pages/edit-page.js'
export {
  ResourceWizardCreatePage,
  type ResourceWizardCreatePageProps,
} from './pages/wizard-create-page.js'
export {
  WizardForm,
  type WizardStep,
  type WizardFormLabels,
  type WizardFormProps,
} from './components/wizard-form.js'
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
  AdminFeatures,
  ActionDescriptor,
  CurrentUser,
  ListQuery,
  ListResponse,
  PropertyJSON,
  RecordJSON,
  RecordResponse,
  RelatedResource,
  ResourceJSON,
  ShowWhenSpec,
  View,
} from './types.js'
export { RelatedRecordsTabs } from './components/related-records-tabs.js'
export {
  ReferenceMultiTableDialog,
  type ReferenceMultiTableDialogProps,
} from './components/reference-multi-table-dialog.js'
export {
  LocalStorageDashboardStore,
  ServerDashboardStore,
  useDashboardCharts,
  resolveRange,
  emitDashboardReload,
  type UseDashboardChartsOptions,
  type UseDashboardChartsResult,
} from './use-dashboard-charts.js'
