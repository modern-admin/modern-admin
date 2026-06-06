import * as React from 'react'
import { diffSnapshots } from '@modern-admin/core'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateRangeInput,
  DiffView,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from '@modern-admin/ui'
import { ChevronDown, ChevronUp, ExternalLink, FilePlus, FileText, Key, KeyRound, Loader2, LogIn, Pencil, Trash2 } from 'lucide-react'
import { useInfiniteAuditLog, useRecord, useRecordHistory, useResource, useResources } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { Link } from '../router.js'
import { USERS_RESOURCE_ID, useUserDirectory, userLabelOf } from '../user-directory.js'
import type {
  AuditLogEntry,
  AuditLogQuery,
  HistoryDiffEntry,
  HistoryRevision,
} from '../client.js'
import type { RecordJSON, ResourceJSON } from '../types.js'

const ALL = '__all__'
const ACTIONS = ['new', 'edit', 'delete', 'bulkDelete', 'login', 'apiKey.create', 'apiKey.update', 'apiKey.delete']
/** Virtual resource IDs that don't map to ORM resources. */
const VIRTUAL_RESOURCE_LABELS: Record<string, string> = {
  __auth__: 'audit:virtualResource.auth',
  __api_keys__: 'audit:virtualResource.apiKeys',
}
interface ActionStyle {
  Icon: React.ComponentType<{ className?: string }>
  iconClass: string
  bgClass: string
  titleKey: string
}

const FALLBACK_STYLE: ActionStyle = {
  Icon: FileText,
  iconClass: 'text-muted-foreground',
  bgClass: 'bg-muted',
  titleKey: '',
}

const ACTION_STYLES: Record<string, ActionStyle> = {
  new: {
    Icon: FilePlus,
    iconClass: 'text-blue-600 dark:text-blue-300',
    bgClass: 'bg-blue-100 dark:bg-blue-950/40',
    titleKey: 'audit:action.new',
  },
  edit: {
    Icon: Pencil,
    iconClass: 'text-emerald-600 dark:text-emerald-300',
    bgClass: 'bg-emerald-100 dark:bg-emerald-950/40',
    titleKey: 'audit:action.edit',
  },
  delete: {
    Icon: Trash2,
    iconClass: 'text-rose-600 dark:text-rose-300',
    bgClass: 'bg-rose-100 dark:bg-rose-950/40',
    titleKey: 'audit:action.delete',
  },
  bulkDelete: {
    Icon: Trash2,
    iconClass: 'text-rose-600 dark:text-rose-300',
    bgClass: 'bg-rose-100 dark:bg-rose-950/40',
    titleKey: 'audit:action.bulkDelete',
  },
  login: {
    Icon: LogIn,
    iconClass: 'text-violet-600 dark:text-violet-300',
    bgClass: 'bg-violet-100 dark:bg-violet-950/40',
    titleKey: 'audit:action.login',
  },
  'apiKey.create': {
    Icon: Key,
    iconClass: 'text-amber-600 dark:text-amber-300',
    bgClass: 'bg-amber-100 dark:bg-amber-950/40',
    titleKey: 'audit:action.apiKeyCreate',
  },
  'apiKey.update': {
    Icon: KeyRound,
    iconClass: 'text-amber-600 dark:text-amber-300',
    bgClass: 'bg-amber-100 dark:bg-amber-950/40',
    titleKey: 'audit:action.apiKeyUpdate',
  },
  'apiKey.delete': {
    Icon: Trash2,
    iconClass: 'text-rose-600 dark:text-rose-300',
    bgClass: 'bg-rose-100 dark:bg-rose-950/40',
    titleKey: 'audit:action.apiKeyDelete',
  },
}

/** Format `entry.at` (unix-ms) as a relative phrase like "2m ago", falling
 *  back to absolute date for entries older than a week. Uses
 *  `Intl.RelativeTimeFormat` so output is locale-aware. */
function useRelativeTimeFormatter(
  locale: string,
): (atMs: number, nowMs: number) => string {
  const rtf = React.useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    [locale],
  )
  const dtf = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  )
  return React.useCallback(
    (atMs, nowMs) => {
      const sec = Math.round((nowMs - atMs) / 1000)
      if (sec < 45) return rtf.format(-Math.max(sec, 0), 'second')
      if (sec < 3600) return rtf.format(-Math.round(sec / 60), 'minute')
      if (sec < 86400) return rtf.format(-Math.round(sec / 3600), 'hour')
      if (sec < 86400 * 7) return rtf.format(-Math.round(sec / 86400), 'day')
      return dtf.format(new Date(atMs))
    },
    [dtf, rtf],
  )
}

const initialsOf = (label: string): string => {
  const parts = label.split(/\s+|[._@-]/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

const PAGE_SIZE = 25

export function AuditLogPage(): React.ReactElement {
  const { t, locale } = useI18n()
  const resources = useResources()
  const [filters, setFilters] = React.useState<Omit<AuditLogQuery, 'before' | 'limit' | 'offset'>>({})

  const log = useInfiniteAuditLog(filters, PAGE_SIZE)

  // Flatten all pages into one list, trimming the sentinel "+1" entry from each page
  const events = React.useMemo(
    () =>
      (log.data?.pages ?? []).flatMap((page) => page.events.slice(0, PAGE_SIZE)),
    [log.data],
  )

  const userIds = React.useMemo(
    () => Array.from(new Set(events.map((e) => e.userId).filter((v): v is string => !!v))),
    [events],
  )
  const users = useUserDirectory(userIds)

  const resourceMap = React.useMemo(() => {
    const map: Record<string, ResourceJSON> = {}
    for (const r of resources) map[r.id] = r
    return map
  }, [resources])

  const userResourceExists = resources.some((r) => r.id === USERS_RESOURCE_ID)

  const formatRelative = useRelativeTimeFormatter(locale)
  const formatAbsolute = React.useCallback(
    (value: number) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)),
    [locale],
  )

  // `now` is a snapshot for relative-time labels — we want it to refresh
  // whenever a new page of events arrives, even though `events` is not read
  // inside the callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => Date.now(), [events])

  // IntersectionObserver sentinel — triggers next page load when visible
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log
  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const resetFilters = (patch: Partial<typeof filters>): void => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div className="space-y-2 sm:space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('audit:title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Select
            value={filters.resourceId ?? ALL}
            onValueChange={(v) => resetFilters({ resourceId: v === ALL ? undefined : v })}
          >
            <SelectTrigger aria-label={t('audit:resource')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('audit:allResources')}</SelectItem>
              {Object.entries(VIRTUAL_RESOURCE_LABELS).map(([id, key]) => (
                <SelectItem key={id} value={id}>{t(key)}</SelectItem>
              ))}
              {resources.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.name}
                  {resource.name !== resource.id && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({resource.id})</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.actions?.[0] ?? ALL}
            onValueChange={(v) => resetFilters({ actions: v === ALL ? undefined : [v] })}
          >
            <SelectTrigger aria-label={t('audit:action')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('audit:allActions')}</SelectItem>
              {ACTIONS.map((action) => {
                const style = ACTION_STYLES[action]
                return (
                  <SelectItem key={action} value={action}>
                    {style?.titleKey ? t(style.titleKey) : action}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <Input
            value={filters.recordId ?? ''}
            placeholder={t('audit:recordId')}
            onChange={(e) => resetFilters({ recordId: e.target.value || undefined })}
          />
          <Input
            value={filters.userId ?? ''}
            placeholder={t('audit:userId')}
            onChange={(e) => resetFilters({ userId: e.target.value || undefined })}
          />
          <DateRangeInput
            from={filters.from}
            to={filters.to}
            onChange={(from, to) =>
              resetFilters({ from: from || undefined, to: to || undefined })
            }
            className="sm:col-span-2 md:col-span-4"
            labels={{
              placeholder: t('audit:dateRangePlaceholder'),
              apply: t('common:apply'),
              clear: t('common:clear'),
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {log.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : log.isError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {t('audit:loadError')}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t('audit:noEvents')}
            </div>
          ) : (
            <ol className="space-y-3">
              {events.map((entry, i) => (
                <AuditEntryCard
                  key={entry.id ?? `${entry.at}:${i}`}
                  entry={entry}
                  resource={resourceMap[entry.resourceId]}
                  user={entry.userId ? users.get(entry.userId) ?? null : null}
                  userResourceId={userResourceExists ? USERS_RESOURCE_ID : undefined}
                  now={now}
                  formatRelative={formatRelative}
                  formatAbsolute={formatAbsolute}
                />
              ))}
            </ol>
          )}
          {/* Sentinel div — observed by IntersectionObserver to trigger next page */}
          <div ref={sentinelRef} className="h-1" aria-hidden />
          {log.isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface AuditEntryCardProps {
  entry: AuditLogEntry
  resource: ResourceJSON | undefined
  user: RecordJSON | null | undefined
  userResourceId?: string
  now: number
  formatRelative: (atMs: number, nowMs: number) => string
  formatAbsolute: (value: number) => string
}

function AuditEntryCard({
  entry,
  resource,
  user,
  userResourceId,
  now,
  formatRelative,
  formatAbsolute,
}: AuditEntryCardProps): React.ReactElement {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState(false)

  const style = ACTION_STYLES[entry.action] ?? FALLBACK_STYLE
  const Icon = style.Icon
  const title = style.titleKey ? t(style.titleKey) : entry.action

  const userFallback = entry.userId ?? t('history:unknownUser')
  const userLabel = userLabelOf(user, userFallback)

  const byTpl = t('audit:by', { user: '\u0000' })
  const byParts = byTpl.split('\u0000')
  const byPrefix = byParts[0] ?? ''
  const bySuffix = byParts[1] ?? ''

  const virtualResourceKey = VIRTUAL_RESOURCE_LABELS[entry.resourceId]
  const resourceLabel = virtualResourceKey
    ? t(virtualResourceKey)
    : (resource?.name ?? entry.resourceId)

  // Diff drill-down only makes sense when we have a single recordId AND
  // history exists for that resource (we'll discover that lazily on first
  // expand). Bulk operations and `new`/`delete` actions skip the toggle.
  const canExpand = entry.action === 'edit' && !!entry.recordId

  return (
    <li className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            style.bgClass,
          )}
        >
          <Icon className={cn('size-5', style.iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-medium">{resourceLabel}</span>
                {entry.recordId && (
                  <>
                    <span aria-hidden>·</span>
                    {resource ? (
                      <Link
                        to={{
                          name: 'show',
                          resourceId: entry.resourceId,
                          recordId: entry.recordId,
                        }}
                        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground hover:underline"
                        title={entry.recordId}
                      >
                        <span className="truncate max-w-[12rem]">
                          {entry.recordTitle ?? `#${entry.recordId}`}
                        </span>
                        <ExternalLink className="size-3 shrink-0" />
                      </Link>
                    ) : entry.recordTitle ? (
                      <span
                        className="truncate max-w-[12rem] rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
                        title={entry.recordId}
                      >
                        {entry.recordTitle}
                      </span>
                    ) : null}
                  </>
                )}
                {!entry.recordId && entry.recordIds?.length ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {entry.recordIds.length} {t('audit:records')}
                    </span>
                  </>
                ) : null}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                >
                  {initialsOf(userLabel)}
                </span>
                <span className="truncate">
                  {byPrefix}
                  {userResourceId && entry.userId ? (
                    <Link
                      to={{ name: 'show', resourceId: userResourceId, recordId: entry.userId }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {userLabel}
                    </Link>
                  ) : (
                    userLabel
                  )}
                  {bySuffix}
                </span>
              </p>
            </div>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={new Date(entry.at).toISOString()}
              title={formatAbsolute(entry.at)}
            >
              {formatRelative(entry.at, now)}
            </time>
          </div>
          {canExpand && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 px-2 text-xs"
                onClick={() => setExpanded((x) => !x)}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                {expanded ? t('audit:hideChanges') : t('audit:viewChanges')}
              </Button>
              {expanded && (
                <div className="mt-2">
                  <AuditEntryChanges
                    resourceId={entry.resourceId}
                    recordId={entry.recordId!}
                    atMs={entry.at}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** Lazy-loaded diff for a single audit entry. Pulls the record's revision
 *  history (server returns the freshest 50) and picks the revision whose
 *  `createdAt` is closest to the entry's `at` timestamp. We require the
 *  match to be within a 60s window to avoid showing an unrelated revision
 *  when the matching one was pruned. */
function AuditEntryChanges({
  resourceId,
  recordId,
  atMs,
}: {
  resourceId: string
  recordId: string
  atMs: number
}): React.ReactElement {
  const { t } = useI18n()
  const resource = useResource(resourceId)
  const history = useRecordHistory(resourceId, recordId, { limit: 50 })
  // Pull the live record so we can show its title (e.g. user's email) at
  // the top of the diff — helpful when the audit log lists many entries.
  const record = useRecord(resourceId, recordId)

  const labelByPath = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of resource?.properties ?? []) map[p.path] = p.label
    return map
  }, [resource])

  if (history.isLoading) {
    return <Skeleton className="h-16 w-full" />
  }
  if (history.isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        {t('audit:loadDiffError')}
      </div>
    )
  }

  const revisions = history.data?.revisions ?? []
  const target = findNearestRevision(revisions, atMs)

  if (!target) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        {t('audit:noDiff')}
      </div>
    )
  }

  const fields: HistoryDiffEntry[] = diffSnapshots(
    target.snapshotBefore ?? {},
    target.snapshot,
  ).map((f) => ({ ...f, label: labelByPath[f.path] }))
  const recordTitle = record.data?.record?.title
  const showTitle = recordTitle && recordTitle !== recordId

  return (
    <div className="space-y-2">
      {showTitle && (
        <p className="truncate text-xs text-muted-foreground" title={recordTitle}>
          {recordTitle}
        </p>
      )}
      <DiffView
        fields={fields}
        labels={{
          added: t('diff:added'),
          changed: t('diff:changed'),
          removed: t('diff:removed'),
          before: t('diff:before'),
          after: t('diff:after'),
          noChanges: t('diff:noChanges'),
        }}
      />
    </div>
  )
}

const TOLERANCE_MS = 60_000

const findNearestRevision = (
  revisions: ReadonlyArray<HistoryRevision>,
  atMs: number,
): HistoryRevision | null => {
  let best: HistoryRevision | null = null
  let bestDiff = Infinity
  for (const r of revisions) {
    const t = new Date(r.createdAt).getTime()
    if (Number.isNaN(t)) continue
    const d = Math.abs(t - atMs)
    if (d < bestDiff && d <= TOLERANCE_MS) {
      bestDiff = d
      best = r
    }
  }
  return best
}
