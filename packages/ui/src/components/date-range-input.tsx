// Popover-driven date-range picker.
// A single trigger button shows the selected range (or placeholder);
// clicking opens a popover with a two-month Calendar in range mode.
// On narrow screens the calendar collapses to a single month.
//
// UX notes:
// - The picker NEVER auto-closes on date selection — the user confirms
//   explicitly via the "Apply" button. This prevents the "first click
//   closes the picker" bug that occurs when a partial pending range
//   (from without to) is in state and the next click completes it.
// - "Clear" inside the popover empties the range and closes.
// - The X inline in the trigger clears directly without opening the picker.
// - On open: only a COMPLETE committed range (both ends) is mirrored into
//   the calendar state so the user can edit from a known baseline.
//   A committed partial range (from only) resets to blank to avoid
//   accidentally completing it on the first click.
// - Escape / click-outside discards in-progress selection and reverts to
//   the last committed range.
//
// i18n-unaware by design: all visible strings are passed via `labels`.

import * as React from 'react'
import { format, isValid, parse, parseISO } from 'date-fns'
import { CalendarRange, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import { Calendar } from './calendar.js'
import { Popover, PopoverContent, PopoverTrigger } from './popover.js'

const DATE_FMT = 'yyyy-MM-dd'
const DISPLAY_FMT = 'MMM d, yyyy'

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const d = value.length <= 10 ? parse(value, DATE_FMT, new Date()) : parseISO(value)
  return isValid(d) ? d : undefined
}

export interface DateRangeInputLabels {
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string
  /** "Apply" button inside the popover footer. */
  apply?: string
  /** "Clear" button inside the popover footer + aria-label for the inline X. */
  clear?: string
}

export interface DateRangeInputProps {
  from: string | null | undefined
  to: string | null | undefined
  onChange(from: string, to: string): void
  disabled?: boolean
  className?: string
  labels?: DateRangeInputLabels
}

export function DateRangeInput({
  from,
  to,
  onChange,
  disabled,
  className,
  labels = {},
}: DateRangeInputProps): React.ReactElement {
  const placeholder = labels.placeholder ?? 'Select date range'
  const applyLabel = labels.apply ?? 'Apply'
  const clearLabel = labels.clear ?? 'Clear'

  const [open, setOpen] = React.useState(false)

  // Calendar selection in progress. Committed to onChange only via Apply.
  const [pending, setPending] = React.useState<DateRange | undefined>(() => {
    const f = parseDate(from)
    const t = parseDate(to)
    // Only restore a complete range on init — partial ranges start fresh.
    return f && t ? { from: f, to: t } : undefined
  })

  // Keep pending in sync when props change externally (e.g. programmatic reset).
  React.useEffect(() => {
    const f = parseDate(from)
    const t = parseDate(to)
    setPending(f ?? t ? { from: f, to: t } : undefined)
  }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  // Number of calendar months — 1 on narrow, 2 on wide viewports.
  const [months, setMonths] = React.useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 640 ? 2 : 1,
  )
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const handle = (e: MediaQueryListEvent): void => setMonths(e.matches ? 2 : 1)
    setMonths(mq.matches ? 2 : 1)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      // On open: only restore a COMPLETE committed range so the user sees
      // their previous selection as a starting point. A partial range
      // (from without to) is intentionally dropped — carrying it over
      // would cause the very next calendar click to "complete" the range
      // and trigger an immediate commit + close.
      const f = parseDate(from)
      const t = parseDate(to)
      setPending(f && t ? { from: f, to: t } : undefined)
    } else {
      // Closed without Apply (Escape / outside click) — discard in-progress
      // selection and revert to the last committed values.
      const f = parseDate(from)
      const t = parseDate(to)
      setPending(f ?? t ? { from: f, to: t } : undefined)
    }
    setOpen(next)
  }

  // Update the in-progress selection; never auto-commit.
  const handleSelect = (range: DateRange | undefined): void => {
    setPending(range)
  }

  // Commit whatever is pending (at minimum a start date) and close.
  const handleApply = (): void => {
    if (pending?.from) {
      onChange(
        format(pending.from, DATE_FMT),
        pending.to ? format(pending.to, DATE_FMT) : '',
      )
    }
    setOpen(false)
  }

  // Clear inside the popover: empty the committed range and close.
  const handleClearPopover = (): void => {
    setPending(undefined)
    onChange('', '')
    setOpen(false)
  }

  // Inline X on the trigger: clear committed range without opening the picker.
  const handleClearInline = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setPending(undefined)
    onChange('', '')
  }

  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  const hasValue = !!(from || to)

  const displayText = hasValue
    ? [
        fromDate ? format(fromDate, DISPLAY_FMT) : '…',
        toDate ? format(toDate, DISPLAY_FMT) : '…',
      ].join(' – ')
    : null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-start gap-2 px-3 font-normal',
            !hasValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarRange className="size-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate text-left text-sm">
            {displayText ?? placeholder}
          </span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label={clearLabel}
              onClick={handleClearInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleClearInline(e as unknown as React.MouseEvent)
                }
              }}
              className="ml-1 rounded-sm p-0.5 opacity-50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={pending}
          onSelect={handleSelect}
          numberOfMonths={months}
          autoFocus
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button variant="ghost" size="sm" onClick={handleClearPopover}>
            {clearLabel}
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!pending?.from}>
            {applyLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

DateRangeInput.displayName = 'DateRangeInput'
