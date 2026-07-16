// Cross-resource command palette. Backed by `useGlobalSearch`, which fans
// the query out to every registered resource's `search` action server-side.
// Results are grouped by resource; selecting an entry navigates to the
// record's show page and closes the palette.
//
// Designed as a controlled component — the parent (typically the header)
// holds the `open` state so it can pair the trigger button with the
// `mod+k` hotkey.

import * as React from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  DialogDescription,
  DialogTitle,
} from '@modern-admin/ui'
import { AlertTriangle, ArrowRight, Clock, Loader2, X } from 'lucide-react'
import { useGlobalSearch } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useNavigate } from '../router.js'

const DEBOUNCE_MS = 300
const RECENT_STORAGE_KEY = 'modern-admin:global-search:recent:v1'
const RECENT_MAX = 6

export interface GlobalSearchDialogProps {
  open: boolean

  onOpenChange(open: boolean): void
}

const readRecent = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

const writeRecent = (entries: string[]): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, RECENT_MAX)))
  } catch {
    /* quota exceeded — recent list is best-effort */
  }
}

/**
 * Highlight every case-insensitive occurrence of `needle` in `text` with
 * `<mark>`. Returns an array of React nodes ready to render inside any
 * inline container. Empty `needle` falls back to the raw string.
 */
const highlightMatch = (text: string, needle: string): React.ReactNode => {
  if (!needle) return text
  const lower = text.toLowerCase()
  const target = needle.toLowerCase()
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let key = 0
  while (cursor < text.length) {
    const idx = lower.indexOf(target, cursor)
    if (idx === -1) {
      nodes.push(text.slice(cursor))
      break
    }
    if (idx > cursor) nodes.push(text.slice(cursor, idx))
    nodes.push(
      <mark
        key={key++}
        className="rounded-sm bg-primary/20 px-0.5 text-foreground"
      >
        {text.slice(idx, idx + target.length)}
      </mark>,
    )
    cursor = idx + target.length
  }
  return nodes
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps): React.ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [recent, setRecent] = React.useState<string[]>(() => readRecent())

  // Reset query each time the dialog opens so it starts empty, and rehydrate
  // the recent list (other tabs may have appended entries while we were idle).
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setDebounced('')
      setRecent(readRecent())
    }
  }, [open])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const { data, isFetching, isError } = useGlobalSearch(debounced, open)

  // Capture the most recent successful query so it's available for the
  // "recent" list. We only persist on user-driven navigation (not every
  // keystroke) to keep the list signal-to-noise high.
  const persistRecent = React.useCallback((value: string): void => {
    if (!value) return
    setRecent((prev) => {
      const next = [value, ...prev.filter((q) => q !== value)].slice(0, RECENT_MAX)
      writeRecent(next)
      return next
    })
  }, [])

  const groups = data?.groups ?? []
  const hasQuery = debounced.length > 0
  const showEmpty = hasQuery && !isFetching && !isError && groups.length === 0

  const handleSelect = React.useCallback(
    (resourceId: string, recordId: string): void => {
      persistRecent(debounced)
      onOpenChange(false)
      navigate({ name: 'show', resourceId, recordId })
    },
    [debounced, navigate, onOpenChange, persistRecent],
  )

  const handleShowAll = React.useCallback(
    (resourceId: string): void => {
      persistRecent(debounced)
      onOpenChange(false)
      navigate({ name: 'list', resourceId })
    },
    [debounced, navigate, onOpenChange, persistRecent],
  )

  const handlePickRecent = React.useCallback((value: string): void => {
    setQuery(value)
    setDebounced(value)
  }, [])

  const handleClearRecent = React.useCallback((): void => {
    setRecent([])
    writeRecent([])
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Visually-hidden title + description keep Radix Dialog accessibility
          warnings quiet and provide a label for screen readers. */}
      <DialogTitle className="sr-only">{t('globalSearch:title')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('globalSearch:description')}
      </DialogDescription>
      <CommandInput
        placeholder={t('globalSearch:placeholder')}
        value={query}
        onValueChange={setQuery}
      />
      {/* cmdk dedupes by item value — prefix each value with `resourceId:recordId`
          so identical record ids across resources keep distinct entries.
          shouldFilter is left on (default) so cmdk re-orders by relevance against
          the typed query — server already narrowed the set down. */}
      <CommandList>
        {!hasQuery && recent.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('globalSearch:hint')}
          </div>
        )}
        {!hasQuery && recent.length > 0 && (
          <CommandGroup
            heading={
              <span className="flex items-center justify-between gap-2">
                <span>{t('globalSearch:recent')}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleClearRecent}
                >
                  <X className="mr-1 inline size-3" aria-hidden="true" />
                  {t('globalSearch:clearRecent')}
                </button>
              </span>
            }
          >
            {recent.map((entry) => (
              <CommandItem
                key={`recent:${entry}`}
                value={`recent:${entry}`}
                onSelect={() => handlePickRecent(entry)}
              >
                <Clock className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate">{entry}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hasQuery && isError && (
          <div
            className="flex items-center justify-center gap-2 py-6 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            <span>{t('globalSearch:error')}</span>
          </div>
        )}
        {showEmpty && <CommandEmpty>{t('globalSearch:noResults')}</CommandEmpty>}
        {hasQuery && !isError && isFetching && groups.length === 0 && (
          <div
            className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true"/>
            <span>{t('common:loading')}</span>
          </div>
        )}
        {groups.map((group, idx) => (
          <React.Fragment key={group.resourceId}>
            {idx > 0 && <CommandSeparator/>}
            <CommandGroup heading={group.resourceName}>
              {group.records.map((hit) => (
                <CommandItem
                  key={`${hit.resourceId}:${hit.recordId}`}
                  value={`${hit.resourceId}:${hit.recordId} ${hit.title} ${hit.snippet ?? ''}`}
                  onSelect={() => handleSelect(hit.resourceId, hit.recordId)}
                  className="flex-col items-start gap-0.5"
                >
                  <div className="flex w-full items-baseline gap-2">
                    <span className="flex-1 truncate font-medium">
                      {highlightMatch(hit.title, debounced)}
                    </span>
                    {hit.matchedField && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t('globalSearch:matchedIn').replace('{field}', hit.matchedField)}
                      </span>
                    )}
                  </div>
                  {hit.snippet && (
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {highlightMatch(hit.snippet, debounced)}
                    </div>
                  )}
                </CommandItem>
              ))}
              {/* `forceMount` keeps this row visible regardless of the current
                  query — cmdk's default fuzzy filter would otherwise drop it
                  because the value `${id}:show-all` rarely contains the typed
                  needle. */}
              <CommandItem
                key={`${group.resourceId}:show-all`}
                value={`${group.resourceId}:show-all`}
                forceMount
                onSelect={() => handleShowAll(group.resourceId)}
                className="text-xs text-muted-foreground"
              >
                <ArrowRight className="mr-2 size-3.5" aria-hidden="true" />
                {t('globalSearch:showAllIn').replace('{resource}', group.resourceName)}
              </CommandItem>
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
