import * as React from 'react'
import { cn } from '../lib/utils.js'

export interface DiffField {
  path: string
  /** Human-readable property label. When present, shown before the path. */
  label?: string
  before?: unknown
  after?: unknown
  kind: 'added' | 'changed' | 'removed'
}

export interface DiffViewLabels {
  added?: string
  changed?: string
  removed?: string
  before?: string
  after?: string
  noChanges?: string
}

export interface DiffViewProps {
  fields: ReadonlyArray<DiffField>
  labels?: DiffViewLabels
  className?: string
}

const DEFAULT_LABELS: Required<DiffViewLabels> = {
  added: 'Added',
  changed: 'Changed',
  removed: 'Removed',
  before: 'Before',
  after: 'After',
  noChanges: 'No changes',
}

const formatValue = (value: unknown): string => {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

const isMultiline = (text: string): boolean => text.includes('\n') || text.length > 80

export function DiffView({ fields, labels, className }: DiffViewProps): React.ReactElement {
  const l = { ...DEFAULT_LABELS, ...labels }
  if (fields.length === 0) {
    return (
      <div className={cn('rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground', className)}>
        {l.noChanges}
      </div>
    )
  }
  return (
    <ul
      className={cn(
        'divide-y divide-border overflow-hidden rounded-md border border-border bg-card text-xs',
        className,
      )}
    >
      {fields.map((field) => (
        <FieldDiff key={field.path} field={field} labels={l} />
      ))}
    </ul>
  )
}

function FieldDiff({
  field,
  labels,
}: {
  field: DiffField
  labels: Required<DiffViewLabels>
}): React.ReactElement {
  const beforeText = field.kind === 'added' ? '' : formatValue(field.before)
  const afterText = field.kind === 'removed' ? '' : formatValue(field.after)
  const compact = !isMultiline(beforeText) && !isMultiline(afterText)
  return (
    <li className="grid grid-cols-[8rem_1fr] gap-x-3 px-3 py-1.5 sm:grid-cols-[10rem_1fr]">
      <div className="min-w-0 pt-0.5">
        {field.label && (
          <p className="truncate text-[11px] font-medium text-foreground" title={field.label}>
            {field.label}
          </p>
        )}
        <code
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={field.path}
        >
          {field.path}
        </code>
      </div>
      {compact ? (
        <CompactValues
          kind={field.kind}
          before={beforeText}
          after={afterText}
          labels={labels}
        />
      ) : (
        <StackedValues
          kind={field.kind}
          before={beforeText}
          after={afterText}
          labels={labels}
        />
      )}
    </li>
  )
}

function CompactValues({
  kind,
  before,
  after,
  labels,
}: {
  kind: DiffField['kind']
  before: string
  after: string
  labels: Required<DiffViewLabels>
}): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 font-mono text-xs leading-5">
      {kind !== 'added' && (
        <span
          aria-label={labels.before}
          className="truncate rounded bg-red-50 px-1.5 text-red-900 line-through decoration-red-400/60 dark:bg-red-950/40 dark:text-red-100"
          title={before}
        >
          {before || '\u00A0'}
        </span>
      )}
      {kind !== 'removed' && (
        <span
          aria-label={labels.after}
          className="truncate rounded bg-green-50 px-1.5 text-green-900 dark:bg-green-950/40 dark:text-green-100"
          title={after}
        >
          {after || '\u00A0'}
        </span>
      )}
    </div>
  )
}

function StackedValues({
  kind,
  before,
  after,
  labels,
}: {
  kind: DiffField['kind']
  before: string
  after: string
  labels: Required<DiffViewLabels>
}): React.ReactElement {
  return (
    <div className="min-w-0 overflow-hidden rounded font-mono text-xs leading-5">
      {kind !== 'added' && (
        <pre
          aria-label={labels.before}
          className="overflow-x-auto whitespace-pre-wrap bg-red-50 px-2 py-0.5 text-red-900 dark:bg-red-950/40 dark:text-red-100"
        >
          {prefixed('-', before)}
        </pre>
      )}
      {kind !== 'removed' && (
        <pre
          aria-label={labels.after}
          className="overflow-x-auto whitespace-pre-wrap bg-green-50 px-2 py-0.5 text-green-900 dark:bg-green-950/40 dark:text-green-100"
        >
          {prefixed('+', after)}
        </pre>
      )}
    </div>
  )
}

const prefixed = (sign: '+' | '-', text: string): string =>
  text.split('\n').map((l) => `${sign} ${l}`).join('\n')
