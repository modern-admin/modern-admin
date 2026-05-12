---
title: Frontend
description: UI architecture, ModernAdminProvider, AdminApp shell, hooks, routing, and custom component extension points.
---

# Frontend

The Modern Admin frontend is split into two packages with distinct responsibilities:

| Package | Role |
|---|---|
| `@modern-admin/ui` | Primitive shadcn/ui components — i18n-unaware, usable standalone |
| `@modern-admin/react` | Provider, hooks, property renderers, `ComponentLoader`, `AdminApp` shell |

---

## Architecture overview

```
<I18nProvider>                    — locale + translations context
  <ModernAdminProvider>           — QueryClient + AdminClient + ComponentLoader context
    <AdminApp>                    — auth gate + shell layout
      <AppSidebar>                — collapsible nav (shadcn Sidebar recipe)
      <Header>                    — user menu, theme toggle, language switcher
      <main>                      — router outlet
        <HomePage>                — dashboard with charts
        <ResourceListPage>        — table, filters, bulk actions, export
        <ResourceShowPage>        — read-only record + related records tabs
        <ResourceEditPage>        — react-hook-form + Zod validation
        ...
```

`PropertyDisplay` and `PropertyEditor` are the two rendering primitives:
they switch on `PropertyJSON.type` to pick the right widget, then check
`ComponentLoader` for a custom override before falling back to the built-in.

---

## Provider setup

```tsx
// src/App.tsx
import { I18nProvider, ModernAdminProvider, AdminApp } from '@modern-admin/react'
import '@modern-admin/ui/styles.css'

export function App() {
  return (
    <I18nProvider>
      <ModernAdminProvider
        clientOptions={{
          baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
          credentials: 'include',
        }}
      >
        <AdminApp />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
```

### `ModernAdminProvider` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `AdminClient` | auto-created | Pre-built client instance |
| `clientOptions` | `AdminClientOptions` | — | `{ baseUrl, credentials, persistDemoSession? }` |
| `queryClient` | `QueryClient` | auto-created | Override TanStack Query client |
| `components` | `ComponentLoader` | none | Registry of custom property components |
| `children` | `ReactNode` | **required** | |

### `AdminApp` props

| Prop | Type | Description |
|---|---|---|
| `loginHint` | `ReactNode` | Optional text shown under credentials form (useful in demos) |

---

## `AdminApp` shell

`AdminApp` renders three top-level states:

1. **Loading** — fullscreen spinner while the `me` query resolves.
2. **Unauthenticated** — `<LoginPage>` (or your custom login page).
3. **Authenticated** — full shell: sidebar + header + main content area.

The shell layout (`ShellLayout`) composes:
- `<SidebarProvider>` / `<AppSidebar>` — collapsible to icon-only on desktop,
  renders as a Sheet drawer on mobile.
- `<Header>` — sticky top bar with hamburger (mobile), hotkey help, language
  switcher, theme toggle, and user menu (avatar + dropdown).
- `<main>` — router outlet; receives the current page component.
- `<AiAssistantWidget>` — floating AI assistant button (when enabled).
- `<NotifyToaster>` — toast notifications.

### Sidebar navigation

Resources appear in the sidebar in the order defined by `navigation.order`.
Set `navigation: null` on a resource to hide it from the sidebar.

Group resources under a collapsible section by setting `navigation.group`:

```ts
@AdminResource({
  source: () => new DrizzleResource(db, posts),
  navigation: { group: 'Content', order: 1 },
})
export class PostsController extends AdminController<Post> {}
```

Icons are resolved from a built-in map of `lucide-react` names:
`BookOpen`, `Database`, `FileText`, `FolderOpen`, `Home`, `Image`,
`LayoutGrid`, `Mail`, `MessageSquare`, `Package`, `Settings`,
`ShoppingCart`, `Tag`, `Users`.

Sidebar group collapse state is persisted to `localStorage`.

---

## Routing

The router uses `@tanstack/react-router` with `createBrowserHistory()`.
URLs are standard path-based — the server must return `index.html` for
all admin paths (nginx `try_files $uri /index.html`).

```
/                             → home (dashboard)
/audit-log                    → audit log
/resources/:resourceId        → list
/resources/:resourceId/new    → create
/resources/:resourceId/:id    → show
/resources/:resourceId/:id/edit → edit
/settings                     → settings
/settings/:section            → settings section (e.g. api-keys)
```

The public navigation API uses the `Route` discriminated union — **not**
TanStack Router's internal typed paths — so call sites stay stable:

```ts
import { Link, useNavigate, useRoute, buildHref } from '@modern-admin/react'

const navigate = useNavigate()
navigate({ name: 'edit', resourceId: 'users', recordId: 'u1' })

// Declarative link
<Link to={{ name: 'list', resourceId: 'users', query: { page: 2 } }}>
  Page 2
</Link>

// href for middle-click "open in new tab"
const href = buildHref({ name: 'show', resourceId: 'orders', recordId: 'o1' })
```

`useRoute()` returns the current typed route object:

```ts
const route = useRoute()
// route.name === 'list' | 'show' | 'edit' | 'new' | 'home' | ...
// route.resourceId, route.recordId — available when relevant
```

---

## Hooks

All hooks are thin TanStack Query wrappers, re-exported from `@modern-admin/react`:

### Data hooks

| Hook | Returns | Description |
|---|---|---|
| `useAdminConfig()` | `AdminConfig` | Server config (resources, branding, auth) |
| `useResource(id)` | `ResourceJSON \| undefined` | Single resource descriptor |
| `useResources()` | `ResourceJSON[]` | All resources, i18n-localised |
| `useRecords(id, query?)` | `ListResponse` | Paginated list with optional filter/sort |
| `useRecord(id, recordId)` | `RecordResponse` | Single record |
| `useRecordHistory(id, recordId)` | `HistoryListResponse` | Record revisions |
| `useAuditLog(query?)` | `AuditLogResponse` | Audit log entries |
| `useTimeSeries(query)` | `TimeSeriesResponse` | Timeseries chart data |

### Mutation hooks

| Hook | Mutation input | Description |
|---|---|---|
| `useCreateRecord(id)` | `Record<string, unknown>` | POST new record |
| `useUpdateRecord(id)` | `{ id, payload }` | PATCH existing record |
| `useDeleteRecord(id)` | `string` (recordId) | DELETE record |
| `useBulkDeleteRecords(id)` | `string[]` | DELETE multiple records |
| `useInvokeRecordAction(id)` | `{ recordId, actionName }` | POST custom record action |
| `useInvokeBulkAction(id)` | `{ actionName, ids }` | POST custom bulk action |
| `useInvokeResourceAction(id)` | `{ actionName, payload? }` | POST custom resource action |

### Auth hooks

| Hook | Description |
|---|---|
| `useCurrentUser()` | `{ user, isLoading, isAuthenticated }` |
| `useLogin()` | Email/password mutation |
| `useLogout()` | Clears session and all query cache |

### Other hooks

| Hook | Description |
|---|---|
| `useAdminClient()` | Raw `AdminClient` for lower-level calls |
| `useI18n()` | `{ t, locale, setLocale, availableLocales }` |
| `useNotify()` | `{ success, error, info, warning }` |
| `useDialogs()` | `{ confirm, alert, open }` — imperative dialog API |
| `useHotkey(key, handler)` | Register a keyboard shortcut |

---

## Property renderer extension — `ComponentLoader`

`PropertyDisplay` (read-only) and `PropertyEditor` (form) can be replaced
per-property and per-view-slot with any React component you register in
`ComponentLoader`.

### Resolution order

```
PropertyDisplay / PropertyEditor renders a property
  ↓ reads property.components[view]  (e.g. "my-rating-editor")
  ↓ ComponentLoader.get("my-rating-editor")
  ├── found → renders your component    ← custom code
  └── not found → built-in switch(property.type)
```

### Step 1 — write the component

```tsx
// src/admin-components.tsx
import {
  ComponentLoader,
  type PropertyDisplayProps,
  type PropertyEditorProps,
} from '@modern-admin/react'

// Custom editor for a "rating" field
function StarRatingEditor({ value, onChange, disabled }: PropertyEditorProps) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className="flex gap-1">
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onChange(s)}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
          className={Number(value) >= s ? 'text-yellow-400' : 'text-muted-foreground'}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// Custom display for a "status" field
function StatusBadge({ value }: PropertyDisplayProps) {
  const color: Record<string, string> = {
    active: 'text-emerald-600',
    inactive: 'text-muted-foreground',
    banned: 'text-destructive',
  }
  return (
    <span className={color[String(value)] ?? ''}>
      {String(value ?? '—')}
    </span>
  )
}

export const adminComponents = new ComponentLoader()
  .add('star-rating-editor', StarRatingEditor)
  .add('status-badge', StatusBadge)
```

### Step 2 — pass the loader to `ModernAdminProvider`

```tsx
import { adminComponents } from './admin-components'

<ModernAdminProvider components={adminComponents} clientOptions={...}>
  <AdminApp />
</ModernAdminProvider>
```

### Step 3 — reference the name in the NestJS decorator

```ts
// posts.controller.ts
@AdminResource({
  source: () => new DrizzleResource(db, posts),
  properties: {
    rating: {
      type: 'number',
      components: {
        edit: 'star-rating-editor',   // PropertyEditor
        list: 'star-rating-editor',   // PropertyDisplay in table cells
        show: 'star-rating-editor',   // PropertyDisplay on show page
      },
    },
    status: {
      type: 'string',
      availableValues: ['active', 'inactive', 'banned'],
      components: {
        list: 'status-badge',
        show: 'status-badge',
        // edit: not set → built-in <Select> is used
      },
    },
  },
})
export class PostsController extends AdminController<Post> {}
```

### Component prop contracts

```ts
// Display component — read-only
interface PropertyDisplayProps {
  property: PropertyJSON   // full descriptor including property.custom
  value: unknown
  view?: 'list' | 'show'
}

// Editor component — controlled form input
interface PropertyEditorProps {
  property: PropertyJSON
  value: unknown
  onChange(next: unknown): void
  disabled?: boolean
  resourceId?: string   // provided for type: 'file'
}
```

Access arbitrary per-property metadata via `property.custom`:

```tsx
function PriorityEditor({ property, value, onChange }: PropertyEditorProps) {
  // custom metadata set on the server: custom: { maxRating: 10 }
  const max = typeof property.custom?.maxRating === 'number'
    ? property.custom.maxRating
    : 5
  return <RangeInput value={Number(value)} max={max} onChange={onChange} />
}
```

### `ComponentLoader` API

```ts
class ComponentLoader {
  add(name: string, component: React.ComponentType<any>): this  // fluent
  has(name: string): boolean
  get(name: string): React.ComponentType<any> | undefined
  list(): string[]   // all registered names
}
```

No runtime bundling — components are regular ES module imports. No dynamic
`import()`, no Webpack magic, no cold-start penalty.

---

## Custom action UI component

When a custom action needs its own full-page UI (not just a server-side
handler), declare `component` in the action descriptor and register the
page component by that name:

```ts
// backend
@Action({
  name: 'bulk-export',
  actionType: 'resource',
  label: 'Bulk export',
  component: 'bulk-export-page',
})
async bulkExport(ctx: ListContext<Order>) {
  return {}  // UI handles everything
}
```

```tsx
// frontend
adminComponents.add('bulk-export-page', function BulkExportPage() {
  const { t } = useI18n()
  const route = useRoute()
  // route.name === 'resource-action', route.resourceId available
  return <div>…custom export UI…</div>
})
```

The component is rendered in the main content area where the standard
list/show/edit pages normally appear.

---

## Overriding the shell

`AdminApp` is the default shell. You can bypass it entirely and compose
the pieces yourself — useful when you need a custom sidebar, embedded mode,
or a different navigation structure.

```tsx
import {
  ModernAdminProvider,
  I18nProvider,
  ResourceListPage,
  ResourceShowPage,
  ResourceEditPage,
  useCurrentUser,
  useResources,
  Link,
} from '@modern-admin/react'

function MyAdminShell() {
  const { user, isLoading, isAuthenticated } = useCurrentUser()
  const resources = useResources()

  if (isLoading) return <div>Loading…</div>
  if (!isAuthenticated) return <MyLoginPage />

  return (
    <div className="flex h-screen">
      {/* Custom sidebar */}
      <nav className="w-56 border-r border-border p-4">
        {resources.map((r) => (
          <Link key={r.id} to={{ name: 'list', resourceId: r.id }}
                className="block py-1 text-sm">
            {r.name}
          </Link>
        ))}
      </nav>

      {/* Content area — wire your own router here */}
      <main className="flex-1 overflow-auto p-6">
        <ResourceListPage resourceId="users" />
      </main>
    </div>
  )
}

export function App() {
  return (
    <I18nProvider>
      <ModernAdminProvider clientOptions={{ baseUrl: '/api' }}>
        <MyAdminShell />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
```

### Standalone page components

All page components accept a `resourceId` prop and render without the
`AdminApp` shell:

| Component | Required props | Description |
|---|---|---|
| `ResourceListPage` | `resourceId` | Table, filters, bulk actions, export |
| `ResourceShowPage` | `resourceId`, `recordId` | Read-only record detail |
| `ResourceEditPage` | `resourceId`, `recordId?` | Edit (or create when no `recordId`) |
| `HomePage` | none | Dashboard with charts + resource tiles |

---

## Adding custom widgets to pages

For pages where you want to inject your own widgets alongside the built-in
content (e.g. a chart on the show page), the recommended pattern is to
compose a wrapper around the page component:

```tsx
function UsersShowPage({ recordId }: { recordId: string }) {
  const { data } = useRecord('users', recordId)
  return (
    <div className="space-y-6">
      {/* built-in show page */}
      <ResourceShowPage resourceId="users" recordId={recordId} />

      {/* your custom widget below */}
      {data && <UserActivityChart userId={data.record.id} />}
    </div>
  )
}
```

---

## Theming

See the [Design system & theming](/docs/design-system) page for full token
reference and dark mode configuration.

Quick reference:

```css
/* src/styles.css — override after importing the base */
@import '@modern-admin/ui/styles.css';

:root {
  --primary: 142 76% 36%;   /* your brand color as HSL */
  --radius: 0.5rem;
}
```

```ts
import { initTheme, setThemeMode } from '@modern-admin/ui'

initTheme()              // reads localStorage, falls back to system preference
setThemeMode('dark')     // 'light' | 'dark' | 'system'
```
