// Tiny hash-router. We avoid TanStack Router so the package stays
// transport-agnostic and works as a drop-in inside the host app's router. The
// hash-based URLs (`#/resources/:id`) survive page refresh and history.back()
// without server-side routing rules.

import * as React from 'react'

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
  | { name: 'list'; resourceId: string; query?: ListQueryState }
  | { name: 'show'; resourceId: string; recordId: string }
  | { name: 'edit'; resourceId: string; recordId: string }
  | { name: 'new'; resourceId: string }

const parseListQuery = (search: string): ListQueryState | undefined => {
  if (!search) return undefined
  const params = new URLSearchParams(search)
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

const parseHash = (): Route => {
  const raw = (typeof window !== 'undefined' ? window.location.hash : '') || ''
  const trimmed = raw.replace(/^#\/?/, '')
  const [pathPart, queryPart = ''] = trimmed.split('?')
  const parts = (pathPart ?? '').split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'resources' && parts[1]) {
    const resourceId = decodeURIComponent(parts[1])
    if (parts[2] === 'new') return { name: 'new', resourceId }
    if (parts[2] && parts[3] === 'edit') {
      return { name: 'edit', resourceId, recordId: decodeURIComponent(parts[2]) }
    }
    if (parts[2]) return { name: 'show', resourceId, recordId: decodeURIComponent(parts[2]) }
    const query = parseListQuery(queryPart)
    return query ? { name: 'list', resourceId, query } : { name: 'list', resourceId }
  }
  return { name: 'home' }
}

export const buildHref = (route: Route): string => {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'list':
      return `#/resources/${encodeURIComponent(route.resourceId)}${buildListQuery(route.query)}`
    case 'show':
      return `#/resources/${encodeURIComponent(route.resourceId)}/${encodeURIComponent(route.recordId)}`
    case 'edit':
      return `#/resources/${encodeURIComponent(route.resourceId)}/${encodeURIComponent(route.recordId)}/edit`
    case 'new':
      return `#/resources/${encodeURIComponent(route.resourceId)}/new`
  }
}

const RouterContext = React.createContext<{
  route: Route
  navigate(route: Route): void
} | null>(null)

export function Router({ children }: { children: React.ReactNode }): React.ReactElement {
  const [route, setRoute] = React.useState<Route>(() => parseHash())
  React.useEffect(() => {
    const handler = () => setRoute(parseHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  const navigate = React.useCallback((next: Route) => {
    window.location.hash = buildHref(next).slice(1)
  }, [])
  return (
    <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
  )
}

export const useRoute = (): Route => {
  const ctx = React.useContext(RouterContext)
  if (!ctx) throw new Error('useRoute must be inside <Router />')
  return ctx.route
}

export const useNavigate = (): ((route: Route) => void) => {
  const ctx = React.useContext(RouterContext)
  if (!ctx) throw new Error('useNavigate must be inside <Router />')
  return ctx.navigate
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: Route
}

export const Link = ({ to, children, ...rest }: LinkProps): React.ReactElement => (
  <a href={buildHref(to)} {...rest}>
    {children}
  </a>
)
