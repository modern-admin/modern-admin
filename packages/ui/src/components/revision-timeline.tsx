import * as React from 'react'
import { cn } from '../lib/utils.js'

export interface RevisionTimelineItem {
  id: string
  op: 'create' | 'update' | 'delete'
  userId?: string
  /** Resolved, human-readable label for the user who created the revision
   *  (e.g. email or full name). When set, it's shown instead of the raw
   *  `userId`. Resolution happens in the React layer so this UI component
   *  stays i18n- and data-source-agnostic. */
  userLabel?: string
  createdAt: string
  changes?: number
}

export interface RevisionTimelineLabels {
  create?: string
  update?: string
  delete?: string
  unknownUser?: string
  changes?: string
}

export interface RevisionTimelineProps {
  items: ReadonlyArray<RevisionTimelineItem>
  selectedId?: string
  labels?: RevisionTimelineLabels
  className?: string
  formatDate?: (value: string) => string
  onSelect?: (item: RevisionTimelineItem) => void
}

const DEFAULT_LABELS: Required<RevisionTimelineLabels> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  unknownUser: 'Unknown user',
  changes: 'changes',
}

export function RevisionTimeline({
  items,
  selectedId,
  labels,
  className,
  formatDate = (v) => v,
  onSelect,
}: RevisionTimelineProps): React.ReactElement {
  const l = { ...DEFAULT_LABELS, ...labels }
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => {
        const selected = item.id === selectedId
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={cn(
              'relative flex w-full gap-3 rounded-md border p-3 text-left transition-colors',
              selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{labelForOp(item.op, l)}</span>
                {item.changes !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.changes} {l.changes}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.userLabel ?? item.userId ?? l.unknownUser}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatDate(item.createdAt)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function labelForOp(op: RevisionTimelineItem['op'], labels: Required<RevisionTimelineLabels>): string {
  if (op === 'create') return labels.create
  if (op === 'delete') return labels.delete
  return labels.update
}
