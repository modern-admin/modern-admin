// Code-based route tree wired up to @tanstack/react-router. Imported by
// `admin-app.tsx` and renders the entire authenticated shell as the root
// route's component. Each leaf route is a thin wrapper that pulls typed
// `params` and renders the existing page component (page props remain a
// public API surface — no changes to ResourceListPage/ResourceShowPage/etc.).
//
// History: browser (`createBrowserHistory`) — clean path-based URLs.
// Requires an SPA fallback rule on the server (e.g. `try_files ... index.html`
// in nginx, historyApiFallback in Vite). See `router.tsx` and `docs/frontend.md`.
//
// Basepath: `AdminRouterProvider` accepts a `basepath` prop (e.g. `/admin`)
// injected automatically from `window.__MODERN_ADMIN__.basePath`. The router
// is created with that basepath so TSR strips it from URLs before route
// matching. `BasepathContext` exposes it to `Link` and `useNavigate` so they
// can prepend it when pushing to browser history.
//
// Search params: TSR's default JSON-style parser would mangle our existing
// `filters[<path>]=<value>` URL format. We make `parseSearch`/`stringifySearch`
// no-ops (TSR keeps `searchStr` raw); `useRoute()` re-parses `searchStr` into
// `ListQueryState` via `parseLocation` in `router.tsx`.

import * as React from 'react'
import {
  createBrowserHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { BasepathContext } from './router.js'
import { getRouteExtension } from './extension-registry.js'
import { useI18n } from './i18n.js'
import type { WizardStep } from './components/wizard-form.js'

// Every page is a lazy chunk so the critical-path bundle stops at the shell
// (sidebar + header). Heavy dependencies then ride in the page chunk that
// actually uses them — recharts with the dashboard, tiptap with the record
// pages — instead of blocking first paint for all of them on every load.
const HomePage = React.lazy(() => import('./pages/home-page.js').then((m) => ({ default: m.HomePage })))
const AuditLogPage = React.lazy(() => import('./pages/audit-log-page.js').then((m) => ({ default: m.AuditLogPage })))
const SettingsPage = React.lazy(() => import('./pages/settings-page.js').then((m) => ({ default: m.SettingsPage })))
const ResourceListPage = React.lazy(() => import('./pages/list-page.js').then((m) => ({ default: m.ResourceListPage })))
const ResourceShowPage = React.lazy(() => import('./pages/show-page.js').then((m) => ({ default: m.ResourceShowPage })))
const ResourceEditPage = React.lazy(() => import('./pages/edit-page.js').then((m) => ({ default: m.ResourceEditPage })))
const ResourceWizardCreatePage = React.lazy(() =>
  import('./pages/wizard-create-page.js').then((m) => ({ default: m.ResourceWizardCreatePage })),
)

// ─── Route tree ───────────────────────────────────────────────────────────────

interface RouterContext {
  ShellLayout: React.ComponentType<{ children: React.ReactNode }>
}

// Suspense fallback while a lazy page chunk streams in. Purely visual —
// no text, so it needs no i18n wiring.
function PageChunkSpinner(): React.ReactElement {
  return (
    <div role="status" aria-busy="true" className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
    </div>
  )
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  // The actual shell (sidebar + header + main) lives in `admin-app.tsx`.
  // It's passed in via the router's context at provider time so we don't
  // create a circular module dependency between admin-app and admin-router.
  component: function RootRouteShell() {
    const { ShellLayout } = rootRoute.useRouteContext()
    return (
      <ShellLayout>
        <React.Suspense fallback={<PageChunkSpinner />}>
          <Outlet />
        </React.Suspense>
      </ShellLayout>
    )
  },
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function HomeRouteComponent() {
    return <HomePage />
  },
})

const auditLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-log',
  component: function AuditLogRouteComponent() {
    return <AuditLogPage />
  },
})

const resourceListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$resourceId',
  component: function ResourceListRouteComponent() {
    const { resourceId } = resourceListRoute.useParams()
    return <ResourceListPage resourceId={resourceId} />
  },
})

// Products new-record route uses a 3-step WizardForm as a showcase.
// Step 3 has no `properties` list — it becomes the catch-all for every
// property not claimed by steps 1 or 2 (thumbnail, accentColor, gallery, tags).
function ProductsNewPage(): React.ReactElement {
  const { t } = useI18n()
  const steps: WizardStep[] = [
    { label: t('wizard:products.step1'), properties: ['name', 'sku', 'inStock'] },
    { label: t('wizard:products.step2'), properties: ['price', 'currencyCode', 'quantity'] },
    { label: t('wizard:products.step3') }, // catch-all: thumbnail, accentColor, gallery, tags
  ]
  return <ResourceWizardCreatePage resourceId="products" steps={steps} />
}

const resourceNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$resourceId/new',
  component: function ResourceNewRouteComponent() {
    const { resourceId } = resourceNewRoute.useParams()
    if (resourceId === 'products') return <ProductsNewPage />
    return <ResourceEditPage resourceId={resourceId} />
  },
})

const resourceShowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$resourceId/$recordId',
  component: function ResourceShowRouteComponent() {
    const { resourceId, recordId } = resourceShowRoute.useParams()
    return <ResourceShowPage resourceId={resourceId} recordId={recordId} />
  },
})

const resourceEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$resourceId/$recordId/edit',
  component: function ResourceEditRouteComponent() {
    const { resourceId, recordId } = resourceEditRoute.useParams()
    return <ResourceEditPage resourceId={resourceId} recordId={recordId} />
  },
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: function SettingsIndexRouteComponent() {
    return <SettingsPage />
  },
})

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/$section',
  component: function SettingsSectionRouteComponent() {
    const { section } = settingsSectionRoute.useParams()
    return <SettingsPage section={section} />
  },
})

// Route for Pro extension pages registered via `registerExtensionRoute`.
// The component reads `key` from params and looks up the registered
// extension at render time — so it works even if extensions are registered
// after module init but before the user navigates to the route.
const extensionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ext/$extKey',
  component: function ExtensionRouteComponent() {
    const { extKey } = extensionRoute.useParams()
    const ext = getRouteExtension(extKey)
    if (!ext) {
      // Extension was registered for this key in the sidebar but no component
      // was provided. Render a minimal placeholder rather than a blank screen.
      return (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-sm">Extension &quot;{extKey}&quot; not found.</p>
        </div>
      )
    }
    return <ext.component />
  },
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  auditLogRoute,
  extensionRoute,
  resourceNewRoute,
  resourceEditRoute,
  resourceShowRoute,
  resourceListRoute,
  settingsSectionRoute,
  settingsIndexRoute,
])

// ─── Router instance ──────────────────────────────────────────────────────────
//
// Search params: in TSR v1.169 `location.searchStr` is computed as
// `stringifySearch(parseSearch(rawUrlSearch))` — it's NOT the raw URL search
// string. Our list page reads `searchStr` to extract `filters[<path>]=<value>`
// pairs (see `parseLocation` in `router.tsx`), so the parse/stringify pair
// must be a flat-key identity round-trip rather than TSR's default
// JSON-encoded values (which would mangle the bracket notation) or no-ops
// (which would drop the search entirely — filters/sort never reach the API).

const flatParseSearch = (search: string): Record<string, string> => {
  const str = search.startsWith('?') ? search.slice(1) : search
  if (!str) return {}
  const params = new URLSearchParams(str)
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

const flatStringifySearch = (search: Record<string, unknown>): string => {
  if (!search) return ''
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(search)) {
    if (v == null || v === '') continue
    params.set(k, typeof v === 'string' ? v : String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

const noopRouterContext: RouterContext = {
  // Replaced at provider mount time via the `context` prop on RouterProvider.
  ShellLayout: () => null,
}

function makeRouter(basepath: string) {
  return createRouter({
    routeTree,
    history: createBrowserHistory(),
    basepath: basepath || '/',
    parseSearch: flatParseSearch,
    stringifySearch: flatStringifySearch,
    context: noopRouterContext,
    defaultPreload: false,
    scrollRestoration: false,
  })
}

// Type registration — gives typed `useParams()`/`useSearch()` and link
// validation across the package. The concrete router type uses the root
// router shape (basepath doesn't affect the generic types).
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface AdminRouterProviderProps {
  /** Component rendered as the authenticated shell. Receives `children` —
   *  must include an `<Outlet/>` slot (or a child element wrapping it) so
   *  routed page components can mount inside it. */
  ShellLayout: React.ComponentType<{ children: React.ReactNode }>
  /** URL prefix where the SPA is mounted (e.g. `/admin`). Defaults to `''`
   *  (root mount). Passed to TSR as the router `basepath` AND exposed to
   *  `Link`/`useNavigate` via `BasepathContext` so they push full paths. */
  basepath?: string
}

/** Mounts the admin's route tree. Must be rendered only after the user is
 *  authenticated — login flow happens upstream in `AdminApp`. */
export function AdminRouterProvider({
  ShellLayout,
  basepath = '',
}: AdminRouterProviderProps): React.ReactElement {
  // Normalise: strip trailing slash, treat '/' as 'no basepath' (root mount).
  const normalised = React.useMemo(() => {
    if (!basepath || basepath === '/') return ''
    return basepath.endsWith('/') ? basepath.slice(0, -1) : basepath
  }, [basepath])
  // Create router lazily per basepath. Runtime config is stable across the
  // app's lifetime, so in practice this runs exactly once per mount.
  const router = React.useMemo(() => makeRouter(normalised), [normalised])
  const context = React.useMemo<RouterContext>(() => ({ ShellLayout }), [ShellLayout])
  return (
    <BasepathContext.Provider value={normalised}>
      <RouterProvider router={router} context={context} />
    </BasepathContext.Provider>
  )
}
