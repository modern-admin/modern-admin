// Popover-driven date / datetime input. Single picker handles both modes:
// pass `mode="datetime"` to surface an HH:MM time input below the calendar.
//
// Value is an ISO-ish string (`yyyy-MM-dd` for dates, `yyyy-MM-ddTHH:mm` for
// datetime — same shape <input type="date">/<input type="datetime-local">
// produce, so callers can stay format-stable). The trigger is a real text
// input so users can also type the date manually; clicks on the trailing
// calendar icon open the popover with the inline picker.

import * as React from 'react'
import { format, isValid, parse, parseISO } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import { Calendar } from './calendar.js'
import { Input } from './input.js'
import { Popover, PopoverContent, PopoverTrigger } from './popover.js'

export type DatePickerMode = 'date' | 'datetime'

export interface DatePickerProps {
  value: string | null | undefined
  onChange(next: string): void
  mode?: DatePickerMode
  disabled?: boolean
  placeholder?: string
  /** Applied to the outer wrapper div (controls width, etc.). */
  className?: string
  /** Applied to the inner text Input — use to override height / font size. */
  inputClassName?: string
  /** ARIA label forwarded to the trigger input (mobile users / screen readers). */
  ariaLabel?: string
  /** ARIA label for the calendar icon button. Default: "Open calendar". */
  openCalendarLabel?: string
  /** Label for the time input shown in datetime mode. Default: "Time". */
  timeLabel?: string
}

const DATE_FMT = 'yyyy-MM-dd'
const DATETIME_FMT = "yyyy-MM-dd'T'HH:mm"
// Friendlier display format for the datetime input — space instead of `T`.
const DATETIME_DISPLAY_FMT = 'yyyy-MM-dd HH:mm'

function parseValue(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const direct = value.length <= 10 ? parse(value, DATE_FMT, new Date()) : parseISO(value)
  return Number.isNaN(direct.getTime()) ? undefined : direct
}

/**
 * Try to parse a manually-typed string in any of the supported shapes.
 * Returns `undefined` on blank, `null` on invalid (non-blank) input so the
 * caller can distinguish "cleared" from "typo".
 */
function parseTyped(raw: string, mode: DatePickerMode): Date | undefined | null {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const candidates =
    mode === 'datetime'
      ? [DATETIME_FMT, DATETIME_DISPLAY_FMT, "yyyy-MM-dd'T'HH:mm:ss", DATE_FMT]
      : [DATE_FMT]
  for (const fmt of candidates) {
    const parsed = parse(trimmed, fmt, new Date())
    if (isValid(parsed)) return parsed
  }
  // Last resort: ISO with timezone, etc.
  const iso = parseISO(trimmed)
  return isValid(iso) ? iso : null
}

function formatForInput(date: Date | undefined, mode: DatePickerMode): string {
  if (!date) return ''
  return format(date, mode === 'datetime' ? DATETIME_DISPLAY_FMT : DATE_FMT)
}

function formatForApi(date: Date, mode: DatePickerMode): string {
  return format(date, mode === 'datetime' ? DATETIME_FMT : DATE_FMT)
}

export function DatePicker({
  value,
  onChange,
  mode = 'date',
  disabled,
  placeholder,
  className,
  inputClassName,
  ariaLabel,
  openCalendarLabel = 'Open calendar',
  timeLabel = 'Time',
}: DatePickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const date = parseValue(value)
  // Local draft for the text input — keeps user typing intact even when
  // intermediate strings don't yet parse.
  const [draft, setDraft] = React.useState(() => formatForInput(date, mode))
  // Re-sync draft whenever the canonical value changes from outside (e.g.
  // calendar selection or form reset). Compare via formatted shape so a noop
  // update doesn't clobber what the user is typing.
  const lastFormatted = React.useRef(formatForInput(date, mode))
  React.useEffect(() => {
    const next = formatForInput(date, mode)
    if (next !== lastFormatted.current) {
      lastFormatted.current = next
      setDraft(next)
    }
  }, [value, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const time = date ? format(date, 'HH:mm') : '00:00'

  const commitDate = (next: Date | undefined): void => {
    if (!next) {
      lastFormatted.current = ''
      setDraft('')
      onChange('')
      return
    }
    if (mode === 'datetime') {
      const [h, m] = time.split(':').map(Number)
      next.setHours(h ?? 0, m ?? 0, 0, 0)
    }
    const formatted = formatForInput(next, mode)
    lastFormatted.current = formatted
    setDraft(formatted)
    onChange(formatForApi(next, mode))
  }

  const setTime = (raw: string): void => {
    if (!date) return
    const [h, m] = raw.split(':').map(Number)
    const next = new Date(date)
    next.setHours(h ?? 0, m ?? 0, 0, 0)
    const formatted = formatForInput(next, mode)
    lastFormatted.current = formatted
    setDraft(formatted)
    onChange(formatForApi(next, mode))
  }

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const text = e.target.value
    setDraft(text)
    const parsed = parseTyped(text, mode)
    if (parsed === undefined) {
      // cleared
      lastFormatted.current = ''
      onChange('')
    } else if (parsed) {
      lastFormatted.current = formatForInput(parsed, mode)
      onChange(formatForApi(parsed, mode))
    }
    // parsed === null → keep draft, don't fire onChange yet
  }

  const handleInputBlur: React.FocusEventHandler<HTMLInputElement> = () => {
    // On blur, if the draft is invalid, snap back to the canonical value.
    const parsed = parseTyped(draft, mode)
    if (parsed === null) {
      const restored = formatForInput(date, mode)
      lastFormatted.current = restored
      setDraft(restored)
    }
  }

  const inputPlaceholder =
    placeholder ?? (mode === 'datetime' ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative w-full', className)}>
        <Input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={inputPlaceholder}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(inputClassName, 'pr-10')}
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={openCalendarLabel}
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="size-4" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(d) => {
            commitDate(d)
            if (mode === 'date') setOpen(false)
          }}
          autoFocus
        />
        {mode === 'datetime' && (
          <div className="flex items-center gap-2 border-t p-3">
            <span className="text-xs text-muted-foreground">{timeLabel}</span>
            <Input
              type="time"
              value={time}
              disabled={!date}
              onChange={(e) => setTime(e.target.value)}
              className="h-8 w-32"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
DatePicker.displayName = 'DatePicker'
