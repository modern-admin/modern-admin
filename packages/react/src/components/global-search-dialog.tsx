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
import { Loader2 } from 'lucide-react'
import { useGlobalSearch } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useNavigate } from '../router.js'

const DEBOUNCE_MS = 500

export interface GlobalSearchDialogProps {
  open: boolean

  onOpenChange(open: boolean): void
}

export function GlobalSearchDialog({
                                     open,
                                     onOpenChange,
                                   }: GlobalSearchDialogProps): React.ReactElement {
  const {t} = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  // Reset query each time the dialog opens so it starts empty.
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setDebounced('')
    }
  }, [open])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const {data, isFetching} = useGlobalSearch(debounced, open)

  const groups = data?.groups ?? []
  const hasQuery = debounced.length > 0
  const showEmpty = hasQuery && !isFetching && groups.length === 0

  const handleSelect = React.useCallback(
    (resourceId: string, recordId: string): void => {
      onOpenChange(false)
      navigate({name: 'show', resourceId, recordId})
    },
    [navigate, onOpenChange],
  )

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
        {!hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('globalSearch:hint')}
          </div>
        )}
        {showEmpty && <CommandEmpty>{t('globalSearch:noResults')}</CommandEmpty>}
        {hasQuery && isFetching && groups.length === 0 && (
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
                  value={`${hit.resourceId}:${hit.recordId} ${hit.title}`}
                  onSelect={() => handleSelect(hit.resourceId, hit.recordId)}
                >
                  <span className="flex-1 truncate">{hit.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.resourceName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
