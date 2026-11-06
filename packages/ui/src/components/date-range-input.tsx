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
import {
  addMonths,
  format,
  isSameMonth,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  type Locale,
} from 'date-fns'
import { CalendarRange, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import { Calendar } from './calendar.js'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover.js'

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
  /** Marks the trigger `aria-invalid` and draws the error border. */
  invalid?: boolean
  /** Styles the visible box (width, grid placement, …). */
  className?: string
  labels?: DateRangeInputLabels
  /** `id` of the trigger button, so a `<label for=…>` can point at it. */
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  /** Ref to the trigger button — lets form libraries focus the field. */
  ref?: React.Ref<HTMLButtonElement>
  /**
   * date-fns locale for the calendars — month names, weekday headers, and
   * react-day-picker's own ARIA labels. Without it they render in `en-US`
   * regardless of the surrounding UI language.
   */
  locale?: Locale
}

export function DateRangeInput({
  from,
  to,
  onChange,
  disabled,
  invalid,
  className,
  labels = {},
  locale,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ref,
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
    setPending((f ?? t) ? { from: f, to: t } : undefined)
  }, [from, to])

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

  // Independent navigation for the two-panel layout. Each panel keeps its
  // own visible month; the dropdowns on the right are constrained to
  // months >= left (and the left to months <= right) so the panels can
  // never cross over. State is (re)initialised from the committed range
  // every time the popover opens (see `handleOpenChange`).
  const [leftMonth, setLeftMonth] = React.useState<Date>(() => {
    const f = parseDate(from)
    return startOfMonth(f ?? new Date())
  })
  const [rightMonth, setRightMonth] = React.useState<Date>(() => {
    const f = parseDate(from)
    const t = parseDate(to)
    const left = startOfMonth(f ?? new Date())
    return t && !isSameMonth(left, t) ? startOfMonth(t) : addMonths(left, 1)
  })

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
      // Re-derive panel navigation from the committed range so reopening
      // always lands the user on the months they were last looking at —
      // independently for the left and right panels.
      const left = startOfMonth(f ?? new Date())
      const right = t && !isSameMonth(left, t) ? startOfMonth(t) : addMonths(left, 1)
      setLeftMonth(left)
      setRightMonth(right)
    } else {
      // Closed without Apply (Escape / outside click) — discard in-progress
      // selection and revert to the last committed values.
      const f = parseDate(from)
      const t = parseDate(to)
      setPending((f ?? t) ? { from: f, to: t } : undefined)
    }
    setOpen(next)
  }

  // Navigation guards. The right panel can never cross above the left's
  // month, and the left can never cross above the right's. If a user
  // navigates the LEFT forward past the right (via the prev/next arrow
  // when the dropdown bounds don't disable it), push the right one month
  // ahead; symmetric for the right going below the left.
  const handleLeftMonthChange = (next: Date): void => {
    setLeftMonth(next)
    if (!isSameMonth(next, rightMonth) && next > rightMonth) {
      setRightMonth(addMonths(next, 1))
    }
  }
  const handleRightMonthChange = (next: Date): void => {
    setRightMonth(next)
    if (!isSameMonth(next, leftMonth) && next < leftMonth) {
      setLeftMonth(addMonths(next, -1))
    }
  }

  // Update the in-progress selection; never auto-commit.
  const handleSelect = (range: DateRange | undefined): void => {
    setPending(range)
  }

  // Commit whatever is pending (at minimum a start date) and close.
  const handleApply = (): void => {
    if (pending?.from) {
      onChange(format(pending.from, DATE_FMT), pending.to ? format(pending.to, DATE_FMT) : '')
    }
    setOpen(false)
  }

  // Clear inside the popover: empty the committed range and close.
  const handleClearPopover = (): void => {
    setPending(undefined)
    onChange('', '')
    setOpen(false)
  }

  // Inline X next to the trigger: clear committed range without opening the
  // picker. It is a sibling of the trigger, not a child — a button inside a
  // button is invalid markup and unreachable for assistive tech.
  const handleClearInline = (): void => {
    setPending(undefined)
    onChange('', '')
  }

  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  const hasValue = !!(from || to)

  const displayText = hasValue
    ? [
        fromDate ? format(fromDate, DISPLAY_FMT, { locale }) : '…',
        toDate ? format(toDate, DISPLAY_FMT, { locale }) : '…',
      ].join(' – ')
    : null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div data-slot="date-range-input" className={cn('relative flex h-9 w-full', className)}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={invalid || undefined}
              className={cn(
                'h-full w-full justify-start gap-2 px-3 font-normal',
                hasValue && 'pr-9',
                !hasValue && 'text-muted-foreground',
              )}
            >
              <CalendarRange className="opacity-60" />
              <span className="flex-1 truncate text-left text-sm">
                {displayText ?? placeholder}
              </span>
            </Button>
          </PopoverTrigger>
          {hasValue && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={clearLabel}
              onClick={handleClearInline}
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
            >
              <X />
            </Button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0" align="start" aria-label={ariaLabel ?? placeholder}>
        {months === 2 ? (
          // Two-panel layout: each Calendar is a fully independent single-
          // month instance with its own controlled `month` state. The left
          // panel's dropdowns can't reach past the right panel's month
          // (and vice versa) thanks to the shared start/end-month bounds.
          // Range selection still spans both panels because they share
          // the same `selected` + `onSelect`.
          <div className="flex flex-col sm:flex-row">
            <Calendar
              mode="range"
              locale={locale}
              selected={pending}
              onSelect={handleSelect}
              numberOfMonths={1}
              month={leftMonth}
              onMonthChange={handleLeftMonthChange}
              endMonth={rightMonth}
              autoFocus
            />
            <Calendar
              mode="range"
              locale={locale}
              selected={pending}
              onSelect={handleSelect}
              numberOfMonths={1}
              month={rightMonth}
              onMonthChange={handleRightMonthChange}
              startMonth={leftMonth}
            />
          </div>
        ) : (
          <Calendar
            mode="range"
            locale={locale}
            selected={pending}
            onSelect={handleSelect}
            numberOfMonths={1}
            // react-day-picker doesn't auto-navigate to the selected range on
            // mount — it stays on today's month. The popover re-mounts the
            // Calendar each time it opens, so deriving `defaultMonth` from
            // the (already-restored) pending range puts the user back where
            // they left off without controlling navigation explicitly.
            defaultMonth={pending?.from ?? pending?.to ?? undefined}
            autoFocus
          />
        )}
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
