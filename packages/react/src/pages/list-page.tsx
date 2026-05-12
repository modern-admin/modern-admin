// List page powered by @tanstack/react-table. Server-side sorting / filtering
// / pagination — TanStack just handles state + UI. Each visible PropertyJSON
// becomes a column; reference cells link to the related record's show page,
// id cells link to their own show page, and clicking anywhere else in a row
// opens edit. A toolbar offers global search, per-column filters and column
// visibility, plus a paginator with page-size selector.

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@modern-admin/ui'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  useBulkDeleteRecords,
  useDeleteRecord,
  useInvokeBulkAction,
  useInvokeRecordAction,
  useInvokeResourceAction,
  useRecords,
  useResource,
} from '../hooks.js'
import { PropertyDisplay } from '../property-renderer.js'
import { ReferenceLink, ReferenceLinkList, ReferenceCombobox } from '../reference.js'
import { Link, buildHref, useNavigate, useRoute, type ListQueryState, type Route } from '../router.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { useDialogs } from '../dialogs.js'
import { useHotkey } from '../use-hotkey.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import { ExportDialog } from './export-dialog.js'
import { ActionMenu, ActionMenuItems } from '../action-menu.js'
import { visibleRecordProperties } from '../relations.js'
import type { ListQuery, PropertyJSON, RecordJSON } from '../types.js'

const PAGE_SIZES = [10, 20, 50, 100] as const

// Cycling widths for skeleton cells — varied so rows don't look identical.
const SKEL_WIDTHS = ['w-16', 'w-24', 'w-20', 'w-32', 'w-14', 'w-28', 'w-18', 'w-22'] as const

/** Open an in-app route in a new background tab. Used for middle-click on
 *  rows/cards. `buildHref` returns a plain path with browser history. */
function openRouteInNewTab(route: Route): void {
  if (typeof window === 'undefined') return
  window.open(buildHref(route), '_blank', 'noopener,noreferrer')
}

/** Reasonable starting width per property type. Users can resize from there
 *  and the chosen widths are persisted per-resource in localStorage. */
function defaultColumnSize(property: PropertyJSON): number {
  if (property.isId) return 100
  switch (property.type) {
    case 'boolean': return 110
    case 'date': return 140
    case 'datetime': return 180
    case 'number':
    case 'float':
    case 'money':
    case 'currency': return 120
    case 'color': return 140
    case 'reference': return 200
    case 'richtext':
    case 'textarea': return 320
    default: return 200
  }
}

const COLUMN_SIZE_STORAGE_PREFIX = 'modern-admin:colSizes:'

function loadColumnSizing(resourceId: string): ColumnSizingState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(COLUMN_SIZE_STORAGE_PREFIX + resourceId)
    return raw ? JSON.parse(raw) as ColumnSizingState : {}
  } catch {
    return {}
  }
}

function saveColumnSizing(resourceId: string, sizing: ColumnSizingState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      COLUMN_SIZE_STORAGE_PREFIX + resourceId,
      JSON.stringify(sizing),
    )
  } catch { /* quota / private mode — ignore */ }
}

/** Toggles for individual chrome / toolbar pieces. All default to `true`. */
export interface ResourceListFeatures {
  breadcrumbs?: boolean
  title?: boolean
  refresh?: boolean
  filters?: boolean
  columns?: boolean
  export?: boolean
  create?: boolean
  bulk?: boolean
  /** Per-column filter popovers in the table header. */
  headerFilters?: boolean
  /** Wrap table + toolbar in a Card. Set false when embedding inside another card. */
  card?: boolean
}

export interface ResourceListPageProps {
  resourceId: string
  /** When provided, the table runs in "controlled" mode: query state comes
   *  from props instead of the URL hash. Both `query` and `onQueryChange`
   *  must be supplied together. */
  query?: ListQueryState
  onQueryChange?: (next: ListQueryState) => void
  /** Filters always applied to the data query but hidden from the filter UI
   *  and never written to the URL. Used to embed the list as a related-records
   *  view filtered by a parent record's id. */
  lockedFilters?: Record<string, string>
  features?: ResourceListFeatures
}

export function ResourceListPage({
  resourceId,
  query: controlledQuery,
  onQueryChange,
  lockedFilters,
  features,
}: ResourceListPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const navigate = useNavigate()
  const route = useRoute()
  const remove = useDeleteRecord(resourceId)
  const bulkRemove = useBulkDeleteRecords(resourceId)
  const invokeRecord = useInvokeRecordAction(resourceId)
  const invokeBulk = useInvokeBulkAction(resourceId)
  const invokeResource = useInvokeResourceAction(resourceId)
  const { t } = useI18n()
  const notify = useNotify()
  const dialogs = useDialogs()

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const isControlled = controlledQuery !== undefined && onQueryChange !== undefined
  const f = React.useMemo(
    () => ({
      breadcrumbs: features?.breadcrumbs ?? true,
      title: features?.title ?? true,
      refresh: features?.refresh ?? true,
      filters: features?.filters ?? true,
      columns: features?.columns ?? true,
      export: features?.export ?? true,
      create: features?.create ?? true,
      bulk: features?.bulk ?? true,
      headerFilters: features?.headerFilters ?? true,
      card: features?.card ?? true,
    }),
    [features],
  )

  // ── URL-driven (or prop-driven) query state ──
  // In standalone mode, filters/page/perPage/sortBy/direction live in the URL
  // hash (`?page=2&perPage=50&sortBy=name&direction=asc&filters[email]=ada`)
  // so they survive refresh, back, and link sharing. In embedded mode, the
  // parent component owns the same state shape and passes it via `query`.
  const urlQuery = React.useMemo<ListQueryState>(
    () =>
      isControlled
        ? (controlledQuery ?? {})
        : ((route.name === 'list' && route.query) || {}),
    [isControlled, controlledQuery, route],
  )

  const sorting = React.useMemo<SortingState>(
    () =>
      urlQuery.sortBy
        ? [{ id: urlQuery.sortBy, desc: urlQuery.direction === 'desc' }]
        : [],
    [urlQuery.sortBy, urlQuery.direction],
  )
  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      urlQuery.filters
        ? Object.entries(urlQuery.filters).map(([id, value]) => ({ id, value }))
        : [],
    [urlQuery.filters],
  )
  const pagination = React.useMemo(
    () => ({
      pageIndex: (urlQuery.page ?? 1) - 1,
      pageSize: urlQuery.perPage ?? 20,
    }),
    [urlQuery.page, urlQuery.perPage],
  )

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    loadColumnSizing(resourceId),
  )
  // Reload + persist coherently. When resourceId changes we reload first
  // (and skip saving the old state under the new key); on subsequent updates
  // we persist the user's resize choices.
  const lastResourceIdRef = React.useRef(resourceId)
  React.useEffect(() => {
    if (lastResourceIdRef.current !== resourceId) {
      lastResourceIdRef.current = resourceId
      setColumnSizing(loadColumnSizing(resourceId))
      return
    }
    saveColumnSizing(resourceId, columnSizing)
  }, [resourceId, columnSizing])

  // Track the wrapper width so the last visible column can flex to fill any
  // leftover space (mirrors unitify's "distribute remaining space" pattern
  // without re-layouting all columns on every observe).
  const tableWrapperRef = React.useRef<HTMLDivElement | null>(null)
  const [wrapperWidth, setWrapperWidth] = React.useState(0)
  React.useEffect(() => {
    const el = tableWrapperRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWrapperWidth(w)
    })
    ro.observe(el)
    setWrapperWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const [filterOpen, setFilterOpen] = React.useState(false)

  const updateUrlQuery = React.useCallback(
    (changes: Partial<ListQueryState>) => {
      const merged: ListQueryState = { ...urlQuery, ...changes }
      const next: ListQueryState = {}
      if (merged.page && merged.page > 1) next.page = merged.page
      if (merged.perPage && merged.perPage !== 20) next.perPage = merged.perPage
      if (merged.sortBy) next.sortBy = merged.sortBy
      if (merged.direction) next.direction = merged.direction
      if (merged.filters && Object.keys(merged.filters).length > 0) next.filters = merged.filters
      if (isControlled) {
        onQueryChange!(next)
        return
      }
      navigate({
        name: 'list',
        resourceId,
        ...(Object.keys(next).length > 0 ? { query: next } : {}),
      })
    },
    [isControlled, onQueryChange, navigate, resourceId, urlQuery],
  )

  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      updateUrlQuery({
        sortBy: first?.id,
        direction: first ? (first.desc ? 'desc' : 'asc') : undefined,
        page: 1,
      })
    },
    [sorting, updateUrlQuery],
  )

  const handleFilterChange = React.useCallback(
    (
      updater:
        | ColumnFiltersState
        | ((prev: ColumnFiltersState) => ColumnFiltersState),
    ) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater
      const filters: Record<string, string> = {}
      for (const f of next) {
        if (f.value != null && f.value !== '') filters[f.id] = String(f.value)
      }
      updateUrlQuery({
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        page: 1,
      })
    },
    [columnFilters, updateUrlQuery],
  )

  // Ref so column header popovers can read latest filter state without being
  // in the `columns` useMemo dependency array (which would recreate all columns
  // on every filter change).
  const columnFiltersRef = React.useRef(columnFilters)
  React.useEffect(() => { columnFiltersRef.current = columnFilters }, [columnFilters])

  const handleColumnFilterApply = React.useCallback(
    (updates: Record<string, string>) => {
      const next = columnFiltersRef.current.filter((f) => !(f.id in updates))
      for (const [id, value] of Object.entries(updates)) {
        if (value) next.push({ id, value })
      }
      handleFilterChange(next)
    },
    [handleFilterChange],
  )

  const handlePaginationChange = React.useCallback(
    (
      updater:
        | { pageIndex: number; pageSize: number }
        | ((prev: { pageIndex: number; pageSize: number }) => {
            pageIndex: number
            pageSize: number
          }),
    ) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      updateUrlQuery({
        page: next.pageIndex + 1,
        perPage: next.pageSize,
      })
    },
    [pagination, updateUrlQuery],
  )

  const query = React.useMemo<ListQuery>(() => {
    // Locked filters are merged in but never written to URL or column state.
    const mergedFilters = { ...(lockedFilters ?? {}), ...(urlQuery.filters ?? {}) }
    return {
      page: urlQuery.page ?? 1,
      perPage: urlQuery.perPage ?? 20,
      ...(urlQuery.sortBy
        ? {
            sortBy: urlQuery.sortBy,
            ...(urlQuery.direction ? { direction: urlQuery.direction } : {}),
          }
        : {}),
      ...(Object.keys(mergedFilters).length > 0 ? { filters: mergedFilters } : {}),
    }
  }, [
    urlQuery.page,
    urlQuery.perPage,
    urlQuery.sortBy,
    urlQuery.direction,
    urlQuery.filters,
    lockedFilters,
  ])

  const records = useRecords(resourceId, query)

  const visible = React.useMemo<PropertyJSON[]>(() => {
    const all = resource ? visibleRecordProperties(resource.properties, 'list') : []
    // Drop columns pinned by lockedFilters — they're identical for every row.
    if (lockedFilters && Object.keys(lockedFilters).length > 0) {
      return all.filter((p) => !(p.path in lockedFilters))
    }
    return all
  }, [resource, lockedFilters])

  const builtInActionNames = new Set(['list', 'show', 'new', 'edit', 'delete', 'bulkDelete', 'search'])
  const customResourceActions = (resource?.actions ?? []).filter(
    (a) => a.actionType === 'resource' && !builtInActionNames.has(a.name),
  )
  const customRecordActions = (resource?.actions ?? []).filter(
    (a) => a.actionType === 'record' && !builtInActionNames.has(a.name),
  )
  const customBulkActions = (resource?.actions ?? []).filter(
    (a) => a.actionType === 'bulk' && !builtInActionNames.has(a.name),
  )

  const columns = React.useMemo<ColumnDef<RecordJSON>[]>(() => {
    const cols: ColumnDef<RecordJSON>[] = []
    if (f.bulk) {
      cols.push({
        id: '_select',
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        size: 40,
        minSize: 0,
        header: ({ table }) => {
          const all = table.getIsAllPageRowsSelected()
          const some = table.getIsSomePageRowsSelected()
          return (
            <Checkbox
              checked={all ? true : some ? 'indeterminate' : false}
              onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
              aria-label={t('common:selectAll')}
            />
          )
        },
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('common:selectRow')}
          />
        ),
      })
    }
    cols.push(...visible.map<ColumnDef<RecordJSON>>((property) => ({
      id: property.path,
      accessorFn: (row) => row.params[property.path],
      size: defaultColumnSize(property),
      minSize: 80,
      header: ({ column }) => (
        <div className="flex items-center gap-0.5">
          <SortHeader
            property={property}
            state={
              column.getIsSorted() === 'asc'
                ? 'asc'
                : column.getIsSorted() === 'desc'
                  ? 'desc'
                  : 'none'
            }
            onSort={() => {
              if (!property.isSortable) return
              const cur = column.getIsSorted()
              if (cur === false) column.toggleSorting(false)
              else if (cur === 'asc') column.toggleSorting(true)
              else column.clearSorting()
            }}
          />
          {f.headerFilters && (
            <ColumnFilterPopover
              property={property}
              getFilters={() => columnFiltersRef.current}
              onApply={handleColumnFilterApply}
              t={t}
            />
          )}
        </div>
      ),
      enableSorting: property.isSortable,
      cell: ({ row }) => (
        <CellContent
          resourceId={resourceId}
          recordId={row.original.id}
          property={property}
          value={row.original.params[property.path]}
        />
      ),
    })))
    cols.push({
      id: '_actions',
      header: () => <span className="text-right">{t('common:actions')}</span>,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 64,
      cell: ({ row }) => (
        <RowActions
          t={t}
          customActions={customRecordActions}
          onView={() =>
            navigate({ name: 'show', resourceId, recordId: row.original.id })
          }
          onEdit={() =>
            navigate({ name: 'edit', resourceId, recordId: row.original.id })
          }
          onDelete={async () => {
            const ok = await dialogs.confirm({
              title: t('common:confirmDelete'),
              description: row.original.title || row.original.id,
              confirmLabel: t('common:delete'),
              destructive: true,
            })
            if (!ok) return
            remove.mutate(row.original.id, {
              onSuccess: () => notify.success({ key: 'toast:deleted' }),
              onError: (err) =>
                notify.error(
                  { key: 'toast:deleteFailed' },
                  { description: err instanceof Error ? err.message : String(err) },
                ),
            })
          }}
          onInvokeAction={(actionName) => {
            invokeRecord.mutate(
              { recordId: row.original.id, actionName },
              {
                onSuccess: (res) => {
                  if (res.notice) {
                    const type = res.notice.type === 'error' ? 'error'
                      : res.notice.type === 'warning' ? 'warning'
                      : res.notice.type === 'info' ? 'info'
                      : 'success'
                    notify[type]({ message: res.notice.message })
                  }
                },
                onError: (err) => notify.error({ message: err.message }),
              },
            )
          }}
        />
      ),
    })
    return cols
  }, [
    visible,
    resourceId,
    navigate,
    remove,
    t,
    notify,
    dialogs,
    handleColumnFilterApply,
    f.headerFilters,
    f.bulk,
    customRecordActions,
    invokeRecord,
  ])

  const total = records.data?.meta.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))

  const table = useReactTable({
    data: records.data?.records ?? [],
    columns,
    pageCount,
    state: { sorting, columnFilters, columnVisibility, pagination, rowSelection, columnSizing },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleFilterChange,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    enableColumnResizing: true,
    // 'onEnd' commits the new size only when the user releases the handle,
    // avoiding a re-render storm that 'onChange' triggers on every mousemove.
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 80, size: 200, maxSize: 800 },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  // Selection lives at the page level (we always know the IDs from rowSelection
  // keys because getRowId returns row.id). The bulk-delete button shows
  // whenever the user has at least one row selected.
  const selectedIds = React.useMemo(() => Object.keys(rowSelection), [rowSelection])
  const selectedCount = selectedIds.length
  const showStandaloneEmptyState = !records.isFetching && !records.isError && total === 0

  // ── Keyboard shortcuts ──
  // Plain `n` creates, `r` refreshes, `f` opens the filters drawer.
  // Bare-key bindings are skipped while typing in inputs. Ctrl+N would
  // be the conventional choice for "new" but every major browser
  // reserves it for "new window" and won't surrender the keydown, so we
  // settle for a single-letter binding consistent with `r` / `f`.
  useHotkey(
    'n',
    () => {
      navigate({ name: 'new', resourceId })
    },
    { enabled: f.create, description: t('common:new') },
  )
  useHotkey(
    'r',
    () => {
      if (!records.isFetching) records.refetch()
    },
    { enabled: f.refresh, description: t('common:refresh') },
  )
  useHotkey(
    'f',
    () => {
      setFilterOpen((v) => !v)
    },
    { enabled: f.filters, description: t('common:filters') },
  )

  const handleBulkDelete = React.useCallback(async () => {
    const ok = await dialogs.confirm({
      title: t('common:bulkDeleteConfirm', { count: selectedCount }),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (!ok) return
    bulkRemove.mutate(selectedIds, {
      onSuccess: () => {
        setRowSelection({})
        notify.success({ key: 'toast:bulkDeleted', params: { count: selectedCount } })
      },
      onError: (err) =>
        notify.error(
          { key: 'toast:bulkDeleteFailed' },
          { description: err instanceof Error ? err.message : String(err) },
        ),
    })
  }, [bulkRemove, dialogs, notify, selectedCount, selectedIds, t])

  if (!resource) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-6 w-1/3" />
        </CardContent>
      </Card>
    )
  }

  const hasToolbarActions = !showStandaloneEmptyState && (
    f.refresh || f.filters || f.columns || f.export || f.create || customResourceActions.length > 0
  )
  const hasHeader = f.title || hasToolbarActions || (!showStandaloneEmptyState && visible.some((p) => p.isSortable))

  // CardHeader/Content add their own padding. When `card: false` we're embedded
  // inside another container that already provides spacing, so use a bare div
  // wrapper to avoid compounding paddings.
  const HeaderEl = f.card ? CardHeader : 'div'
  const ContentEl = f.card ? CardContent : 'div'
  const headerCls = cn(
    'flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
    !f.card && 'mb-3',
  )

  const inner = (
    <>
      {f.filters && (
        <FilterPanel
          open={filterOpen}
          onOpenChange={setFilterOpen}
          properties={visible}
          filters={columnFilters}
          onChange={handleFilterChange}
          t={t}
        />
      )}
      {hasHeader && (
        <HeaderEl className={headerCls}>
          {f.title ? <CardTitle>{resource.name}</CardTitle> : <span />}
          {hasToolbarActions && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {f.refresh && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => records.refetch()}
                      disabled={records.isFetching}
                      aria-label={t('common:refresh')}
                    >
                      <RefreshCw className={records.isFetching ? 'size-4 animate-spin' : 'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="flex items-center gap-1.5">
                    <span>{t('common:refresh')}</span>
                    <Kbd>R</Kbd>
                  </TooltipContent>
                </Tooltip>
              )}
              {f.filters && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
                      <ListFilter className="size-4" />
                      <span className="hidden sm:inline">{t('common:filters')}</span>
                      {columnFilters.length > 0 && (
                        <Badge className="ml-1 h-5 rounded-full px-1.5 text-xs">
                          {columnFilters.length}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="flex items-center gap-1.5">
                    <span>{t('common:filters')}</span>
                    <Kbd>F</Kbd>
                  </TooltipContent>
                </Tooltip>
              )}
              {f.columns && (
                <ColumnVisibilityMenu table={table} properties={visible} t={t} />
              )}
              {f.export && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    dialogs.open({
                      render: ({ close }) => (
                        <ExportDialog
                          resourceId={resourceId}
                          resourceLabel={resource.name}
                          properties={visible}
                          query={query}
                          onClose={() => close()}
                        />
                      ),
                    })
                  }
                >
                  <Download className="size-4" />
                  <span className="hidden sm:inline">{t('common:export')}</span>
                </Button>
              )}
              {customResourceActions.length > 0 && (
                <ActionMenu
                  actions={customResourceActions}
                  onAction={(action) => {
                    invokeResource.mutate(
                      { actionName: action.name },
                      {
                        onSuccess: (res) => {
                          if (res.notice) {
                            const type = res.notice.type === 'error' ? 'error'
                              : res.notice.type === 'warning' ? 'warning'
                              : res.notice.type === 'info' ? 'info'
                              : 'success'
                            notify[type]({ message: res.notice.message })
                          }
                        },
                        onError: (err) => notify.error({ message: err.message }),
                      },
                    )
                  }}
                  t={t}
                  trigger={(
                    <Button variant="outline" size="sm" disabled={invokeResource.isPending}>
                      <Zap className="size-4" />
                      <span className="hidden sm:inline">{t('common:actions')}</span>
                    </Button>
                  )}
                />
              )}
              {f.create && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" onClick={() => navigate({ name: 'new', resourceId })}>
                      <Plus className="size-4" />
                      <span className="hidden sm:inline">{t('common:new')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="flex items-center gap-1.5">
                    <span>{t('common:new')}</span>
                    <Kbd>N</Kbd>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          {/* Mobile-only sort selector — desktop uses column header clicks */}
          {visible.some((p) => p.isSortable) && (
            <div className="flex w-full items-center gap-2 sm:hidden">
              <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" />
              <Select
                value={
                  sorting[0]
                    ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}`
                    : '_none_'
                }
                onValueChange={(v) => {
                  if (v === '_none_') { handleSortingChange([]); return }
                  const sep = v.lastIndexOf(':')
                  handleSortingChange([{ id: v.slice(0, sep), desc: v.slice(sep + 1) === 'desc' }])
                }}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder={t('common:sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">{t('common:sortBy')}: —</SelectItem>
                  {visible
                    .filter((p) => p.isSortable)
                    .flatMap((p) => [
                      <SelectItem key={`${p.path}:asc`} value={`${p.path}:asc`}>
                        {p.label} ↑
                      </SelectItem>,
                      <SelectItem key={`${p.path}:desc`} value={`${p.path}:desc`}>
                        {p.label} ↓
                      </SelectItem>,
                    ])}
                </SelectContent>
              </Select>
            </div>
          )}
        </HeaderEl>
      )}
      <ContentEl className="space-y-3">
        {showStandaloneEmptyState ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{t('common:noRecords')}</EmptyTitle>
              {f.create && (
                <EmptyDescription>
                  {t('common:noRecordsHint', { resource: resource.name })}
                </EmptyDescription>
              )}
            </EmptyHeader>
            {f.create && (
              <EmptyContent>
                <Button size="sm" onClick={() => navigate({ name: 'new', resourceId })}>
                  <Plus className="size-4" />
                  {t('common:new')}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <>
            {/* Bulk action bar — only visible when at least one row is selected.
                Sits above the list so the user can act on the selection without
                having to scroll. Mirrors a typical email-client multi-select. */}
            {f.bulk && selectedCount > 0 && (
              <div className="flex flex-row items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="min-w-0 truncate text-sm font-medium">
                  {t('common:selectedCount', { count: selectedCount })}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRowSelection({})}
                    disabled={bulkRemove.isPending}
                  >
                    <X className="size-4" />
                    <span className="hidden sm:inline">{t('common:clearSelection')}</span>
                  </Button>
                  {customBulkActions.length > 0 && (
                    <ActionMenu
                      actions={customBulkActions}
                      onAction={(action) => {
                        invokeBulk.mutate(
                          { actionName: action.name, ids: selectedIds },
                          {
                            onSuccess: (res) => {
                              setRowSelection({})
                              if (res.notice) {
                                const type = res.notice.type === 'error' ? 'error'
                                  : res.notice.type === 'warning' ? 'warning'
                                  : res.notice.type === 'info' ? 'info'
                                  : 'success'
                                notify[type]({ message: res.notice.message })
                              }
                            },
                            onError: (err) => notify.error({ message: err.message }),
                          },
                        )
                      }}
                      t={t}
                      trigger={(
                        <Button variant="outline" size="sm" disabled={invokeBulk.isPending}>
                          <Zap className="size-4" />
                          <span className="hidden sm:inline">{t('common:actions')}</span>
                        </Button>
                      )}
                    />
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={bulkRemove.isPending}
                  >
                    <Trash2 className="size-4" />
                    <span className="hidden sm:inline">{t('common:deleteSelected')}</span>
                  </Button>
                </div>
              </div>
            )}
            {/* Mobile: card-per-record stack. Hidden ≥ sm. */}
            <div className="space-y-2 sm:hidden">
              {records.isFetching && Array.from({ length: pagination.pageSize }, (_, i) => (
                <div key={`skel-card-${i}`} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <Skeleton className="mt-1 h-4 w-4 flex-none rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-7 w-7 shrink-0 rounded" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                        {Array.from({ length: 4 }, (_, j) => (
                          <div key={j} className="space-y-1">
                            <Skeleton className="h-2.5 w-14" />
                            <Skeleton className={`h-4 ${SKEL_WIDTHS[(i * 3 + j) % SKEL_WIDTHS.length]}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!records.isFetching && records.isError && (
                <div className="rounded-md border py-8 text-center text-destructive">
                  {t('common:loadFailed', { error: String(records.error) })}
                </div>
              )}
              {!records.isFetching && table.getRowModel().rows.map((row) => (
                <RecordCard
                  key={row.id}
                  record={row.original}
                  properties={visible.filter((p) =>
                    table.getColumn(p.path)?.getIsVisible() ?? true,
                  )}
                  resourceId={resourceId}
                  showSelect={f.bulk}
                  selected={row.getIsSelected()}
                  onToggleSelect={(v) => row.toggleSelected(v)}
                  onView={() => navigate({ name: 'show', resourceId, recordId: row.original.id })}
                  onEdit={() => navigate({ name: 'edit', resourceId, recordId: row.original.id })}
                  onDelete={async () => {
                    const ok = await dialogs.confirm({
                      title: t('common:confirmDelete'),
                      description: row.original.title || row.original.id,
                      confirmLabel: t('common:delete'),
                      destructive: true,
                    })
                    if (!ok) return
                    remove.mutate(row.original.id, {
                      onSuccess: () => notify.success({ key: 'toast:deleted' }),
                      onError: (err) =>
                        notify.error(
                          { key: 'toast:deleteFailed' },
                          { description: err instanceof Error ? err.message : String(err) },
                        ),
                    })
                  }}
                  customActions={customRecordActions}
                  onInvokeAction={(actionName) => {
                    invokeRecord.mutate(
                      { recordId: row.original.id, actionName },
                      {
                        onSuccess: (res) => {
                          if (res.notice) {
                            const type = res.notice.type === 'error' ? 'error'
                              : res.notice.type === 'warning' ? 'warning'
                              : res.notice.type === 'info' ? 'info'
                              : 'success'
                            notify[type]({ message: res.notice.message })
                          }
                        },
                        onError: (err) => notify.error({ message: err.message }),
                      },
                    )
                  }}
                  t={t}
                />
              ))}
            </div>

            {/* Desktop: tabular layout. Hidden < sm. */}
            <div
              ref={tableWrapperRef}
              className="relative hidden overflow-x-auto rounded-md border border-border sm:block"
            >
              {(() => {
                // Distribute leftover wrapper space to the last visible leaf column
                // so the table always reaches the right edge — without changing the
                // stored size (resetSize / persistence stay clean).
                const leafCols = table.getVisibleLeafColumns()
                const totalSize = table.getCenterTotalSize()
                const lastCol = leafCols[leafCols.length - 1]
                const lastBoost = lastCol && wrapperWidth > totalSize
                  ? wrapperWidth - totalSize
                  : 0
                const renderedTotal = totalSize + lastBoost
                const sizeOf = (colId: string, base: number): number =>
                  colId === lastCol?.id ? base + lastBoost : base
                const resizingHeader = table.getHeaderGroups()
                  .flatMap((hg) => hg.headers)
                  .find((h) => h.column.getIsResizing())
                const deltaOffset = table.getState().columnSizingInfo.deltaOffset ?? 0
                return (
                  <div className="relative" style={{ width: renderedTotal }}>
                    <Table style={{ tableLayout: 'fixed', width: renderedTotal }}>
                      <TableHeader>
                        {table.getHeaderGroups().map((hg) => (
                          <TableRow key={hg.id}>
                            {hg.headers.map((header) => (
                              <TableHead
                                key={header.id}
                                style={{ width: sizeOf(header.column.id, header.getSize()) }}
                                className={cn(
                                  'relative select-none',
                                  header.column.id === '_actions' && 'text-right',
                                )}
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(header.column.columnDef.header, header.getContext())}
                                {header.column.getCanResize() && (
                                  <div
                                    onMouseDown={header.getResizeHandler()}
                                    onTouchStart={header.getResizeHandler()}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={() => header.column.resetSize()}
                                    className={cn(
                                      'absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none bg-transparent hover:bg-primary/40',
                                      header.column.getIsResizing() && 'bg-primary',
                                    )}
                                    aria-hidden="true"
                                  />
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {records.isFetching ? (
                          Array.from({ length: pagination.pageSize }, (_, i) => (
                            <TableRow key={`skel-${i}`} className="pointer-events-none">
                              {table.getVisibleLeafColumns().map((col, j) => (
                                <TableCell
                                  key={col.id}
                                  style={{ width: sizeOf(col.id, col.getSize()) }}
                                  className={col.id === '_actions' ? 'text-right' : ''}
                                >
                                  {col.id === '_select' ? (
                                    <Skeleton className="h-4 w-4 rounded" />
                                  ) : col.id === '_actions' ? (
                                    <Skeleton className="ml-auto h-7 w-7 rounded" />
                                  ) : (
                                    <Skeleton className={`h-4 ${SKEL_WIDTHS[(i * 3 + j) % SKEL_WIDTHS.length]}`} />
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : records.isError ? (
                          <TableRow>
                            <TableCell colSpan={columns.length} className="py-8 text-center text-destructive">
                              {t('common:loadFailed', { error: String(records.error) })}
                            </TableCell>
                          </TableRow>
                        ) : (
                          table.getRowModel().rows.map((row) => (
                            <TableRow
                              key={row.id}
                              data-state={row.getIsSelected() && 'selected'}
                              className="cursor-pointer"
                              onClick={(e) => {
                                const target = e.target as HTMLElement
                                if (target.closest('a, button, [role="menuitem"]')) return
                                navigate({ name: 'edit', resourceId, recordId: row.original.id })
                              }}
                              onAuxClick={(e) => {
                                if (e.button !== 1) return
                                const target = e.target as HTMLElement
                                if (target.closest('a, button, [role="menuitem"]')) return
                                e.preventDefault()
                                openRouteInNewTab({ name: 'edit', resourceId, recordId: row.original.id })
                              }}
                              onMouseDown={(e) => {
                                if (e.button === 1) {
                                  const target = e.target as HTMLElement
                                  if (target.closest('a, button, [role="menuitem"]')) return
                                  e.preventDefault()
                                }
                              }}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <TableCell
                                  key={cell.id}
                                  style={{ width: sizeOf(cell.column.id, cell.column.getSize()) }}
                                  className={cn(
                                    'overflow-hidden',
                                    cell.column.id === '_actions' && 'text-right',
                                  )}
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    {/* Vertical guide line follows the cursor while a column is being
                        resized. Uses left = (header right edge) + deltaOffset. */}
                    {resizingHeader && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 z-20 h-full w-px bg-primary"
                        style={{
                          left: resizingHeader.getStart() + resizingHeader.getSize() + deltaOffset,
                        }}
                      />
                    )}
                  </div>
                )
              })()}
            </div>
            <Paginator table={table} total={total} t={t} />
          </>
        )}
      </ContentEl>
    </>
  )

  return (
    <div className="space-y-4">
      {f.breadcrumbs && (
        <PageBreadcrumbs
          items={[homeCrumb(t('common:home')), { label: resource.name }]}
        />
      )}
      {f.card ? <Card>{inner}</Card> : inner}
    </div>
  )
}

function SortHeader({
  property,
  state,
  onSort,
}: {
  property: PropertyJSON
  state: 'none' | 'asc' | 'desc'
  onSort(): void
}): React.ReactElement {
  if (!property.isSortable) {
    return <span className="font-semibold">{property.label}</span>
  }
  const Icon = state === 'asc' ? ArrowUp : state === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <button
      type="button"
      onClick={onSort}
      className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 font-semibold hover:bg-accent hover:text-accent-foreground"
    >
      {property.label}
      <Icon className="size-3.5 opacity-60" />
    </button>
  )
}

function CellContent({
  resourceId,
  recordId,
  property,
  value,
}: {
  resourceId: string
  recordId: string
  property: PropertyJSON
  value: unknown
}): React.ReactElement {
  if (property.isId) {
    return (
      <Link
        to={{ name: 'show', resourceId, recordId }}
        className="font-mono text-sm font-medium text-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {String(value ?? '')}
      </Link>
    )
  }
  // m2m properties also set `reference` + `isArray`, but their value is an
  // array of `{ id, ...extras }` objects — not scalar FKs. Hand them off to
  // PropertyDisplay so its dedicated `case 'm2m'` branch can extract ids.
  if (property.reference && property.type !== 'm2m' && value != null && value !== '') {
    if (property.isArray) {
      const ids = Array.isArray(value) ? (value as Array<string | number>) : []
      return <ReferenceLinkList resourceId={property.reference} recordIds={ids} />
    }
    return (
      <ReferenceLink
        resourceId={property.reference}
        recordId={value as string | number}
      />
    )
  }
  return <PropertyDisplay property={property} value={value} view="list" />
}

function RowActions({
  onView,
  onEdit,
  onDelete,
  onInvokeAction,
  customActions = [],
  t,
}: {
  onView(): void
  onEdit(): void
  onDelete(): void
  onInvokeAction?(actionName: string): void
  customActions?: import('../types.js').ActionDescriptor[]
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  return (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t('common:openMenu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('common:actions')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onView}>
            <Eye className="size-4" /> {t('common:show')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-4" /> {t('common:edit')}
          </DropdownMenuItem>
          {customActions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <ActionMenuItems
                actions={customActions}
                onAction={(action) => onInvokeAction?.(action.name)}
              />
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="size-4" /> {t('common:delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ColumnVisibilityMenu<TData>({
  table,
  properties,
  t,
}: {
  table: ReturnType<typeof useReactTable<TData>>
  properties: PropertyJSON[]
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  const labelMap = new Map(properties.map((p) => [p.path, p.label]))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{t('common:columns')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('common:toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((c) => c.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(v) => column.toggleVisibility(!!v)}
              onSelect={(e) => e.preventDefault()}
            >
              {labelMap.get(column.id) ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Sliding window of up to `windowSize` page indices centred on `pageIndex`. */
function getPageRange(pageIndex: number, pageCount: number, windowSize = 10): number[] {
  if (pageCount <= 0) return []
  const half = Math.floor(windowSize / 2)
  let start = pageIndex - half
  let end = start + windowSize
  if (start < 0) { start = 0; end = windowSize }
  if (end > pageCount) { end = pageCount; start = Math.max(0, end - windowSize) }
  return Array.from({ length: end - start }, (_, i) => start + i)
}

function Paginator<TData>({
  table,
  total,
  t,
}: {
  table: ReturnType<typeof useReactTable<TData>>
  total: number
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = table.getPageCount()
  const pages = getPageRange(pageIndex, pageCount)
  return (
    <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-center text-sm text-muted-foreground sm:text-left">
        {t('common:recordsCount', { count: total })}
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {t('common:rowsPerPage')}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Page navigation — scrollable on narrow screens */}
        <div className="overflow-x-auto">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pages.map((p) => (
              <Button
                key={p}
                variant={p === pageIndex ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => table.setPageIndex(p)}
                aria-current={p === pageIndex ? 'page' : undefined}
              >
                {p + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterPanel({
  open,
  onOpenChange,
  properties,
  filters,
  onChange,
  t,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  properties: PropertyJSON[]
  filters: ColumnFiltersState
  onChange(next: ColumnFiltersState): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  // Local draft — edits stay here until the user clicks Apply. Reset whenever
  // the sheet opens so the draft mirrors the current applied filters.
  const [draft, setDraft] = React.useState<ColumnFiltersState>(filters)
  React.useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])
  const draftMap = new Map(draft.map((f) => [f.id, f.value]))

  const setDraftFilter = (id: string, value: unknown) => {
    const without = draft.filter((f) => f.id !== id)
    setDraft(value != null && value !== '' ? [...without, { id, value }] : without)
  }

  const handleApply = () => {
    onChange(draft)
    onOpenChange(false)
  }

  const handleClearAll = () => {
    setDraft([])
    onChange([])
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="flex-none flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3 pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>{t('common:filters')}</SheetTitle>
            {draft.length > 0 && (
              <Badge className="h-5 rounded-full px-1.5 text-xs">{draft.length}</Badge>
            )}
          </div>
          {draft.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              {t('common:clearAll')}
            </Button>
          )}
        </SheetHeader>

        {/* Fields — id is intentionally included so users can filter by id. */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-4 py-4">
            {properties.map((p) => (
              <FilterField
                key={p.path}
                property={p}
                value={draftMap.get(p.path) as string | undefined}
                onChange={(v) => setDraftFilter(p.path, v)}
                valueFrom={draftMap.get(p.path + '~~from') as string | undefined}
                valueTo={draftMap.get(p.path + '~~to') as string | undefined}
                onChangeFrom={(v) => setDraftFilter(p.path + '~~from', v)}
                onChangeTo={(v) => setDraftFilter(p.path + '~~to', v)}
                t={t}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="flex flex-none border-t border-border p-4">
          <Button className="w-full" onClick={handleApply}>
            {t('common:applyFilters')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function FilterField({
  property,
  value,
  onChange,
  valueFrom,
  valueTo,
  onChangeFrom,
  onChangeTo,
  t,
}: {
  property: PropertyJSON
  value: string | undefined
  onChange(v: unknown): void
  valueFrom?: string
  valueTo?: string
  onChangeFrom?(v: unknown): void
  onChangeTo?(v: unknown): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  const isDateType = property.type === 'date' || property.type === 'datetime'
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{property.label}</Label>
      {isDateType ? (
        <DateRangeFilter
          mode={property.type as 'date' | 'datetime'}
          from={valueFrom}
          to={valueTo}
          onFromChange={onChangeFrom ?? onChange}
          onToChange={onChangeTo ?? onChange}
          t={t}
        />
      ) : (
        <FilterInput property={property} value={value ?? ''} onChange={onChange} t={t} />
      )}
    </div>
  )
}

function DateRangeFilter({
  mode,
  from,
  to,
  onFromChange,
  onToChange,
  t,
}: {
  mode: 'date' | 'datetime'
  from: string | undefined
  to: string | undefined
  onFromChange(v: unknown): void
  onToChange(v: unknown): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t('common:from')}</span>
        <DatePicker
          mode={mode}
          value={from ?? ''}
          onChange={(v) => onFromChange(v)}
          ariaLabel={t('common:from')}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t('common:to')}</span>
        <DatePicker
          mode={mode}
          value={to ?? ''}
          onChange={(v) => onToChange(v)}
          ariaLabel={t('common:to')}
        />
      </div>
    </div>
  )
}

function FilterInput({
  property,
  value,
  onChange,
  t,
}: {
  property: PropertyJSON
  value: string
  onChange(v: unknown): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  // Reference field → combobox backed by the referenced resource's search action
  if (property.reference && !property.isArray) {
    return (
      <ReferenceCombobox
        referenceResourceId={property.reference}
        value={value || null}
        onChange={(v) => onChange(v ?? '')}
        placeholder={t('common:any')}
      />
    )
  }

  // Enum / available values → Select
  if (property.availableValues?.length) {
    return (
      <Select value={value || '_any_'} onValueChange={(v) => onChange(v === '_any_' ? '' : v)}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder={t('common:any')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_any_">{t('common:any')}</SelectItem>
          {property.availableValues.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  switch (property.type) {
    case 'boolean':
      return (
        <Select value={value || '_any_'} onValueChange={(v) => onChange(v === '_any_' ? '' : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder={t('common:any')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any_">{t('common:any')}</SelectItem>
            <SelectItem value="true">{t('common:yes')}</SelectItem>
            <SelectItem value="false">{t('common:no')}</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'number':
    case 'float':
    case 'money':
    case 'currency':
      return (
        <Input
          type="number"
          className="h-8"
          value={value}
          placeholder={t('common:any')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return (
        <Input
          className="h-8"
          value={value}
          placeholder={t('common:filterPlaceholder')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// ─── Per-column filter popover in table header ───────────────────────────────
// A magnifying-glass icon sits next to the sort label. Clicking it opens a
// Popover with the same full filter controls as the side panel (FilterField).
// The icon is highlighted when a filter for this column is active.
function ColumnFilterPopover({
  property,
  getFilters,
  onApply,
  t,
}: {
  property: PropertyJSON
  getFilters(): ColumnFiltersState
  onApply(updates: Record<string, string>): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const isDateType = property.type === 'date' || property.type === 'datetime'

  const [value, setValue] = React.useState('')
  const [valueFrom, setValueFrom] = React.useState('')
  const [valueTo, setValueTo] = React.useState('')

  // Initialise draft from current URL filters each time the popover opens.
  React.useEffect(() => {
    if (!open) return
    const map = new Map(getFilters().map((f) => [f.id, String(f.value ?? '')]))
    if (isDateType) {
      setValueFrom(map.get(property.path + '~~from') ?? '')
      setValueTo(map.get(property.path + '~~to') ?? '')
    } else {
      setValue(map.get(property.path) ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Icon is highlighted when any filter for this property is set.
  const isActive = (() => {
    const map = new Map(getFilters().map((f) => [f.id, String(f.value ?? '')]))
    return isDateType
      ? !!(map.get(property.path + '~~from') || map.get(property.path + '~~to'))
      : !!map.get(property.path)
  })()

  const handleApply = () => {
    const updates: Record<string, string> = {}
    if (isDateType) {
      updates[property.path + '~~from'] = valueFrom
      updates[property.path + '~~to'] = valueTo
    } else {
      updates[property.path] = value
    }
    onApply(updates)
    setOpen(false)
  }

  const handleClear = () => {
    const updates: Record<string, string> = {}
    if (isDateType) {
      updates[property.path + '~~from'] = ''
      updates[property.path + '~~to'] = ''
    } else {
      updates[property.path] = ''
    }
    onApply(updates)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent',
            isActive ? 'text-primary' : 'text-muted-foreground opacity-50 hover:opacity-100',
          )}
          aria-label={t('common:filter', { label: property.label })}
        >
          <ListFilter className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border-border p-3" align="start">
        <div className="space-y-3">
          <FilterField
            property={property}
            value={value}
            onChange={(v) => setValue(String(v ?? ''))}
            valueFrom={valueFrom}
            valueTo={valueTo}
            onChangeFrom={(v) => setValueFrom(String(v ?? ''))}
            onChangeTo={(v) => setValueTo(String(v ?? ''))}
            t={t}
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleApply}>
              {t('common:apply')}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClear}>
              {t('common:clear')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Mobile record card ──────────────────────────────────────────────────────
// Renders a single record as a tap-to-edit card with a header (avatar + title +
// id), a 2-column grid of property values, and a contextual menu.
function RecordCard({
  record,
  properties,
  resourceId,
  showSelect,
  selected,
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  customActions = [],
  onInvokeAction,
  t,
}: {
  record: RecordJSON
  properties: PropertyJSON[]
  resourceId: string
  showSelect: boolean
  selected: boolean
  onToggleSelect(value: boolean): void
  onView(): void
  onEdit(): void
  onDelete(): void
  customActions?: import('../types.js').ActionDescriptor[]
  onInvokeAction?(actionName: string): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  const idProperty = properties.find((p) => p.isId)
  const titleProperty = properties.find((p) => !p.isId && p.type === 'string')
  const titleText =
    record.title ||
    (titleProperty ? String(record.params[titleProperty.path] ?? '') : '') ||
    `#${record.id}`

  // Body shows non-id, non-title properties (max 4 for compactness).
  const bodyProps = properties
    .filter((p) => !p.isId && p.path !== titleProperty?.path)
    .slice(0, 4)

  // Card uses a clickable div (not <button>) because it nests interactive
  // children (the RowActions DropdownMenuTrigger and reference links). HTML
  // forbids button-in-button. Behavior is mirrored from the desktop TableRow.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target as HTMLElement
      if (target.closest('a, button, [role="menuitem"]')) return
      e.preventDefault()
      onEdit()
    }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('a, button, [role="menuitem"]')) return
    onEdit()
  }
  const handleAuxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('a, button, [role="menuitem"]')) return
    e.preventDefault()
    openRouteInNewTab({ name: 'edit', resourceId, recordId: record.id })
  }
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('a, button, [role="menuitem"]')) return
    e.preventDefault()
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      data-state={selected ? 'selected' : undefined}
      className="block w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=selected]:border-primary/50 data-[state=selected]:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        {showSelect && (
          <div
            className="flex flex-none items-center pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onToggleSelect(!!v)}
              aria-label={t('common:selectRow')}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{titleText}</div>
              {idProperty && (
                <div className="truncate text-xs text-muted-foreground">
                  #{String(record.params[idProperty.path] ?? record.id)}
                </div>
              )}
            </div>
            <RowActions
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              customActions={customActions}
              onInvokeAction={onInvokeAction}
              t={t}
            />
          </div>
          {bodyProps.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {bodyProps.map((p) => (
                <div key={p.path} className="min-w-0">
                  <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                    {p.label}
                  </div>
                  <div className="mt-0.5 truncate text-sm">
                    <CellContent
                      resourceId={resourceId}
                      recordId={record.id}
                      property={p}
                      value={record.params[p.path]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
