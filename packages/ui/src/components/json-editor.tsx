// JsonEditor + JsonView — editing/displaying JSON-typed property values.
//
// Editor: a monospace Textarea with live parse, an inline "Format" button
// and an error band for parse failures. Calls onChange with the parsed
// value (object/array/primitive) — never with the raw string — so the form
// layer stores structured data.
//
// View: pretty-printed <pre> for show, single-line collapsed code for list.

import * as React from 'react'
import { AlertCircle, Wand2 } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import { Textarea } from './textarea.js'

const stringify = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') {
    // Strings that are themselves JSON come back from some adapters.
    // Normalize to pretty form; otherwise leave the raw string alone.
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export interface JsonEditorProps {
  value: unknown
  onChange(next: unknown): void
  onBlur?(): void
  disabled?: boolean
  placeholder?: string
  rows?: number
  className?: string
  /** Translated label for the inline "Format" button. */
  formatLabel?: string
  /** Translated prefix for parse-error messages. */
  invalidLabel?: string
}

// Canonical (key-stable, no whitespace) JSON serialization used to decide
// whether an externally arriving `value` is structurally identical to what
// the user is currently typing. Reference comparison would always fail
// because the parent typically returns a fresh object on every re-render.
const canonical = (value: unknown): string => {
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const tryParse = (text: string): { ok: true; value: unknown } | { ok: false } => {
  if (text.trim() === '') return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

export function JsonEditor({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = '{}',
  rows = 8,
  className,
  formatLabel = 'Format',
  invalidLabel = 'Invalid JSON',
}: JsonEditorProps): React.ReactElement {
  const [draft, setDraft] = React.useState<string>(() => stringify(value))
  const [error, setError] = React.useState<string | null>(null)

  // Resync the textarea only when the *external* value differs structurally
  // from what the user is currently typing. Without the canonical-form check,
  // every keystroke that produces valid JSON would trigger
  //   onChange(parsed) → parent re-render → useEffect → setDraft(stringify(value))
  // and the user's in-progress text would get auto-pretty-printed on every
  // keystroke. By comparing canonical JSON, our own emissions become no-ops
  // here, while genuine external resets (record reload, form.reset()) still
  // refresh the draft.
  React.useEffect(() => {
    const parsed = tryParse(draft)
    const draftCanonical = parsed.ok ? canonical(parsed.value) : '__invalid__'
    if (draftCanonical === canonical(value)) return
    setDraft(stringify(value))
    setError(null)
    // Intentionally depend only on `value`. `draft` is read via closure: we
    // only want this to fire on external changes, not when the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleChange = (next: string): void => {
    setDraft(next)
    if (next.trim() === '') {
      setError(null)
      onChange(null)
      return
    }
    const parsed = tryParse(next)
    if (parsed.ok) {
      setError(null)
      onChange(parsed.value)
    } else {
      try {
        JSON.parse(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : invalidLabel)
      }
    }
  }

  const format = (): void => {
    if (draft.trim() === '') return
    try {
      const parsed = JSON.parse(draft) as unknown
      const pretty = JSON.stringify(parsed, null, 2)
      setDraft(pretty)
      setError(null)
      onChange(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : invalidLabel)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          rows={rows}
          spellCheck={false}
          placeholder={placeholder}
          className={cn(
            'pr-20 font-mono text-xs leading-relaxed',
            error && 'border-destructive focus-visible:ring-destructive/40',
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={format}
          disabled={disabled || draft.trim() === ''}
          className="absolute right-1 top-1 h-7 px-2 text-xs"
          title={formatLabel}
        >
          <Wand2 className="size-3.5" />
          <span className="hidden sm:inline">{formatLabel}</span>
        </Button>
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-all">
            {invalidLabel}: {error}
          </span>
        </p>
      ) : null}
    </div>
  )
}

export interface JsonViewProps {
  value: unknown
  className?: string
  /** Render a single-line collapsed `<code>` instead of a pretty `<pre>`. */
  inline?: boolean
}

export function JsonView({ value, className, inline }: JsonViewProps): React.ReactElement {
  const text = React.useMemo(() => stringify(value), [value])
  if (inline) {
    const compact = text.replace(/\s+/g, ' ').trim()
    return (
      <code
        className={cn(
          'line-clamp-1 max-w-[24rem] truncate font-mono text-xs text-muted-foreground',
          className,
        )}
        title={text || undefined}
      >
        {compact || '—'}
      </code>
    )
  }
  return (
    <pre
      className={cn(
        'max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground',
        className,
      )}
    >
      <code>{text || '—'}</code>
    </pre>
  )
}
