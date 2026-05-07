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
  cn,
} from '@modern-admin/ui'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
} from 'lucide-react'
import { useBulkDeleteRecords, useDeleteRecord, useRecords, useResource } from '../hooks.js'
import { parseApiError } from '../client.js'
import { PropertyDisplay } from '../property-renderer.js'
import { ReferenceLink, ReferenceLinkList, ReferenceCombobox } from '../reference.js'
import { Link, buildHref, useNavigate, useRoute, type ListQueryState, type Route } from '../router.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { useDialogs } from '../dialogs.js'
import { PageBreadcrumbs, homeCrumb } from '../breadcrumbs.js'
import { ExportDialog } from './export-dialog.js'
import type { ListQuery, PropertyJSON, RecordJSON } from '../types.js'

const PAGE_SIZES = [10, 20, 50, 100] as const

// Cycling widths for skeleton cells — varied so rows don't look identical.
const SKEL_WIDTHS = ['w-16', 'w-24', 'w-20', 'w-32', 'w-14', 'w-28', 'w-18', 'w-22'] as const

/** Open an in-app route in a new background tab. The hash router means we
 *  rebuild the current URL with a different fragment so the new tab boots
 *  the same SPA at the desired route. Used for middle-click on rows/cards. */
function openRouteInNewTab(route: Route): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.hash = buildHref(route).slice(1) // strip leading '#'
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

export interface ResourceListPageProps {
  resourceId: string
}

export function ResourceListPage({ resourceId }: ResourceListPageProps): React.ReactElement {
  const resource = useResource(resourceId)
  const navigate = useNavigate()
  const route = useRoute()
  const remove = useDeleteRecord(resourceId)
  const bulkRemove = useBulkDeleteRecords(resourceId)
  const { t } = useI18n()
  const notify = useNotify()
  const dialogs = useDialogs()

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // ── URL-driven state ──
  // Filters / page / perPage / sortBy / direction are persisted in the URL hash
  // (`?page=2&perPage=50&sortBy=name&direction=asc&filters[email]=ada`) so they
  // survive refresh, browser back, and copy-paste link sharing. The table state
  // is derived; user actions navigate to a new route.
  const urlQuery = React.useMemo<ListQueryState>(
    () => (route.name === 'list' && route.query) || {},
    [route],
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
      navigate({
        name: 'list',
        resourceId,
        ...(Object.keys(next).length > 0 ? { query: next } : {}),
      })
    },
    [navigate, resourceId, urlQuery],
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

  const query = React.useMemo<ListQuery>(
    () => ({
      page: urlQuery.page ?? 1,
      perPage: urlQuery.perPage ?? 20,
      ...(urlQuery.sortBy
        ? {
            sortBy: urlQuery.sortBy,
            ...(urlQuery.direction ? { direction: urlQuery.direction } : {}),
          }
        : {}),
      ...(urlQuery.filters ? { filters: urlQuery.filters } : {}),
    }),
    [urlQuery.page, urlQuery.perPage, urlQuery.sortBy, urlQuery.direction, urlQuery.filters],
  )

  const records = useRecords(resourceId, query)

  const visible = React.useMemo<PropertyJSON[]>(
    () => resource?.properties.filter((p) => p.visibility.list) ?? [],
    [resource],
  )

  const columns = React.useMemo<ColumnDef<RecordJSON>[]>(() => {
    const cols: ColumnDef<RecordJSON>[] = []
    cols.push({
      id: '_select',
      enableSorting: false,
      enableHiding: false,
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
    cols.push(...visible.map<ColumnDef<RecordJSON>>((property) => ({
      id: property.path,
      accessorFn: (row) => row.params[property.path],
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
          <ColumnFilterPopover
            property={property}
            getFilters={() => columnFiltersRef.current}
            onApply={handleColumnFilterApply}
            t={t}
          />
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
      cell: ({ row }) => (
        <RowActions
          t={t}
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
        />
      ),
    })
    return cols
  }, [visible, resourceId, navigate, remove, t, notify, dialogs, handleColumnFilterApply])

  const total = records.data?.meta.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))

  const table = useReactTable({
    data: records.data?.records ?? [],
    columns,
    pageCount,
    state: { sorting, columnFilters, columnVisibility, pagination, rowSelection },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleFilterChange,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  // Selection lives at the page level (we always know the IDs from rowSelection
  // keys because getRowId returns row.id). The bulk-delete button shows
  // whenever the user has at least one row selected.
  const selectedIds = React.useMemo(() => Object.keys(rowSelection), [rowSelection])
  const selectedCount = selectedIds.length

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

  return (
    <div className="space-y-4">
      {filterOpen && (
        <FilterPanel
          properties={visible}
          filters={columnFilters}
          onChange={handleFilterChange}
          onClose={() => setFilterOpen(false)}
          t={t}
        />
      )}
      <PageBreadcrumbs
        items={[
          homeCrumb(t('common:home')),
          { label: resource.name },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <CardTitle>{resource.name}</CardTitle>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => records.refetch()}
              disabled={records.isFetching}
              aria-label={t('common:refresh')}
            >
              <RefreshCw className={records.isFetching ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
              <ListFilter className="size-4" />
              <span className="hidden sm:inline">{t('common:filters')}</span>
              {columnFilters.length > 0 && (
                <Badge className="ml-1 h-5 rounded-full px-1.5 text-xs">
                  {columnFilters.length}
                </Badge>
              )}
            </Button>
            <ColumnVisibilityMenu table={table} properties={visible} t={t} />
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
            <Button size="sm" onClick={() => navigate({ name: 'new', resourceId })}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t('common:new')}</span>
            </Button>
          </div>
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
        </CardHeader>
        <CardContent className="space-y-3">
        {/* Bulk action bar — only visible when at least one row is selected.
            Sits above the list so the user can act on the selection without
            having to scroll. Mirrors a typical email-client multi-select. */}
        {selectedCount > 0 && (
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
          {!records.isFetching && table.getRowModel().rows.length === 0 && (
            <div className="rounded-md border py-8 text-center text-muted-foreground">
              {t('common:noRecords')}
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
              t={t}
            />
          ))}
        </div>

        {/* Desktop: tabular layout. Hidden < sm. */}
        <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className={header.column.id === '_actions' ? 'text-right' : ''}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {records.isFetching ? (
                Array.from({ length: pagination.pageSize }, (_, i) => (
                  <TableRow key={`skel-${i}`} className="pointer-events-none">
                    {columns.map((col, j) => (
                      <TableCell
                        key={String(col.id ?? j)}
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
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    {t('common:noRecords')}
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
                        className={cell.column.id === '_actions' ? 'text-right' : ''}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Paginator table={table} total={total} t={t} />
        </CardContent>
      </Card>
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
  if (property.reference && value != null && value !== '') {
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
  t,
}: {
  onView(): void
  onEdit(): void
  onDelete(): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  return (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
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
              size="icon"
              className="hidden h-8 w-8 sm:inline-flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pages.map((p) => (
              <Button
                key={p}
                variant={p === pageIndex ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => table.setPageIndex(p)}
                aria-current={p === pageIndex ? 'page' : undefined}
              >
                {p + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden h-8 w-8 sm:inline-flex"
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
  properties,
  filters,
  onChange,
  onClose,
  t,
}: {
  properties: PropertyJSON[]
  filters: ColumnFiltersState
  onChange(next: ColumnFiltersState): void
  onClose(): void
  t: (key: string, params?: Record<string, string | number>) => string
}): React.ReactElement {
  // Local draft — edits stay here until the user clicks Apply.
  const [draft, setDraft] = React.useState<ColumnFiltersState>(filters)
  const draftMap = new Map(draft.map((f) => [f.id, f.value]))

  const setDraftFilter = (id: string, value: unknown) => {
    const without = draft.filter((f) => f.id !== id)
    setDraft(value != null && value !== '' ? [...without, { id, value }] : without)
  }

  const handleApply = () => {
    onChange(draft)
    onClose()
  }

  const handleClearAll = () => {
    setDraft([])
    onChange([])
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl sm:w-80">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{t('common:filters')}</span>
            {draft.length > 0 && (
              <Badge className="h-5 rounded-full px-1.5 text-xs">{draft.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {draft.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                {t('common:clearAll')}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Fields — id is intentionally included so users can filter by id.
            NOTE: padding is on the inner div, not on ScrollArea, so that the
            focus ring (box-shadow, 2px) is not clipped by ScrollArea's
            overflow:hidden root. */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-4 py-4">
            {properties.map((p) => (
              <FilterField
                key={p.path}
                property={p}
                value={draftMap.get(p.path) as string | undefined}
                onChange={(v) => setDraftFilter(p.path, v)}
                valueFrom={draftMap.get(p.path + '_from') as string | undefined}
                valueTo={draftMap.get(p.path + '_to') as string | undefined}
                onChangeFrom={(v) => setDraftFilter(p.path + '_from', v)}
                onChangeTo={(v) => setDraftFilter(p.path + '_to', v)}
                t={t}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Footer — always visible */}
        <div className="flex flex-none border-t border-border p-4">
          <Button className="w-full" onClick={handleApply}>
            {t('common:applyFilters')}
          </Button>
        </div>
      </div>
    </>
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
      setValueFrom(map.get(property.path + '_from') ?? '')
      setValueTo(map.get(property.path + '_to') ?? '')
    } else {
      setValue(map.get(property.path) ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Icon is highlighted when any filter for this property is set.
  const isActive = (() => {
    const map = new Map(getFilters().map((f) => [f.id, String(f.value ?? '')]))
    return isDateType
      ? !!(map.get(property.path + '_from') || map.get(property.path + '_to'))
      : !!map.get(property.path)
  })()

  const handleApply = () => {
    const updates: Record<string, string> = {}
    if (isDateType) {
      updates[property.path + '_from'] = valueFrom
      updates[property.path + '_to'] = valueTo
    } else {
      updates[property.path] = value
    }
    onApply(updates)
    setOpen(false)
  }

  const handleClear = () => {
    const updates: Record<string, string> = {}
    if (isDateType) {
      updates[property.path + '_from'] = ''
      updates[property.path + '_to'] = ''
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
  selected,
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  t,
}: {
  record: RecordJSON
  properties: PropertyJSON[]
  resourceId: string
  selected: boolean
  onToggleSelect(value: boolean): void
  onView(): void
  onEdit(): void
  onDelete(): void
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
            <RowActions onView={onView} onEdit={onEdit} onDelete={onDelete} t={t} />
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
