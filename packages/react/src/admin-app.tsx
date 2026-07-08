// Top-level CRUD shell. Composes provider + router + sidebar + content.
// Sidebar is the shadcn `<Sidebar>` recipe — collapsible to icons on
// desktop and rendered as a Sheet on mobile via the `useSidebar` context.

import * as React from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  cn,
  useSidebar,
} from '@modern-admin/ui'
import {
  ChevronDown,
  ChevronLeft,
  Database,
  Home,
  Loader2,
  LogOut,
  History,
  Menu,
  Search,
  Settings,
  User,
} from 'lucide-react'
import { getSidebarExtensions } from './extension-registry.js'
import { useAdminClient } from './provider.js'
import { useRealtimeInvalidation } from './realtime.js'
import { createSocketRealtimeSubscriber } from './realtime-socket.js'
import { useAdminConfig, useCurrentUser, useFeatures, useLogout, useResources } from './hooks.js'
import { LoginPage } from './pages/login-page.js'
import type { CurrentUser } from './types.js'
import { Link, useRoute, useNavigate } from './router.js'
import { AdminRouterProvider } from './admin-router.js'
import { useI18n } from './i18n.js'
import { LanguageSwitcher, ThemeToggle } from './header-controls.js'
import { NotifyToaster } from './notify.js'
import { DialogsProvider } from './dialogs.js'
import { HotkeyRegistryProvider } from './hotkey-registry.js'
import { HotkeyHelpButton } from './hotkey-help.js'
import type { ResourceJSON } from './types.js'
import { NavIcon } from './nav-icon.js'
import { useHotkey } from './use-hotkey.js'

// Heavy, conditionally shown surfaces stay out of the critical-path chunk:
// the assistant widget only mounts when the backend advertises the feature,
// and the search dialog only after the user first opens it.
const AiAssistantWidget = React.lazy(() =>
  import('./components/ai-assistant-widget.js').then((m) => ({ default: m.AiAssistantWidget })),
)
const GlobalSearchDialog = React.lazy(() =>
  import('./components/global-search-dialog.js').then((m) => ({ default: m.GlobalSearchDialog })),
)

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
    const group = r.navigation?.name ?? r.navigation?.group
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

// ─── Sidebar group collapse persistence ───────────────────────────────────────

const SIDEBAR_GROUPS_KEY = 'sidebar:groups:collapsed'

function loadCollapsedGroups(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsedGroups(collapsed: Set<string>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify([...collapsed]))
  } catch { /* quota / private mode — ignore */ }
}

function isResourceActive(route: ReturnType<typeof useRoute>, resourceId: string): boolean {
  return (
    (route.name === 'list' || route.name === 'show' || route.name === 'edit' || route.name === 'new') &&
    'resourceId' in route &&
    route.resourceId === resourceId
  )
}

function ResourceMenuItem({
  resource,
  showId,
}: {
  resource: ResourceJSON
  showId: boolean
}): React.ReactElement {
  const route = useRoute()
  const active = isResourceActive(route, resource.id)
  const hasAlias = resource.name !== resource.id
  const withId = showId && hasAlias
  const tooltip = withId ? `${resource.name} (${resource.id})` : resource.name
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={tooltip}>
        <Link to={{ name: 'list', resourceId: resource.id }}>
          <NavIcon name={resource.navigation?.icon} />
          <span className="min-w-0 flex-1 truncate">
            {resource.name}
            {withId && (
              <span className="ml-0.5 text-xs opacity-60"> ({resource.id})</span>
            )}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ─── Desktop collapse pill — round chevron on the right edge of the sidebar.
//     Sits half-outside the sidebar (translate-x-1/2) and rotates the chevron
//     when the sidebar is in icon/collapsed state. Hidden on mobile (the
//     header burger handles that).
function SidebarCollapseToggle(): React.ReactElement {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="absolute right-0 top-24 z-50 hidden h-5 w-5 translate-x-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
    >
      <ChevronLeft
        className="size-3 transition-transform duration-300"
        style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
      />
    </button>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function AppSidebar({ showResourceIds }: { showResourceIds: boolean }): React.ReactElement {
  const resources = useResources()
  const features = useFeatures()
  const { t } = useI18n()
  const route = useRoute()
  const { data: config } = useAdminConfig()
  const appName = config?.branding?.companyName ?? t('common:appName')
  const { groups, ungrouped } = React.useMemo(() => buildNavGroups(resources), [resources])
  const { isMobile, setOpenMobile, state } = useSidebar()

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(loadCollapsedGroups)
  const toggleGroup = React.useCallback((label: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      saveCollapsedGroups(next)
      return next
    })
  }, [])

  // Auto-close the mobile drawer whenever the route changes (link tap).
  const routeKey = `${route.name}:${'resourceId' in route ? route.resourceId : ''}:${'recordId' in route ? route.recordId : ''}`
  React.useEffect(() => {
    if (isMobile) setOpenMobile(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  const homeActive = route.name === 'home'
  const auditActive = route.name === 'audit-log'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 flex-row items-center gap-2 border-b border-border px-3 py-0 sm:h-14 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Database className="size-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
          {appName}
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={homeActive} tooltip={t('common:home')}>
                <Link to={{ name: 'home' }}>
                  <Home />
                  <span>{t('common:home')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {features.auditLog && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={auditActive} tooltip={t('audit:title')}>
                  <Link to={{ name: 'audit-log' }}>
                    <History />
                    <span>{t('audit:title')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {getSidebarExtensions()
              .filter((ext) => !ext.featureGate || !!(features as unknown as Record<string, unknown>)[ext.featureGate])
              .map((ext) => {
                const extActive =
                  route.name === 'extension' && route.key === ext.extensionKey
                return (
                  <SidebarMenuItem key={ext.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={extActive}
                      tooltip={ext.label}
                    >
                      <Link to={{ name: 'extension', key: ext.extensionKey }}>
                        <ext.icon />
                        <span>{ext.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            {ungrouped.map((r) => (
              <ResourceMenuItem key={r.id} resource={r} showId={showResourceIds} />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {groups.map((group) => {
          // In icon mode the label is hidden (opacity-0) and items show as
          // icon-only tooltips — always show items regardless of collapse state.
          const isOpen = state === 'collapsed' || !collapsedGroups.has(group.label)
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel asChild>
                <button
                  type="button"
                  className="w-full cursor-pointer justify-between hover:bg-accent hover:text-accent-foreground"
                  onClick={() => toggleGroup(group.label)}
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 transition-transform duration-200',
                      !isOpen && '-rotate-90',
                    )}
                  />
                </button>
              </SidebarGroupLabel>
              {isOpen && (
                <SidebarMenu>
                  {group.resources.map((r) => (
                    <ResourceMenuItem key={r.id} resource={r} showId={showResourceIds} />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarFooter />
      <SidebarCollapseToggle />
    </Sidebar>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function userInitials(user: CurrentUser): string {
  const source = user.name?.trim() || user.email?.trim() || user.id
  const parts = source.split(/\s+|[._@-]/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

function UserMenu({ user }: { user: CurrentUser }): React.ReactElement {
  const { t } = useI18n()
  const logout = useLogout()
  const navigate = useNavigate()
  const features = useFeatures()
  const initials = userInitials(user)
  const display = user.name || user.email || user.id
  // First section advertised by the backend — the entry in the user menu
  // jumps straight there. When every section is disabled (no api-keys,
  // no webhooks, no ai-assistant) the Settings entry is hidden entirely.
  const firstSettingsSection: 'api-keys' | 'webhooks' | 'ai-assistant' | null =
    features.apiKeys ? 'api-keys'
      : features.webhooks ? 'webhooks'
        : features.aiAssistant ? 'ai-assistant'
          : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={display}
        >
          <Avatar className="size-7">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={display} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{display}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-1">
        <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2">
          <Avatar className="size-8">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={display} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{display}</span>
            {user.email && user.email !== display && (
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            )}
            {user.role && (
              <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                {user.role}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        {firstSettingsSection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-3 px-3 py-2"
              onSelect={(e) => {
                e.preventDefault()
                navigate({ name: 'settings', section: firstSettingsSection })
              }}
            >
              <Settings className="size-4 text-muted-foreground" />
              <span>{t('settings:menuItem')}</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-3 px-3 py-2"
          disabled={logout.isPending}
          onSelect={(e) => {
            e.preventDefault()
            logout.mutate()
          }}
        >
          <LogOut className="size-4 text-muted-foreground" />
          <span>{t('auth:logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Header trigger that opens the cross-resource command palette. Renders
 *  as a full-width "search" button on desktop (with a ⌘K hint) and collapses
 *  to an icon-only button on mobile. */
function GlobalSearchTrigger({
  onOpen,
}: {
  onOpen(): void
}): React.ReactElement {
  const { t } = useI18n()
  // Detect macOS so the keyboard hint reads ⌘K vs Ctrl+K. Falls back to
  // platform-agnostic mod key on SSR / unknown UAs.
  const isMac = React.useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
  }, [])
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpen}
        aria-label={t('globalSearch:title')}
        className="hidden h-9 w-full max-w-xs justify-start gap-2 px-3 text-muted-foreground sm:inline-flex"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left text-sm">
          {t('globalSearch:trigger')}
        </span>
        <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {isMac ? <span aria-hidden="true">⌘</span> : <span aria-hidden="true">Ctrl</span>}
          <span aria-hidden="true">K</span>
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        aria-label={t('globalSearch:title')}
        className="sm:hidden"
      >
        <Search className="size-4" />
      </Button>
    </>
  )
}

function Header({ user }: { user: CurrentUser | null }): React.ReactElement {
  const { t } = useI18n()
  const { setOpenMobile } = useSidebar()
  const [searchOpen, setSearchOpen] = React.useState(false)
  // Mount the dialog (and fetch its chunk) only once the palette has been
  // opened; keep it mounted afterwards so the close animation still plays.
  const everOpened = React.useRef(false)
  if (searchOpen) everOpened.current = true
  // Cmd+K on macOS, Ctrl+K elsewhere — both expressed via `mod`. Allowed in
  // input contexts so users can pop the palette while typing in any field.
  useHotkey('mod+k', () => setSearchOpen((prev) => !prev), {
    allowInInput: true,
    description: t('globalSearch:hotkey'),
    group: t('common:search'),
  })
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:h-14 sm:gap-3 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpenMobile(true)}
        aria-label={t('common:openMenu')}
      >
        <Menu className="size-5" />
      </Button>
      <GlobalSearchTrigger onOpen={() => setSearchOpen(true)} />
      <div className="ml-auto flex items-center gap-1">
        <HotkeyHelpButton />
        <LanguageSwitcher />
        <ThemeToggle />
        {user ? (
          <UserMenu user={user} />
        ) : (
          <Button variant="ghost" size="icon" disabled aria-label={t('auth:login')}>
            <User className="size-4 opacity-50" />
          </Button>
        )}
      </div>
      {(searchOpen || everOpened.current) && (
        <React.Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </React.Suspense>
      )}
    </header>
  )
}

// ─── AdminApp ─────────────────────────────────────────────────────────────────

export interface AdminAppProps {
  /** Optional helper line shown under the title on the login screen — e.g.
   *  demo credentials. */
  loginHint?: React.ReactNode
  /**
   * URL prefix where the SPA is mounted (e.g. `/admin`). Injected
   * automatically from `window.__MODERN_ADMIN__.basePath` by the standalone
   * bundle. Drives the router basepath so all navigation and deep-link
   * refreshes stay under the correct prefix. Defaults to `''` (root mount).
   */
  basePath?: string
  /**
   * When true, the sidebar resource list appends the raw resource id in
   * parentheses next to the localized label (e.g. "Posts (posts)") when
   * the label differs from the id. Defaults to `false` to keep the
   * sidebar tidy. The home-page resource tiles and selector dropdowns
   * (chart builder, etc.) always render both — they are not affected.
   */
  showSidebarResourceIds?: boolean
}

function FullscreenSpinner(): React.ReactElement {
  const { t } = useI18n()
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Database className="size-6 text-primary" />
        </span>
        <span className="text-xl font-semibold tracking-tight">
          {t('common:appName')}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{t('common:loading')}</span>
      </div>
    </div>
  )
}

// Invisible bridge: while mounted (i.e. the user is authenticated and the
// backend advertises `features.realtime`), keeps a socket.io connection to
// the realtime gateway and live-invalidates the query cache on mutation
// events from other sessions/instances.
function RealtimeCacheBridge(): null {
  const client = useAdminClient()
  const subscriber = React.useMemo(
    () => createSocketRealtimeSubscriber({ baseUrl: client.apiBaseUrl }),
    [client],
  )
  useRealtimeInvalidation(subscriber)
  return null
}

// `ShellLayout` is the rootRoute component supplied to TSR via context.
// `useCurrentUser()` here is safe — provider/query state is set up upstream
// in `AdminApp`, and by the time this layout renders the user is guaranteed
// to be authenticated (otherwise `AdminApp` short-circuits to `<LoginPage/>`).
function ShellLayout({
  children,
  showSidebarResourceIds,
}: {
  children: React.ReactNode
  showSidebarResourceIds: boolean
}): React.ReactElement {
  const { user } = useCurrentUser()
  const features = useFeatures()
  return (
    <HotkeyRegistryProvider>
      <DialogsProvider>
        <SidebarProvider>
          <AppSidebar showResourceIds={showSidebarResourceIds} />
          {/* `h-svh` on SidebarInset is the key to the scroll layout: it
              constrains the inset to exactly the viewport height, which lets
              the inner `<main overflow-auto>` (flex-1) actually scroll
              internally instead of letting the whole page scroll. Without
              this, `min-h-svh` made the inset grow with content, the main
              never overflowed, and `position: sticky` inside it had no
              scrolling ancestor to pin against.

              `overflow-hidden` is also required: without it, the inner
              `<main overflow-auto>`'s clipped descendant layout boxes still
              propagate into the SidebarInset's (and document's) scrollHeight,
              producing a second, page-level scrollbar that scrolls the whole
              SidebarInset out of view into empty background. */}
          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <Header user={user} />
            {/* Padding has no `pb`: sticky footers (e.g. list-page paginator)
                must be able to reach the viewport bottom, but `position: sticky`
                is bounded by its containing block, which lives inside `<main>`'s
                padding. With `pb-0`, the sticky element can extend all the way
                down. Children that don't have a sticky footer add their own
                bottom spacing via the `pb-4 sm:pb-6` class. */}
            <main className="min-h-0 min-w-0 flex-1 overflow-auto px-2 pt-2 sm:px-6 sm:pt-6">
              {children}
            </main>
            {features.aiAssistant && (
              <React.Suspense fallback={null}>
                <AiAssistantWidget />
              </React.Suspense>
            )}
            {features.realtime && <RealtimeCacheBridge />}
          </SidebarInset>
          <NotifyToaster />
        </SidebarProvider>
      </DialogsProvider>
    </HotkeyRegistryProvider>
  )
}

export function AdminApp({
  loginHint,
  basePath,
  showSidebarResourceIds,
}: AdminAppProps = {}): React.ReactElement {
  const { user, isLoading, isAuthenticated } = useCurrentUser()
  // Kick off the bootstrap config fetch in parallel with the session check.
  // The shell needs both, and serialising them (me → render shell → config)
  // costs a full extra round-trip on every cold load. A 401 while logged
  // out is harmless — `useLogin` invalidates the config query on success.
  useAdminConfig()
  const showIds = showSidebarResourceIds ?? false
  // Capture the option in a stable layout component so the router doesn't
  // remount the whole shell whenever the prop reference changes.
  const Layout = React.useMemo(
    () =>
      function ConfiguredShellLayout({ children }: { children: React.ReactNode }): React.ReactElement {
        return <ShellLayout showSidebarResourceIds={showIds}>{children}</ShellLayout>
      },
    [showIds],
  )
  if (isLoading) return <FullscreenSpinner />
  if (!isAuthenticated || !user) return <LoginPage hint={loginHint} />
  return <AdminRouterProvider ShellLayout={Layout} basepath={basePath ?? ''} />
}
