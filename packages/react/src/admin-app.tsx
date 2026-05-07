// Top-level CRUD shell. Composes provider + router + sidebar + content.

import * as React from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@modern-admin/ui'
import {
  BookOpen,
  ChevronLeft,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Home,
  Image,
  LayoutGrid,
  Mail,
  Menu,
  MessageSquare,
  Package,
  Settings,
  ShoppingCart,
  Tag,
  type LucideProps,
  Users,
} from 'lucide-react'
import { useResources, useAdminConfig } from './hooks.js'
import { Link, Router, useRoute } from './router.js'
import { ResourceListPage } from './pages/list-page.js'
import { ResourceShowPage } from './pages/show-page.js'
import { ResourceEditPage } from './pages/edit-page.js'
import { HomePage } from './pages/home-page.js'
import { useI18n } from './i18n.js'
import { LanguageSwitcher, ThemeToggle } from './header-controls.js'
import { NotifyToaster } from './notify.js'
import { DialogsProvider } from './dialogs.js'
import type { ResourceJSON } from './types.js'

// ─── Icon registry ────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<LucideProps>

const ICON_MAP: Record<string, IconComponent> = {
  BookOpen,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Home,
  Image,
  LayoutGrid,
  Mail,
  MessageSquare,
  Package,
  Settings,
  ShoppingCart,
  Tag,
  Users,
}

function NavIcon({ name, className }: { name?: string; className?: string }): React.ReactElement {
  const Icon: IconComponent = (name && ICON_MAP[name]) || Database
  return <Icon className={className} />
}

// ─── Sidebar state ────────────────────────────────────────────────────────────

const SIDEBAR_KEY = 'modern-admin:sidebar-collapsed'

function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  })
  const toggle = React.useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])
  return [collapsed, toggle]
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

interface NavGroup {
  label: string
  resources: ResourceJSON[]
}

function buildNavGroups(resources: ResourceJSON[]): {
  groups: NavGroup[]
  ungrouped: ResourceJSON[]
} {
  const groupMap = new Map<string, ResourceJSON[]>()
  const ungrouped: ResourceJSON[] = []

  for (const r of resources) {
    if (r.navigation === null) continue // explicitly hidden
    const group = r.navigation?.group
    if (group) {
      const list = groupMap.get(group) ?? []
      list.push(r)
      groupMap.set(group, list)
    } else {
      ungrouped.push(r)
    }
  }

  const groups: NavGroup[] = Array.from(groupMap.entries()).map(([label, rs]) => ({ label, resources: rs }))
  return { groups, ungrouped }
}

// ─── Nav item (expanded) ──────────────────────────────────────────────────────

function NavItem({ resource }: { resource: ResourceJSON }): React.ReactElement {
  return (
    <Link
      to={{ name: 'list', resourceId: resource.id }}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
    >
      <NavIcon name={resource.navigation?.icon} className="size-4 shrink-0 text-muted-foreground" />
      {resource.name}
    </Link>
  )
}

// ─── Nav item (icon-only with tooltip) ───────────────────────────────────────

function NavIconItem({
  resource,
}: {
  resource: ResourceJSON
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={{ name: 'list', resourceId: resource.id }}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        >
          <NavIcon name={resource.navigation?.icon} className="size-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{resource.name}</TooltipContent>
    </Tooltip>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean
  onToggle(): void
  mobileOpen: boolean
  onCloseMobile(): void
}): React.ReactElement {
  const resources = useResources()
  const { t } = useI18n()
  const route = useRoute()
  const { groups, ungrouped } = React.useMemo(() => buildNavGroups(resources), [resources])
  const allVisible = React.useMemo(
    () => [...groups.flatMap((g) => g.resources), ...ungrouped],
    [groups, ungrouped],
  )
  const defaultOpen = React.useMemo(() => groups.map((g) => g.label), [groups])

  // Auto-close the mobile drawer whenever the route changes (link tap).
  const routeKey = `${route.name}:${'resourceId' in route ? route.resourceId : ''}:${'recordId' in route ? route.recordId : ''}`
  React.useEffect(() => {
    if (mobileOpen) onCloseMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // On mobile the sidebar is a fixed slide-in drawer (always 240px wide,
  // ignores `collapsed`). On md+ it sits in-flow and animates between
  // collapsed (56px) and expanded (240px). Show the expanded view whenever
  // the mobile drawer is open, regardless of the desktop `collapsed` state.
  const showExpandedContent = mobileOpen || !collapsed

  return (
    <>
      {/* Backdrop — mobile only, when drawer is open */}
      {mobileOpen && (
        <button
          type="button"
          aria-label={t('common:close')}
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-border bg-card transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // md+: in-flow, no horizontal translate, animate width instead.
          'md:static md:translate-x-0 md:transition-[width]',
          collapsed ? 'md:w-14' : 'md:w-60',
        )}
      >
      {/* Content — clips via overflow-hidden so items don't spill during animation */}
      <div className="absolute inset-0 flex flex-col overflow-hidden py-2">
        {!showExpandedContent ? (
          /* ── Icon-only view ── */
          <div className="flex flex-col items-center gap-1 pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={{ name: 'home' }}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                >
                  <Home className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('common:home')}</TooltipContent>
            </Tooltip>

            <div className="my-1 h-px w-6 bg-border" />

            {allVisible.map((r) => (
              <NavIconItem key={r.id} resource={r} />
            ))}
          </div>
        ) : (
          /* ── Expanded view ── */
          <div className="flex flex-col gap-0.5 px-2">
            <Link
              to={{ name: 'home' }}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Home className="size-4 shrink-0 text-muted-foreground" />
              {t('common:home')}
            </Link>

            {ungrouped.length > 0 && (
              <div className="mt-1 flex flex-col gap-0.5">
                {ungrouped.map((r) => (
                  <NavItem key={r.id} resource={r} />
                ))}
              </div>
            )}

            {groups.length > 0 && (
              <Accordion type="multiple" defaultValue={defaultOpen} className="mt-1 w-full">
                {groups.map((group) => (
                  <AccordionItem key={group.label} value={group.label} className="border-0">
                    <AccordionTrigger className="px-2">{group.label}</AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="flex flex-col gap-0.5">
                        {group.resources.map((r) => (
                          <NavItem key={r.id} resource={r} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        )}
      </div>

      {/* Toggle button — sits on the right edge; hidden on mobile (burger handles it). */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute right-0 top-5 z-10 hidden h-5 w-5 translate-x-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
      >
        <ChevronLeft
          className="size-3 transition-transform duration-300"
          style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
    </aside>
    </>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  onOpenMobile,
}: {
  onOpenMobile(): void
}): React.ReactElement {
  const { data } = useAdminConfig()
  const { t } = useI18n()
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobile}
        aria-label={t('common:openMenu')}
      >
        <Menu className="size-5" />
      </Button>
      <div className="font-semibold">
        {data?.branding?.companyName ?? t('common:appName')}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  )
}

// ─── Route switch ─────────────────────────────────────────────────────────────

function RouteSwitch(): React.ReactElement {
  const route = useRoute()
  switch (route.name) {
    case 'list':
      return <ResourceListPage resourceId={route.resourceId} />
    case 'show':
      return <ResourceShowPage resourceId={route.resourceId} recordId={route.recordId} />
    case 'edit':
      return <ResourceEditPage resourceId={route.resourceId} recordId={route.recordId} />
    case 'new':
      return <ResourceEditPage resourceId={route.resourceId} />
    case 'home':
    default:
      return <HomePage />
  }
}

// ─── AdminApp ─────────────────────────────────────────────────────────────────

export function AdminApp(): React.ReactElement {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <Router>
      <DialogsProvider>
        <TooltipProvider delayDuration={300}>
          <div className="flex h-screen w-screen flex-col bg-background text-foreground">
            <Header onOpenMobile={() => setMobileOpen(true)} />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar
                collapsed={collapsed}
                onToggle={toggleCollapsed}
                mobileOpen={mobileOpen}
                onCloseMobile={() => setMobileOpen(false)}
              />
              <main className="flex-1 overflow-auto p-4 sm:p-6">
                <RouteSwitch />
              </main>
            </div>
            <NotifyToaster />
          </div>
        </TooltipProvider>
      </DialogsProvider>
    </Router>
  )
}
