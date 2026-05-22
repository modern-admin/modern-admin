// Picker dialog for many-to-many relation fields. Opens a modal containing
// the embedded ResourceListPage of the referenced resource in "picker" mode
// (controlled row selection, no row navigation, no toolbar create/export).
// The dialog inherits the full list UX — sorting, filtering, header
// filters, column visibility, pagination — so users can find records the
// same way they would on the main list page.
//
// Selection inside the dialog is staged locally and only committed to the
// outer form on Save, so the user can cancel without polluting the value.
//
// Used as an alternative to ReferenceMultiCombobox for m2m and
// reference-array fields. Renders existing selections as removable chips
// above the trigger button — same chip pattern as ReferenceMultiCombobox.

import * as React from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@modern-admin/ui'
import { Plus, X } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { useAdminClient } from '../provider.js'
import { useI18n } from '../i18n.js'
import { useResource } from '../hooks.js'
import { ResourceListPage } from '../pages/list-page.js'
import type { ListQueryState } from '../router.js'

export interface ReferenceMultiTableDialogProps {
  referenceResourceId: string
  value: ReadonlyArray<string | number> | null | undefined
  onChange(next: Array<string | number>): void
  disabled?: boolean
  /** Label for the trigger button. Defaults to "Pick records". */
  triggerLabel?: string
  className?: string
}

export function ReferenceMultiTableDialog({
  referenceResourceId,
  value,
  onChange,
  disabled,
  triggerLabel,
  className,
}: ReferenceMultiTableDialogProps): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const resource = useResource(referenceResourceId)

  const committedIds = React.useMemo(
    () => (value ?? []).map(String),
    [value],
  )

  const [open, setOpen] = React.useState(false)
  // Staged selection inside the dialog. Reset to committed value each time
  // the dialog opens so a previous Cancel doesn't leak state.
  const [stagedIds, setStagedIds] = React.useState<string[]>(() => committedIds)
  React.useEffect(() => {
    if (open) setStagedIds(committedIds)
  }, [open, committedIds])

  // Embedded list page keeps its own page/sort/filter state. Reset to
  // page 1 each open so each pick session starts fresh.
  const [query, setQuery] = React.useState<ListQueryState>({ perPage: 10 })
  React.useEffect(() => {
    if (open) setQuery({ perPage: 10 })
  }, [open])

  // Resolve chip labels by fetching each currently-committed record. Sharing
  // the query key with ReferenceLink keeps the cache warm — already-visible
  // chips render instantly.
  const titleQueries = useQueries({
    queries: committedIds.map((id) => ({
      queryKey: ['modern-admin', referenceResourceId, 'show', id],
      queryFn: () => client.show(referenceResourceId, id),
      staleTime: 30_000,
    })),
  })
  const chips = React.useMemo(
    () =>
      committedIds.map((id, i) => {
        const title = titleQueries[i]?.data?.record?.title
        return { id, label: title ? `${title} <${id}>` : `#${id}` }
      }),
    [committedIds, titleQueries],
  )

  const remove = (id: string): void => {
    onChange(committedIds.filter((x) => x !== id))
  }

  const handleSave = (): void => {
    onChange(stagedIds)
    setOpen(false)
  }

  const handleCancel = (): void => {
    setOpen(false)
  }

  const resolvedTriggerLabel =
    triggerLabel ??
    (committedIds.length > 0
      ? t('common:managePickRecords', { count: committedIds.length })
      : t('common:pickRecords'))

  return (
    <div className={cn('space-y-2', className)}>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
              <span className="truncate" title={c.label}>{c.label}</span>
              <button
                type="button"
                aria-label={t('common:removeItem', { title: c.label })}
                disabled={disabled}
                onClick={() => remove(c.id)}
                className="rounded-sm opacity-60 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full justify-start font-normal"
      >
        <Plus className="size-4" />
        <span className="truncate">{resolvedTriggerLabel}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // Wide layout so the embedded table has room. Cap height and let
          // the body scroll independently of the footer.
          className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0"
        >
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>
              {t('common:pickRecordsFrom', { name: resource?.name ?? referenceResourceId })}
            </DialogTitle>
          </DialogHeader>
          {/* The list page is in embedded mode (`card: false`) so it
              manages its own internal scroll: the table area scrolls,
              the paginator sits below as a flush full-width bar.  The
              body wrapper itself does NOT scroll. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <ResourceListPage
              resourceId={referenceResourceId}
              query={query}
              onQueryChange={setQuery}
              selectedIds={stagedIds}
              onSelectionChange={setStagedIds}
              disableRowNavigation
              features={{
                breadcrumbs: false,
                title: false,
                create: false,
                export: false,
                bulk: false,
                actions: false,
                card: false,
              }}
            />
          </div>
          <DialogFooter className="gap-2 border-t border-border px-6 py-4">
            <div className="mr-auto text-sm text-muted-foreground self-center">
              {t('common:selectedCount', { count: stagedIds.length })}
            </div>
            <Button variant="outline" type="button" onClick={handleCancel}>
              {t('common:cancel')}
            </Button>
            <Button type="button" onClick={handleSave}>
              {t('common:save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
