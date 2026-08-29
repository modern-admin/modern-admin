import * as React from 'react'
import { Button, Input } from '@modern-admin/ui'
import {
  ComponentLoader,
  type ActionComponentProps,
  type PropertyDisplayProps,
  type PropertyEditorProps,
} from '@modern-admin/react'

function ColorPickerEditor({ value, onChange, disabled }: PropertyEditorProps): React.ReactElement {
  const text = typeof value === 'string' ? value : ''
  const normalized = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text) ? text : '#000000'
  return (
    <div className="flex items-center gap-3">
      <Input
        type="color"
        className="h-10 w-14 rounded-md p-1"
        value={normalized}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        value={text}
        placeholder="#000000"
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function ColorSwatchShow({ value }: PropertyDisplayProps): React.ReactElement {
  const text = typeof value === 'string' ? value : ''
  if (!text) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-4 rounded border border-border" style={{ backgroundColor: text }} />
      <span>{text.toUpperCase()}</span>
    </span>
  )
}

/**
 * Custom UI for the resource-level `bulkRepriceUi` action on products.
 *
 * Demonstrates the whole contract: `data` holds the priming GET's response
 * (the handler ran with `method: 'get'`), `invoke(payload)` POSTs the form,
 * and `close()` returns to the list. The action's `notice` is toasted by the
 * host — the component only has to render.
 */
function BulkRepriceAction({
  data,
  loading,
  invoke,
  submitting,
  close,
}: ActionComponentProps): React.ReactElement {
  const [percent, setPercent] = React.useState('10')

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  const total = Number(data?.total ?? 0)
  const min = Number(data?.minPrice ?? 0)
  const max = Number(data?.maxPrice ?? 0)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void invoke({ percent: Number(percent) })
          .then(close)
          .catch(() => {
            // The host already surfaced the error toast; stay on the form so
            // the operator can correct the value.
          })
      }}
    >
      <p className="text-sm text-muted-foreground">
        {total} products, prices from {min} to {max}.
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Change by (%)</span>
        <Input
          type="number"
          step="0.5"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          disabled={submitting}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Applying…' : 'Apply'}
        </Button>
        <Button type="button" variant="outline" onClick={close} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * Custom UI for the bulk-level `scheduleManyUi` action on posts.
 *
 * Shows the bulk half of the contract: `recordIds` is the live selection and
 * `records` is populated from the priming GET (the handler returns
 * `ctx.records` on its `get` branch), so the operator sees exactly which
 * rows the action will touch before committing.
 */
function SchedulePostsAction({
  recordIds,
  records,
  loading,
  invoke,
  submitting,
  close,
}: ActionComponentProps): React.ReactElement {
  const [when, setWhen] = React.useState('')

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  const titles = records?.map((r) => r.title || r.id) ?? recordIds ?? []

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void invoke({ publishedAt: when })
          .then(close)
          .catch(() => {
            // Error toast already shown by the host; keep the form open.
          })
      }}
    >
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">Scheduling {titles.length} post(s):</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {titles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Publish at</span>
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          disabled={submitting}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || !when}>
          {submitting ? 'Scheduling…' : 'Schedule'}
        </Button>
        <Button type="button" variant="outline" onClick={close} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export const adminComponents = new ComponentLoader()
  .add('color-picker', ColorPickerEditor)
  .add('color-swatch', ColorSwatchShow)
  .add('bulk-reprice', BulkRepriceAction)
  .add('schedule-posts', SchedulePostsAction)
