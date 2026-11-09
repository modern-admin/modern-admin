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
// Behaviour (WAI-ARIA "combobox with list autocomplete"):
//   • The input is fully controlled (`value` / `onChange`) and carries
//     `role="combobox"`; the highlighted option is exposed through
//     `aria-activedescendant`, so screen readers announce it while DOM focus
//     stays in the input.
//   • Suggestions filter as you type: case-insensitive substring match
//     against label and value.
//   • Down/Up cycle highlight (scrolling it into view); Enter commits the
//     highlighted item or keeps the typed value if none is highlighted.
//   • Escape closes the panel; click-outside closes it (handled by Radix
//     Popover). Selecting an item sets the input value and closes.
//
// Mobile-first: the panel matches the input width via the
// `--radix-popover-trigger-width` CSS var.
//
// i18n: optional `labels` prop with English defaults. The React layer is
// expected to translate and feed them in.

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { mergeRefs } from '../lib/floating-layer.js'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group.js'
import { Popover, PopoverAnchor, PopoverContent } from './popover.js'
import { Spinner } from './spinner.js'

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
  /** Marks the input `aria-invalid` and draws the error border. */
  invalid?: boolean
  /** Marks the input `aria-required`. */
  required?: boolean
  placeholder?: string
  /** Forwarded to the `<input>` for accessibility (paired with a `<label>`). */
  id?: string
  name?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  /** Ref to the `<input>` — lets form libraries focus the field on error. */
  ref?: React.Ref<HTMLInputElement>
  /** Styles the visible box (width, height, …). */
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
const matchesQuery = (s: { value: string; label: string }, q: string): boolean => {
  if (!q) return true
  const needle = q.toLowerCase()
  return s.label.toLowerCase().includes(needle) || s.value.toLowerCase().includes(needle)
}

export function Combobox({
  value,
  onChange,
  onBlur,
  suggestions,
  loading,
  disabled,
  invalid,
  required,
  placeholder,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ref,
  className,
  maxItems = 50,
  labels,
}: ComboboxProps): React.ReactElement {
  const l = { ...defaultLabels, ...labels }
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const listboxId = React.useId()
  const optionId = (i: number): string => `${listboxId}-option-${i}`
  const [focused, setFocused] = React.useState(false)
  // Set only by the toggle button collapsing an open panel. Kept separate
  // from `focused` because the button preserves DOM focus on the input: if
  // collapsing wrote `focused = false`, no later focus event would fire to
  // undo it and the panel could never reopen.
  const [collapsed, setCollapsed] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    },
    [],
  )

  const setInputRef = React.useMemo(() => mergeRefs(inputRef, ref), [ref])

  const items = React.useMemo(() => {
    if (maxItems <= 0) return []
    // Duplicates would share a React key and an option id; keep the first.
    const seen = new Set<string>()
    const unique: Array<{ value: string; label: string }> = []
    for (const s of (suggestions ?? []).map(normalise)) {
      if (seen.has(s.value) || !matchesQuery(s, value)) continue
      seen.add(s.value)
      unique.push(s)
      if (unique.length >= maxItems) break
    }
    return unique
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
    !disabled && focused && !collapsed && (items.length > 0 || Boolean(loading) || value.length > 0)
  const activeId = open && !loading && items[highlight] ? optionId(highlight) : undefined

  // Keep the highlighted option visible while arrowing through a long list.
  React.useEffect(() => {
    if (!activeId) return
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  const commit = (s: { value: string; label: string }): void => {
    onChange(s.value)
    setCollapsed(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open) {
      // ArrowDown is the standard "show me the list" gesture for a combobox,
      // and it has to work after the panel was collapsed — the input still
      // holds DOM focus at that point, so no focus event will clear
      // `collapsed` on its own.
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCollapsed(false)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Home' && e.altKey) {
      e.preventDefault()
      setHighlight(0)
    } else if (e.key === 'End' && e.altKey) {
      e.preventDefault()
      setHighlight(Math.max(items.length - 1, 0))
    } else if (e.key === 'Enter') {
      const picked = loading ? undefined : items[highlight]
      if (picked) {
        e.preventDefault()
        commit(picked)
      }
    } else if (e.key === 'Escape') {
      // Same reasoning as the toggle button: the input keeps DOM focus, so
      // collapse the panel rather than lying about focus state.
      e.preventDefault()
      setCollapsed(true)
    }
  }

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <InputGroup className={className}>
          <InputGroupInput
            ref={setInputRef}
            id={id}
            name={name}
            type="text"
            role="combobox"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={activeId}
            aria-busy={loading || undefined}
            autoComplete="off"
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current)
              setFocused(true)
              setCollapsed(false)
            }}
            // Same reason as ArrowDown above: clicking an input that is
            // already focused fires no focus event, so without this a
            // collapsed panel could only be reopened by typing.
            onClick={() => setCollapsed(false)}
            onBlur={() => {
              // Defer so a click on a suggestion (which fires after blur)
              // can still commit before we close the panel.
              blurTimer.current = setTimeout(() => {
                setFocused(false)
                onBlur?.()
              }, 120)
            }}
            onChange={(e) => {
              // Typing is an unambiguous request to see suggestions again.
              setCollapsed(false)
              onChange(e.target.value)
            }}
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="inline-end">
            {loading ? (
              <Spinner className="mr-1.5 text-muted-foreground" />
            ) : (
              <InputGroupButton
                // Out of the tab order: the input is the widget's focusable
                // element, and Tab must not stop twice on one field.
                tabIndex={-1}
                disabled={disabled}
                aria-label={l.toggleSuggestions}
                aria-expanded={open}
                aria-controls={open ? listboxId : undefined}
                // Keep focus on the input — losing it would fire the deferred
                // blur handler and close the panel we just opened.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (open) {
                    setCollapsed(true)
                    return
                  }
                  setCollapsed(false)
                  inputRef.current?.focus()
                  setFocused(true)
                }}
              >
                <ChevronDown className="opacity-50" aria-hidden="true" />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent
        role="presentation"
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
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col p-1"
      >
        {loading && items.length === 0 ? (
          <div role="status" className="px-2 py-2 text-sm text-muted-foreground">
            {l.loading}
          </div>
        ) : items.length === 0 ? (
          <div role="status" className="px-2 py-2 text-sm text-muted-foreground">
            {l.noMatches.replace('{value}', value)}
          </div>
        ) : null}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
          className="max-h-60 min-h-0 overflow-y-auto overscroll-contain"
        >
          {items.map((s, i) => {
            const active = i === highlight
            return (
              <li
                key={s.value}
                id={optionId(i)}
                role="option"
                aria-selected={active && !loading}
                // Use mousedown (fires before input blur) so the click
                // commits the value before the panel closes.
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(s)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex cursor-pointer items-baseline rounded-sm px-2 py-1.5 text-sm',
                  active ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                <span className="truncate">{s.label}</span>
                {s.label !== s.value ? (
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{s.value}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
