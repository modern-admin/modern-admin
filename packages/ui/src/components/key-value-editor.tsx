// KeyValueEditor + KeyValueView — a friendly alternative to JsonEditor for
// JSON columns with a *fixed* set of keys.
//
// Instead of showing the raw JSON (`{ "locale": "en", "featured": true }`)
// the editor renders one row per declared key, each with a normal form
// input typed appropriately (string, number, boolean, textarea, select).
// No braces, no quotes, no parse errors — the user just edits the values.
//
// The component is i18n-unaware: it accepts an optional `labels` prop with
// English fallbacks so it works standalone in tests/Storybook. The
// `packages/react` layer translates and feeds them in.
//
// Mobile-first: each row stacks label-above-input on narrow screens and
// switches to a two-column label/input layout from `sm:` upwards.

import * as React from 'react'
import { cn } from '../lib/utils.js'
import { Input } from './input.js'
import { Textarea } from './textarea.js'
import { Switch } from './switch.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select.js'
import { Combobox, type ComboboxLabels, type ComboboxSuggestion } from './combobox.js'
import { InfoTooltip } from './info-tooltip.js'

/** Built-in editor types. Resource code may pass a string; unknown values
 * fall back to a plain string input. */
export type KeyValueFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'textarea'
  | 'select'
  | 'autocomplete'

/** One declared key inside the JSON object. */
export interface KeyValueFieldSpec {
  /** JSON key on the underlying object. */
  key: string
  /** Visible label. Defaults to the key. */
  label?: string
  /** Editor kind. Default: `'string'`. */
  type?: KeyValueFieldType
  /** Helper text shown under the input. */
  description?: string
  /** Placeholder for text/number inputs. */
  placeholder?: string
  /** Visual `*` marker; required-ness is enforced by the form layer. */
  isRequired?: boolean
  /**
   * Enum source for `type: 'select'` and static suggestions for
   * `type: 'autocomplete'`. Either a list of strings (used both as value
   * and label) or `{ value, label }` objects.
   */
  availableValues?: ReadonlyArray<string | { value: string; label: string }>
  /**
   * For `type: 'autocomplete'`: pull dynamic suggestions from the named
   * field of records of another resource (e.g. `users.email`). Resolved
   * by the `packages/react` layer before render — KeyValueEditor itself
   * never fetches, the loaded values arrive via `suggestionsByKey`.
   */
  suggestionsResource?: string
  /** Path of the field on `suggestionsResource` to project. */
  suggestionsField?: string
}

/** English-default labels surfaced through `labels` for i18n. */
export interface KeyValueEditorLabels {
  /** Placeholder shown in the empty `select` slot. Default: '—'. */
  emptyOption?: string
  /** Visually-hidden / fallback label suffix when a row has no `label`. */
  fieldLabelFallback?: (key: string) => string
  /** Forwarded to the inner `Combobox` for autocomplete fields. */
  combobox?: ComboboxLabels
}

export interface KeyValueEditorProps {
  /** Declared key set. Order is preserved on screen. */
  fields: ReadonlyArray<KeyValueFieldSpec>
  /** Current value. Anything that is not a plain object is treated as `{}`. */
  value: unknown
  /** Emits a fresh JSON object on every change. */
  onChange(next: Record<string, unknown>): void
  onBlur?(): void
  disabled?: boolean
  className?: string
  labels?: KeyValueEditorLabels
  /**
   * Pre-loaded suggestions per autocomplete field, keyed by `field.key`.
   * The editor stays i18n-/network-unaware: callers (e.g. the React
   * property renderer) load values from the database and feed them in.
   */
  suggestionsByKey?: Readonly<Record<string, ReadonlyArray<ComboboxSuggestion>>>
  /** Per-key loading flags to render a spinner while suggestions stream in. */
  suggestionsLoadingByKey?: Readonly<Record<string, boolean>>
}

const defaultLabels: Required<Omit<KeyValueEditorLabels, 'combobox'>> &
  Pick<KeyValueEditorLabels, 'combobox'> = {
    emptyOption: '—',
    fieldLabelFallback: (key) => key,
  }

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const normaliseAvailableValues = (
  raw: KeyValueFieldSpec['availableValues'],
): Array<{ value: string; label: string }> => {
  if (!raw) return []
  return raw.map((v) => (typeof v === 'string' ? { value: v, label: v } : v))
}

const SENTINEL_EMPTY = '__kv_empty__'

export function KeyValueEditor({
  fields,
  value,
  onChange,
  onBlur,
  disabled,
  className,
  labels,
  suggestionsByKey,
  suggestionsLoadingByKey,
}: KeyValueEditorProps): React.ReactElement {
  const l = { ...defaultLabels, ...labels }
  const obj = toRecord(value)

  // Replace `key` with `next` and emit a brand-new object so callers using
  // referential equality (e.g. RHF) detect the change.
  const set = (key: string, next: unknown): void => {
    const out: Record<string, unknown> = { ...obj }
    if (next === null || next === undefined) {
      delete out[key]
    } else {
      out[key] = next
    }
    onChange(out)
  }

  return (
    <div
      className={cn(
        'divide-y divide-border rounded-md border border-border bg-card',
        className,
      )}
    >
      {fields.map((f) => {
        const fieldType: KeyValueFieldType = f.type ?? 'string'
        const label = f.label ?? l.fieldLabelFallback(f.key)
        const inputId = `kv-${f.key}`
        const raw = obj[f.key]

        let control: React.ReactElement
        if (fieldType === 'boolean') {
          control = (
            <Switch
              id={inputId}
              checked={Boolean(raw)}
              onCheckedChange={(v) => set(f.key, Boolean(v))}
              disabled={disabled}
              aria-label={label}
            />
          )
        } else if (fieldType === 'number') {
          control = (
            <Input
              id={inputId}
              type="number"
              inputMode="decimal"
              value={raw == null ? '' : String(raw)}
              placeholder={f.placeholder}
              disabled={disabled}
              onBlur={onBlur}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') return set(f.key, null)
                const n = Number(v)
                set(f.key, Number.isFinite(n) ? n : v)
              }}
              aria-label={label}
            />
          )
        } else if (fieldType === 'textarea') {
          control = (
            <Textarea
              id={inputId}
              value={raw == null ? '' : String(raw)}
              placeholder={f.placeholder}
              disabled={disabled}
              onBlur={onBlur}
              onChange={(e) =>
                set(f.key, e.target.value === '' ? null : e.target.value)
              }
              rows={3}
              aria-label={label}
            />
          )
        } else if (fieldType === 'select') {
          const opts = normaliseAvailableValues(f.availableValues)
          const current = raw == null || raw === '' ? SENTINEL_EMPTY : String(raw)
          control = (
            <Select
              value={current}
              onValueChange={(v) => set(f.key, v === SENTINEL_EMPTY ? null : v)}
              disabled={disabled}
            >
              <SelectTrigger id={inputId} aria-label={label}>
                <SelectValue placeholder={l.emptyOption} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_EMPTY}>{l.emptyOption}</SelectItem>
                {opts.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        } else if (fieldType === 'autocomplete') {
          // Combine static `availableValues` declared on the field with
          // any dynamic values pre-loaded by the parent (e.g. distinct
          // values from a DB column). Dedupe by `value` so a static hint
          // and a DB row that share a value collapse to a single item.
          const fromStatic = normaliseAvailableValues(f.availableValues)
          const fromDynamic = suggestionsByKey?.[f.key] ?? []
          const seen = new Set<string>()
          const merged: ComboboxSuggestion[] = []
          for (const s of [...fromStatic, ...fromDynamic]) {
            const v = typeof s === 'string' ? s : s.value
            if (seen.has(v)) continue
            seen.add(v)
            merged.push(s)
          }
          control = (
            <Combobox
              id={inputId}
              value={raw == null ? '' : String(raw)}
              onChange={(v) => set(f.key, v === '' ? null : v)}
              onBlur={onBlur}
              suggestions={merged}
              loading={suggestionsLoadingByKey?.[f.key]}
              disabled={disabled}
              placeholder={f.placeholder}
              aria-label={label}
              labels={labels?.combobox}
            />
          )
        } else {
          // string (default)
          control = (
            <Input
              id={inputId}
              type="text"
              value={raw == null ? '' : String(raw)}
              placeholder={f.placeholder}
              disabled={disabled}
              onBlur={onBlur}
              onChange={(e) =>
                set(f.key, e.target.value === '' ? null : e.target.value)
              }
              aria-label={label}
            />
          )
        }

        return (
          <div
            key={f.key}
            className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <label
              htmlFor={inputId}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-foreground sm:w-44 sm:pt-2"
            >
              <span className="truncate">{label}</span>
              {f.description ? (
                <InfoTooltip content={f.description} ariaLabel={f.description} />
              ) : null}
              {f.isRequired ? (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              ) : null}
            </label>
            <div className="min-w-0 flex-1">
              {control}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Read-only view ──────────────────────────────────────────────────────────

export interface KeyValueViewLabels {
  /** Placeholder for missing values. Default: '—'. */
  emptyValue?: string
  /** Field label fallback when a spec entry has no `label`. */
  fieldLabelFallback?: (key: string) => string
  /** Boolean true label. Default: 'Yes'. */
  trueLabel?: string
  /** Boolean false label. Default: 'No'. */
  falseLabel?: string
}

export interface KeyValueViewProps {
  fields: ReadonlyArray<KeyValueFieldSpec>
  value: unknown
  className?: string
  /**
   * `'inline'` collapses all fields into a single comma-separated row used
   * by the list view. `'block'` (default) renders a vertical key/value
   * table for the show view.
   */
  variant?: 'inline' | 'block'
  labels?: KeyValueViewLabels
}

const defaultViewLabels: Required<KeyValueViewLabels> = {
  emptyValue: '—',
  fieldLabelFallback: (key) => key,
  trueLabel: 'Yes',
  falseLabel: 'No',
}

const stringifyDisplay = (
  raw: unknown,
  field: KeyValueFieldSpec,
  l: Required<KeyValueViewLabels>,
): string => {
  if (raw == null || raw === '') return l.emptyValue
  if (field.type === 'boolean') return raw ? l.trueLabel : l.falseLabel
  if (
    (field.type === 'select' || field.type === 'autocomplete') &&
    field.availableValues
  ) {
    const opts = normaliseAvailableValues(field.availableValues)
    const match = opts.find((o) => o.value === String(raw))
    return match?.label ?? String(raw)
  }
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return String(raw)
    }
  }
  return String(raw)
}

export function KeyValueView({
  fields,
  value,
  className,
  variant = 'block',
  labels,
}: KeyValueViewProps): React.ReactElement {
  const l = { ...defaultViewLabels, ...labels }
  const obj = toRecord(value)

  if (variant === 'inline') {
    const parts = fields
      .map((f) => {
        const raw = obj[f.key]
        if (raw == null || raw === '') return null
        const label = f.label ?? l.fieldLabelFallback(f.key)
        return `${label}: ${stringifyDisplay(raw, f, l)}`
      })
      .filter((s): s is string => s !== null)
    return (
      <span
        className={cn(
          'line-clamp-1 max-w-[24rem] truncate text-xs text-muted-foreground',
          className,
        )}
        title={parts.join(', ') || undefined}
      >
        {parts.length > 0 ? parts.join(', ') : l.emptyValue}
      </span>
    )
  }

  return (
    <dl
      className={cn(
        'divide-y divide-border rounded-md border border-border bg-muted/30 text-sm',
        className,
      )}
    >
      {fields.map((f) => {
        const label = f.label ?? l.fieldLabelFallback(f.key)
        const text = stringifyDisplay(obj[f.key], f, l)
        return (
          <div
            key={f.key}
            className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-44">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 break-words text-foreground">
              {text}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
