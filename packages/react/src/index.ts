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
} from './hooks.js'
export {
  PropertyDisplay,
  PropertyEditor,
  type PropertyDisplayProps,
  type PropertyEditorProps,
} from './property-renderer.js'
export {
  Router,
  Link,
  useRoute,
  useNavigate,
  buildHref,
  type Route,
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
