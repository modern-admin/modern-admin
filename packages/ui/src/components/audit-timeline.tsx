import * as React from 'react'
import { cn } from '../lib/utils.js'

export interface AuditTimelineItem {
  /** Stable id for React reconciliation; falls back to `at + index`. */
  id?: string
  resourceId: string
  action: string
  recordId?: string
  recordIds?: string[]
  userId?: string
  at: number
}

export interface AuditTimelineLabels {
  unknownUser?: string
  noEvents?: string
  records?: string
}

export interface AuditTimelineProps {
  items: ReadonlyArray<AuditTimelineItem>
  labels?: AuditTimelineLabels
  className?: string
  formatDate?: (value: number) => string
}

const DEFAULT_LABELS: Required<AuditTimelineLabels> = {
  unknownUser: 'Unknown user',
  noEvents: 'No events',
  records: 'records',
}

export function AuditTimeline({
  items,
  labels,
  className,
  formatDate = (v) => new Date(v).toISOString(),
}: AuditTimelineProps): React.ReactElement {
  const l = { ...DEFAULT_LABELS, ...labels }
  if (items.length === 0) {
    return (
      <div className={cn('rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground', className)}>
        {l.noEvents}
      </div>
    )
  }
  return (
    <ol className={cn('relative space-y-3', className)}>
      {items.map((item, index) => (
        <li key={item.id ?? `${item.at}:${index}`} className="relative rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(item.userId ?? l.unknownUser)}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">
                  {item.userId ?? l.unknownUser}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <ActionChip action={item.action} />
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                    {item.resourceId}
                  </span>
                  {item.recordId && (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      #{item.recordId}
                    </code>
                  )}
                  {!item.recordId && item.recordIds?.length ? (
                    <span className="text-xs">
                      {item.recordIds.length} {l.records}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">
              {formatDate(item.at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ActionChip({ action }: { action: string }): React.ReactElement {
  return (
    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {action}
    </span>
  )
}

function initials(value: string): string {
  const parts = value.split(/\s+|[._@-]/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}
