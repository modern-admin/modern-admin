// Reference-field helpers. Three surfaces:
//   - <ReferenceLink>: read-only display (list/show views) — fetches the
//     referenced record's title and renders it as a hyperlink to its show page.
//   - <ReferenceCombobox>: single-value edit control — Command-driven popover
//     with live search against the referenced resource's `search` action.
//   - <ReferenceMultiCombobox>: multi-value variant for many-to-many fields
//     (an array of foreign IDs); selected items render as removable chips.

import * as React from 'react'
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@modern-admin/ui'
import { Check, ChevronsUpDown, ExternalLink, X } from 'lucide-react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAdminClient } from './provider.js'
import { useResource, useSearchRecords } from './hooks.js'
import { useI18n } from './i18n.js'
import { Link } from './router.js'

/** Read-only badge that links to the referenced record's show page.
 *
 * When `populated` is provided (e.g. supplied by the list/show endpoint via
 * `record.populated[propertyPath]`) the title is rendered directly from it
 * and no `show` request is fired — this is what prevents the N+1 fetch
 * storm on list pages with reference columns. */
export function ReferenceLink({
  resourceId,
  recordId,
  fallback,
  showIcon = false,
  className,
  populated,
}: {
  resourceId: string
  recordId: string | number | null | undefined
  fallback?: React.ReactNode
  showIcon?: boolean
  className?: string
  populated?: { id?: string; title?: string } | null
}): React.ReactElement | null {
  const client = useAdminClient()
  const id = recordId == null ? '' : String(recordId)
  const hasPopulated = !!(id && populated && populated.title)
  const referencedResource = useResource(resourceId)
  // When the SPA config has been loaded, its `actions` list is already
  // filtered against the current admin's access. Missing `show` = no
  // permission to view the referenced record → render plain text instead
  // of a clickable link. While the config is still loading (`undefined`)
  // we default to "linkable" so the first paint matches the steady state
  // for the common case.
  const canShow =
    referencedResource === undefined
      ? true
      : referencedResource.actions.some((a) => a.name === 'show')
  const { data } = useQuery({
    queryKey: ['modern-admin', resourceId, 'show', id],
    queryFn: () => client.show(resourceId, id),
    enabled: !!id && !hasPopulated && canShow,
    staleTime: 30_000,
  })
  if (!id) return (fallback as React.ReactElement | null) ?? null
  const title = (hasPopulated ? populated!.title : data?.record?.title) || `#${id}`
  if (!canShow) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Badge variant="secondary">{title}</Badge>
      </span>
    )
  }
  return (
    <Link
      to={{ name: 'show', resourceId, recordId: id }}
      className={cn('inline-flex items-center gap-1 hover:underline', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <Badge variant="secondary">{title}</Badge>
      {showIcon && <ExternalLink className="size-3 opacity-50" />}
    </Link>
  )
}

/** Combobox bound to a referenced resource's `search` action. */
export function ReferenceCombobox({
  referenceResourceId,
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  referenceResourceId: string
  value: string | number | null | undefined
  onChange(next: string | null): void
  disabled?: boolean
  placeholder?: string
  /** Extra classes applied to the trigger button (e.g. height override). */
  className?: string
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const debounced = useDebounced(query, 250)
  const client = useAdminClient()
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder ?? t('common:select')

  // The currently-selected record (loaded once for the trigger label).
  const selected = useQuery({
    queryKey: ['modern-admin', referenceResourceId, 'show', value],
    queryFn: () => client.show(referenceResourceId, String(value)),
    enabled: value != null && value !== '',
    staleTime: 30_000,
  })

  const search = useSearchRecords(referenceResourceId, debounced, open)
  const items = search.data?.records ?? []

  const _title = selected.data?.record?.title
  const selectedLabel =
    _title
      ? `${_title} <${value}>`
      : value != null && value !== ''
        ? `#${value}`
        : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span
            className={cn('truncate', !selectedLabel && 'text-muted-foreground')}
            title={selectedLabel || undefined}
          >
            {selectedLabel || resolvedPlaceholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('common:searchPlaceholder')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {search.isLoading && <div className="p-3 text-sm text-muted-foreground">{t('common:loading')}</div>}
            {!search.isLoading && items.length === 0 && (
              <CommandEmpty>{t('common:noRecords')}</CommandEmpty>
            )}
            {value != null && value !== '' && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <Check className="size-4 opacity-0" />
                  <span className="text-muted-foreground">{t('common:clearSelection')}</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {items.map((r) => {
                const isSelected = String(r.id) === String(value ?? '')
                return (
                  <CommandItem
                    key={r.id}
                    value={r.id}
                    onSelect={() => {
                      onChange(r.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate" title={r.title ? `${r.title} <${r.id}>` : `#${r.id}`}>
                      {r.title ? `${r.title} <${r.id}>` : `#${r.id}`}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Renders a list of comma-separated badge links, one per foreign key.
 *
 * When `populated` + `populatedKeyPrefix` are provided, each item is looked up
 * via `populated[`${prefix}.${id}`]` and threaded into its `<ReferenceLink>`
 * to suppress per-row `show` requests. The key shape matches what the m2m
 * feature's read-hook writes (see `packages/feature-m2m`) and what the list
 * action's `populateReferences` helper writes for array references. */
export function ReferenceLinkList({
  resourceId,
  recordIds,
  className,
  populated,
  populatedKeyPrefix,
}: {
  resourceId: string
  recordIds: ReadonlyArray<string | number>
  className?: string
  populated?: Record<string, unknown>
  populatedKeyPrefix?: string
}): React.ReactElement {
  if (!recordIds || recordIds.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {recordIds.map((id) => {
        const entry =
          populated && populatedKeyPrefix
            ? (populated[`${populatedKeyPrefix}.${id}`] as
                | { id?: string; title?: string }
                | undefined)
            : undefined
        return (
          <ReferenceLink
            key={String(id)}
            resourceId={resourceId}
            recordId={id}
            populated={entry}
          />
        )
      })}
    </div>
  )
}

/** Multi-select combobox for many-to-many references. Renders selected items
 * as removable chips and feeds search results into a checkable command list. */
export function ReferenceMultiCombobox({
  referenceResourceId,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  referenceResourceId: string
  value: ReadonlyArray<string | number> | null | undefined
  onChange(next: Array<string | number>): void
  disabled?: boolean
  placeholder?: string
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const debounced = useDebounced(query, 250)
  const client = useAdminClient()
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder ?? t('common:select')
  const ids = React.useMemo(() => (value ?? []).map(String), [value])

  // Resolve labels per-id so adding/removing one item only fetches the new
  // one. Sharing the cache key with <ReferenceLink>'s single-record query
  // means already-known titles render instantly without flicker.
  const titleQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['modern-admin', referenceResourceId, 'show', id],
      queryFn: () => client.show(referenceResourceId, id),
      staleTime: 30_000,
    })),
  })
  const chips = React.useMemo(
    () =>
      ids.map((id, i) => {
        const t = titleQueries[i]?.data?.record?.title
        return { id, title: t ? `${t} <${id}>` : `#${id}` }
      }),
    [ids, titleQueries],
  )

  const search = useSearchRecords(referenceResourceId, debounced, open)
  const items = search.data?.records ?? []

  const toggle = (id: string | number): void => {
    const sid = String(id)
    const next = ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]
    onChange(next)
  }

  const remove = (id: string): void => {
    onChange(ids.filter((x) => x !== id))
  }

  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
              {s.title}
              <button
                type="button"
                aria-label={t('common:removeItem', { title: s.title })}
                disabled={disabled}
                onClick={() => remove(s.id)}
                className="rounded-sm opacity-60 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-muted-foreground">
              {ids.length > 0 ? t('common:nSelectedAddMore', { count: ids.length }) : resolvedPlaceholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={t('common:searchPlaceholder')} value={query} onValueChange={setQuery} />
            <CommandList>
              {search.isLoading && (
                <div className="p-3 text-sm text-muted-foreground">{t('common:loading')}</div>
              )}
              {!search.isLoading && items.length === 0 && (
                <CommandEmpty>{t('common:noRecords')}</CommandEmpty>
              )}
              <CommandGroup>
                {items.map((r) => {
                  const isSelected = ids.includes(String(r.id))
                  return (
                    <CommandItem
                      key={r.id}
                      value={String(r.id)}
                      onSelect={() => toggle(r.id)}
                    >
                      <Check
                        className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')}
                      />
                      <span className="truncate" title={r.title ? `${r.title} <${r.id}>` : `#${r.id}`}>
                        {r.title ? `${r.title} <${r.id}>` : `#${r.id}`}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const useDebounced = <T,>(value: T, ms: number): T => {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}
