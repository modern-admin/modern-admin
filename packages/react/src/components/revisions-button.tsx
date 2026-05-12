import * as React from 'react'
import {
  Button,
  DiffView,
  RevisionTimeline,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
} from '@modern-admin/ui'
import { History, RotateCcw } from 'lucide-react'
import { diffSnapshots } from '@modern-admin/core'
import { useRecordHistory, useResource, useRevertRevision } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useDialogs } from '../dialogs.js'
import { useNotify } from '../notify.js'
import { useUserDirectory, userLabelOf } from '../user-directory.js'
import type { HistoryDiffEntry, HistoryRevision } from '../client.js'

export interface RevisionsButtonProps {
  resourceId: string
  recordId: string
}

export function RevisionsButton({
  resourceId,
  recordId,
}: RevisionsButtonProps): React.ReactElement {
  const { t, locale } = useI18n()
  const resource = useResource(resourceId)
  const history = useRecordHistory(resourceId, recordId, { limit: 50 })
  const revert = useRevertRevision(resourceId, recordId)
  const dialogs = useDialogs()
  const notify = useNotify()
  const [open, setOpen] = React.useState(false)
  const revisions = history.data?.revisions ?? []
  // Resolve revision authors to human-readable labels (email / name)
  // instead of showing raw user UUIDs.
  const userIds = React.useMemo(
    () => Array.from(new Set(revisions.map((r) => r.userId).filter((v): v is string => !!v))),
    [revisions],
  )
  const users = useUserDirectory(userIds)
  const labelForUser = React.useCallback(
    (userId: string | undefined): string | undefined =>
      userId ? userLabelOf(users.get(userId), userId) : undefined,
    [users],
  )
  const [selectedId, setSelectedId] = React.useState<string | undefined>()
  const [compareToId, setCompareToId] = React.useState<string>('')
  const selected = revisions.find((r) => r.id === selectedId) ?? revisions[0]
  const compareTo = compareToId
    ? revisions.find((r) => r.id === compareToId)
    : undefined

  // Build a path → label map from the resource schema so each diff field
  // can show a human-readable name before its technical path.
  const labelByPath = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const p of resource?.properties ?? []) map[p.path] = p.label
    return map
  }, [resource])

  const withLabels = React.useCallback(
    (fields: ReturnType<typeof diffSnapshots>) =>
      fields.map((f) => ({ ...f, label: labelByPath[f.path] })),
    [labelByPath],
  )

  const visibleFields = selected
    ? withLabels(
        compareTo
          ? diffSnapshots(compareTo.snapshot, selected.snapshot)
          : fieldsFor(selected),
      )
    : []

  React.useEffect(() => {
    if (!selectedId && revisions[0]) setSelectedId(revisions[0].id)
  }, [revisions, selectedId])

  React.useEffect(() => {
    if (selected?.id && compareToId === selected.id) setCompareToId('')
  }, [compareToId, selected?.id])

  const formatDate = React.useCallback(
    (value: string) => new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)),
    [locale],
  )

  const handleRevert = async (revision: HistoryRevision): Promise<void> => {
    const ok = await dialogs.confirm({
      title: t('history:confirmRevert'),
      confirmLabel: t('history:revert'),
      destructive: true,
    })
    if (!ok) return
    try {
      await revert.mutateAsync({ revisionId: revision.id })
      notify.success({ key: 'history:revertSuccess' })
      setSelectedId(undefined)
      setCompareToId('')
      setOpen(false)
    } catch (err) {
      notify.error(
        { key: 'history:revertFailed' },
        { description: err instanceof Error ? err.message : String(err) },
      )
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="size-4" />
          {t('history:revisions')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>{t('history:revisions')}</SheetTitle>
        </SheetHeader>
        {history.isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : history.isError ? (
          <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {t('history:loadError')}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
            <RevisionTimeline
              items={revisions.map((r) => ({
                id: r.id,
                op: r.op,
                userId: r.userId,
                userLabel: labelForUser(r.userId),
                createdAt: r.createdAt,
                changes: fieldsFor(r).length,
              }))}
              selectedId={selected?.id}
              onSelect={(item) => setSelectedId(item.id)}
              formatDate={formatDate}
              labels={{
                create: t('history:op.create'),
                update: t('history:op.update'),
                delete: t('history:op.delete'),
                unknownUser: t('history:unknownUser'),
                changes: t('history:changes'),
              }}
            />
            <div className="min-w-0 space-y-4">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium">{formatDate(selected.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {labelForUser(selected.userId) ?? t('history:unknownUser')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={compareToId || '_none_'}
                        onValueChange={(v) => setCompareToId(v === '_none_' ? '' : v)}
                      >
                        <SelectTrigger
                          className="h-8 w-auto text-xs"
                          aria-label={t('history:compareTo')}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">{t('history:storedDiff')}</SelectItem>
                          {revisions
                            .filter((r) => r.id !== selected.id)
                            .map((revision) => (
                              <SelectItem key={revision.id} value={revision.id}>
                                {formatDate(revision.createdAt)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={revert.isPending || selected.op === 'delete'}
                        onClick={() => void handleRevert(selected)}
                      >
                        <RotateCcw className="size-4" />
                        {t('history:revert')}
                      </Button>
                    </div>
                  </div>
                  <DiffView
                    fields={visibleFields}
                    labels={{
                      added: t('diff:added'),
                      changed: t('diff:changed'),
                      removed: t('diff:removed'),
                      before: t('diff:before'),
                      after: t('diff:after'),
                      noChanges: t('diff:noChanges'),
                    }}
                  />
                </>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {t('history:noRevisions')}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const fieldsFor = (revision: HistoryRevision): HistoryDiffEntry[] =>
  diffSnapshots(revision.snapshotBefore ?? {}, revision.snapshot)
