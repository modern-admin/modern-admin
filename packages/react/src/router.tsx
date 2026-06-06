// Routing engine compat layer over @tanstack/react-router with `createBrowserHistory()`.
//
// Why browser history? Clean, standard path-based URLs (`/resources/:id?page=2`).
// Works with server-side analytics and deep links. Requires an SPA fallback rule
// on the server (`try_files ... index.html` in nginx, `historyApiFallback` in
// Vite preview). This is the one-line standard config for any modern static host
// (Vercel, Netlify, nginx). No SSR is used — admin pages are auth-walled.
//
// Why TSR? Future-proof primitives — devtools, search-param schemas, per-route
// loaders, code-splitting — without paying for SSR/Nitro (TanStack Start).
//
// Public API (Route discriminated union, `Link`, `useRoute`, `useNavigate`,
// `buildHref`) is kept stable. `Route` is the canonical surface; the underlying
// TSR state is mapped to it via `parseLocation`. Search params are kept
// opaque to TSR (`parseSearch`/`stringifySearch` are no-ops in `admin-router`):
// `ListQueryState` (with `filters[<key>]=<v>` keys) is parsed manually from
// the raw `searchStr` so the URL format doesn't depend on TSR's JSON-search encoding.

import * as React from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'

/**
 * Provides the SPA mount basepath (e.g. `/admin`) to all navigation
 * primitives (`Link`, `useNavigate`, `useRoute`). Set by
 * `AdminRouterProvider` from `window.__MODERN_ADMIN__.basePath`. Defaults
 * to `''` (root mount).
 */
export const BasepathContext = React.createContext<string>('')

/** Returns the normalised basepath (never has a trailing slash; `''` at root). */
export const useBasepath = (): string => React.useContext(BasepathContext)

/** URL-persisted state for the resource list page. */
export interface ListQueryState {
  page?: number
  perPage?: number
  sortBy?: string
  direction?: 'asc' | 'desc'
  /** Per-column filter values keyed by property path. */
  filters?: Record<string, string>
}

export type Route =
  | { name: 'home' }
  | { name: 'audit-log' }
  | { name: 'list'; resourceId: string; query?: ListQueryState }
  | { name: 'show'; resourceId: string; recordId: string }
  | { name: 'edit'; resourceId: string; recordId: string }
  | { name: 'new'; resourceId: string }
  /** Settings hub. Sub-section selected via `section` (e.g. 'api-keys'). */
  | { name: 'settings'; section?: string }
  /**
   * Extension page registered by a Pro plugin via `registerExtensionRoute`.
   * Renders at `/ext/<key>` inside the authenticated admin shell.
   */
  | { name: 'extension'; key: string }

const parseListQuery = (search: string): ListQueryState | undefined => {
  if (!search) return undefined
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: ListQueryState = {}
  const page = params.get('page')
  if (page) {
    const n = Number(page)
    if (Number.isFinite(n) && n >= 1) out.page = n
  }
  const perPage = params.get('perPage')
  if (perPage) {
    const n = Number(perPage)
    if (Number.isFinite(n) && n >= 1) out.perPage = n
  }
  const sortBy = params.get('sortBy')
  if (sortBy) out.sortBy = sortBy
  const direction = params.get('direction')
  if (direction === 'asc' || direction === 'desc') out.direction = direction
  const filters: Record<string, string> = {}
  params.forEach((value, key) => {
    const m = key.match(/^filters\[(.+)\]$/)
    if (m && m[1] != null && value !== '') filters[m[1]] = value
  })
  if (Object.keys(filters).length > 0) out.filters = filters
  return Object.keys(out).length > 0 ? out : undefined
}

const buildListQuery = (q: ListQueryState | undefined): string => {
  if (!q) return ''
  const params = new URLSearchParams()
  if (q.page != null && q.page !== 1) params.set('page', String(q.page))
  if (q.perPage != null && q.perPage !== 20) params.set('perPage', String(q.perPage))
  if (q.sortBy) params.set('sortBy', q.sortBy)
  if (q.direction) params.set('direction', q.direction)
  if (q.filters) {
    for (const [k, v] of Object.entries(q.filters)) {
      if (v != null && v !== '') params.set(`filters[${k}]`, v)
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Map a TSR location (pathname + raw searchStr) to the canonical `Route`
 *  union the rest of the codebase consumes. Pure — used both at render
 *  time (via `useRoute`) and outside the React tree if ever needed. */
export const parseLocation = (pathname: string, searchStr: string): Route => {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'audit-log') return { name: 'audit-log' }
  if (parts[0] === 'settings') {
    const section = parts[1] ? decodeURIComponent(parts[1]) : undefined
    return section ? { name: 'settings', section } : { name: 'settings' }
  }
  if (parts[0] === 'ext' && parts[1]) {
    return { name: 'extension', key: decodeURIComponent(parts[1]) }
  }
  if (parts[0] === 'resources' && parts[1]) {
    const resourceId = decodeURIComponent(parts[1])
    if (parts[2] === 'new') return { name: 'new', resourceId }
    if (parts[2] && parts[3] === 'edit') {
      return { name: 'edit', resourceId, recordId: decodeURIComponent(parts[2]) }
    }
    if (parts[2]) return { name: 'show', resourceId, recordId: decodeURIComponent(parts[2]) }
    const query = parseListQuery(searchStr)
    return query ? { name: 'list', resourceId, query } : { name: 'list', resourceId }
  }
  return { name: 'home' }
}

/** Build a path URL for the given route. Pure — kept for tests and for
 *  `<Link>` href generation. */
export const buildHref = (route: Route): string => {
  switch (route.name) {
  case 'home':
    return '/'
  case 'audit-log':
    return '/audit-log'
  case 'list':
    return `/resources/${encodeURIComponent(route.resourceId)}${buildListQuery(route.query)}`
  case 'show':
    return `/resources/${encodeURIComponent(route.resourceId)}/${encodeURIComponent(route.recordId)}`
  case 'edit':
    return `/resources/${encodeURIComponent(route.resourceId)}/${encodeURIComponent(route.recordId)}/edit`
  case 'new':
    return `/resources/${encodeURIComponent(route.resourceId)}/new`
  case 'settings':
    return route.section ? `/settings/${encodeURIComponent(route.section)}` : '/settings'
  case 'extension':
    return `/ext/${encodeURIComponent(route.key)}`
  }
}

/** Current canonical route, derived from the live TSR state.
 *  When the router has a basepath, TSR strips it from `location.pathname`
 *  before exposing it in state — so `parseLocation` sees only the
 *  basepath-relative portion. */
export const useRoute = (): Route =>
  useRouterState({
    select: (s) => parseLocation(s.location.pathname, s.location.searchStr ?? ''),
  })

/** Imperative navigator. Same signature as the legacy custom router so
 *  call-sites don't change. Goes through TSR history → re-routing flows
 *  through TSR's lifecycle. */
export const useNavigate = (): ((route: Route) => void) => {
  const router = useRouter()
  const basepath = useBasepath()
  return React.useCallback(
    (next: Route) => {
      router.history.push(basepath + buildHref(next))
    },
    [router, basepath],
  )
}

/** Open an in-app route in a new browser tab, honouring the admin's
 *  `basepath`. `buildHref` returns a basepath-relative path, so we prepend
 *  the basepath the same way `Link`/`useNavigate` do — otherwise the new tab
 *  loads a URL outside the admin mount (e.g. `/resources/...` instead of
 *  `/admin/resources/...`). */
export const useOpenInNewTab = (): ((route: Route) => void) => {
  const basepath = useBasepath()
  return React.useCallback((route: Route) => {
    if (typeof window === 'undefined') return
    window.open(basepath + buildHref(route), '_blank', 'noopener,noreferrer')
  }, [basepath])
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: Route
}

/** Anchor with path href + client-side navigation on plain left-click.
 *  Modifier clicks (cmd/ctrl/shift/alt, middle button) fall through to
 *  default browser behaviour so "open in new tab" keeps working. */
export const Link = ({ to, onClick, ...rest }: LinkProps): React.ReactElement => {
  const router = useRouter()
  const basepath = useBasepath()
  const href = basepath + buildHref(to)
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (rest.target && rest.target !== '_self') return
      event.preventDefault()
      router.history.push(href)
    },
    [onClick, router, href, rest.target],
  )
  return <a href={href} onClick={handleClick} {...rest} />
}
