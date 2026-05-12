// Combobox — free-text autocomplete input.
//
// Distinct from `ReferenceCombobox` (in @modern-admin/react) which strictly
// constrains the value to an existing referenced record. This primitive is
// permissive: the user may type any string, and the suggestion list is
// purely advisory. Suggestions can be:
//   • static (declared per field, e.g. enum-like hints), or
//   • dynamic (loaded by the parent — e.g. distinct values pulled from a
//     resource's column). The component itself is i18n-unaware and does
//     no fetching: callers feed `suggestions` and toggle `loading`.
//
// Behaviour:
//   • The input is fully controlled (`value` / `onChange`).
//   • Suggestions filter as you type: case-insensitive substring match
//     against label and value.
//   • Down/Up cycle highlight; Enter commits the highlighted item or
//     keeps the typed value if none is highlighted.
//   • Escape closes the panel; click-outside closes it (handled by Radix
//     Popover). Selecting an item sets the input value and closes.
//
// Mobile-first: the panel matches the input width via the
// `--radix-popover-trigger-width` CSS var.
//
// i18n: optional `labels` prop with English defaults. The React layer is
// expected to translate and feed them in.

import * as React from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Input } from './input.js'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from './popover.js'

/** Each suggestion may be a bare string (used as both value + label) or
 *  an explicit `{ value, label }` pair. */
export type ComboboxSuggestion = string | { value: string; label: string }

export interface ComboboxLabels {
  /** Shown while `loading` is true and the panel is open. Default: 'Loading…'. */
  loading?: string
  /**
   * Shown when the panel is open, the user has typed something, but no
   * suggestion matches. Default: 'No matches — press Enter to keep what
   * you typed.' Use `{value}` to interpolate the current input value.
   */
  noMatches?: string
  /** Visually-hidden trigger label for screen readers. Default: 'Toggle suggestions'. */
  toggleSuggestions?: string
}

export interface ComboboxProps {
  /** Current input value. */
  value: string
  /** Called on every keystroke and on suggestion pick. */
  onChange(next: string): void
  /** Called when the input loses focus (after the picker closes). */
  onBlur?(): void
  /** Static or pre-loaded suggestion list. May change while `loading`. */
  suggestions?: ReadonlyArray<ComboboxSuggestion>
  /** When true and the panel is open, render a small spinner. */
  loading?: boolean
  /** Disables the input and prevents the panel from opening. */
  disabled?: boolean
  placeholder?: string
  /** Forwarded to the `<input>` for accessibility (paired with a `<label>`). */
  id?: string
  'aria-label'?: string
  className?: string
  /**
   * Maximum suggestions to render after filtering. Default: 50. Keeps the
   * panel snappy when callers pass thousands of distinct values.
   */
  maxItems?: number
  labels?: ComboboxLabels
}

const defaultLabels: Required<ComboboxLabels> = {
  loading: 'Loading…',
  noMatches: 'No matches — press Enter to keep "{value}".',
  toggleSuggestions: 'Toggle suggestions',
}

/** Normalise a `ComboboxSuggestion` into `{ value, label }`. */
const normalise = (s: ComboboxSuggestion): { value: string; label: string } =>
  typeof s === 'string' ? { value: s, label: s } : s

/** Case-insensitive substring match on label OR value. */
const matchesQuery = (
  s: { value: string; label: string },
  q: string,
): boolean => {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    s.label.toLowerCase().includes(needle) ||
    s.value.toLowerCase().includes(needle)
  )
}

export function Combobox({
  value,
  onChange,
  onBlur,
  suggestions,
  loading,
  disabled,
  placeholder,
  id,
  'aria-label': ariaLabel,
  className,
  maxItems = 50,
  labels,
}: ComboboxProps): React.ReactElement {
  const l = { ...defaultLabels, ...labels }
  const [focused, setFocused] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)

  const items = React.useMemo(() => {
    const all = (suggestions ?? []).map(normalise)
    return all.filter((s) => matchesQuery(s, value)).slice(0, maxItems)
  }, [suggestions, value, maxItems])

  // Reset highlight whenever the filtered set changes — otherwise the
  // index can point past the end after typing a more specific query.
  React.useEffect(() => {
    setHighlight(0)
  }, [items.length])

  // Open whenever the input is focused AND there's something to show
  // (either matching items or a loading spinner). Empty + non-loading =
  // no panel, so the component degrades to a plain input.
  const open =
    !disabled && focused && (items.length > 0 || Boolean(loading))

  const commit = (s: { value: string; label: string }): void => {
    onChange(s.value)
    setFocused(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      const picked = items[highlight]
      if (picked) {
        e.preventDefault()
        commit(picked)
      }
    } else if (e.key === 'Escape') {
      setFocused(false)
    }
  }

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <Input
            id={id}
            type="text"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-expanded={open}
            autoComplete="off"
            className="pr-8"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // Defer so a click on a suggestion (which fires after blur)
              // can still commit before we close the panel.
              setTimeout(() => {
                setFocused(false)
                onBlur?.()
              }, 120)
            }}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* Trailing affordance: spinner while loading, otherwise a chevron
              hint that suggestions exist. Pure decoration — focusing the
              input is what opens the panel. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDown className="size-4 opacity-50" />
            )}
          </span>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Prevent Radix from stealing focus from the input when the panel
        // opens — otherwise typing would move focus to the popover root.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Allow clicks inside the panel without closing the popover before
        // the click handler on the option fires.
        onInteractOutside={(e) => {
          // The blur handler closes the panel; nothing more to do here.
          // Preventing the default keeps Radix from re-toggling internal state.
          e.preventDefault()
        }}
        className="w-[var(--radix-popover-trigger-width)] p-1"
      >
        {loading && items.length === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {l.loading}
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {l.noMatches.replace('{value}', value)}
          </div>
        ) : (
          <ul role="listbox" className="max-h-60 overflow-y-auto">
            {items.map((s, i) => {
              const active = i === highlight
              return (
                <li
                  key={s.value}
                  role="option"
                  aria-selected={active}
                  // Use mousedown (fires before input blur) so the click
                  // commits the value before the panel closes.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commit(s)
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground',
                  )}
                >
                  <span className="truncate">{s.label}</span>
                  {s.label !== s.value ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.value}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
