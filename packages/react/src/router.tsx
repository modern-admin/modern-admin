// Tiny hash-router. We avoid TanStack Router so the package stays
// transport-agnostic and works as a drop-in inside the host app's router. The
// hash-based URLs (`#/resources/:id`) survive page refresh and history.back()
// without server-side routing rules.

import * as React from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'list'; resourceId: string }
  | { name: 'show'; resourceId: string; recordId: string }
  | { name: 'edit'; resourceId: string; recordId: string }
  | { name: 'new'; resourceId: string }

const parseHash = (): Route => {
  const raw = (typeof window !== 'undefined' ? window.location.hash : '') || ''
  const path = raw.replace(/^#\/?/, '').split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'resources' && parts[1]) {
    const resourceId = decodeURIComponent(parts[1])
    if (parts[2] === 'new') return { name: 'new', resourceId }
    if (parts[2] && parts[3] === 'edit') {
      return { name: 'edit', resourceId, recordId: decodeURIComponent(parts[2]) }
    }
    if (parts[2]) return { name: 'show', resourceId, recordId: decodeURIComponent(parts[2]) }
    return { name: 'list', resourceId }
  }
  return { name: 'home' }
}

export const buildHref = (route: Route): string => {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'list':
      return `#/resources/${encodeURIComponent(route.resourceId)}`
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
