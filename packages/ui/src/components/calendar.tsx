// shadcn-style calendar built on react-day-picker 9. Tokens come from the
// project's semantic palette so light/dark themes work without overrides.
//
// Use directly for inline calendars, or wrap with `<DatePicker>` for the
// popover-based input pattern.

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DayPicker,
  type DayPickerProps,
  type DropdownOption,
} from 'react-day-picker'
import 'react-day-picker/style.css'
import { cn } from '../lib/utils.js'
import { buttonVariants } from './button.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select.js'

/**
 * Replacement for react-day-picker's native <select> dropdown. Uses the
 * shadcn Select (Radix) so month/year pickers match the rest of the UI and
 * pop above the popover instead of being clipped by it.
 */
function CalendarDropdown(
  props: {
    options?: DropdownOption[]
    value?: string | number | readonly string[]
    onChange?: React.ChangeEventHandler<HTMLSelectElement>
    disabled?: boolean
    'aria-label'?: string
    className?: string
  },
): React.ReactElement {
  const { options = [], value, onChange, disabled, className } = props
  const ariaLabel = props['aria-label']
  const handleChange = (next: string): void => {
    // react-day-picker's handlers read `e.target.value`, so synthesize the
    // minimal shape they require.
    onChange?.({
      target: { value: next },
    } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }
  return (
    <Select
      value={value != null ? String(value) : undefined}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          // Borderless ghost-style trigger: compact pill that highlights on
          // hover, with a subtle chevron — matches the "Month ⌄  Year ⌄"
          // reference design.
          'h-7 w-auto gap-1 rounded-md border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:bg-accent hover:text-accent-foreground focus:ring-1 [&>svg]:size-3.5 [&>svg]:opacity-60',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[var(--radix-select-content-available-height)]">
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={String(opt.value)}
            disabled={opt.disabled}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type CalendarProps = DayPickerProps

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_START_MONTH = new Date(CURRENT_YEAR - 100, 0, 1)
const DEFAULT_END_MONTH = new Date(CURRENT_YEAR + 10, 11, 31)

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'dropdown',
  startMonth = DEFAULT_START_MONTH,
  endMonth = DEFAULT_END_MONTH,
  ...props
}: CalendarProps): React.ReactElement {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // Lock the grid to 6 weeks so navigating months never shifts the popover
      // height (and thus never visually "jumps").
      fixedWeeks
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4 sm:flex-row sm:gap-6',
        month: 'flex flex-col gap-3',
        // Caption hosts the dropdowns centered; horizontal padding reserves
        // room for the absolutely-positioned nav buttons so wide dropdowns
        // never overlap (and steal clicks from) the next-month chevron.
        month_caption: 'flex justify-center pt-1 relative items-center h-9 px-9',
        caption_label:
          'inline-flex items-center gap-1 text-sm font-medium [&>svg]:size-3.5 [&>svg]:opacity-60',
        // Custom CalendarDropdown component renders shadcn Selects directly,
        // so the rdp wrapper just needs a flex layout for the two pickers.
        dropdowns: 'flex items-center gap-1',
        dropdown_root: 'relative inline-flex',
        dropdown: '',
        months_dropdown: '',
        years_dropdown: '',
        // Nav row floats over the caption. The wrapper itself ignores
        // pointer events so the gap between the buttons doesn't block clicks
        // on the dropdowns underneath; only the buttons themselves are
        // interactive (`pointer-events-auto`).
        nav: 'absolute inset-x-1 top-1 flex items-center justify-between pointer-events-none z-10',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'pointer-events-auto size-7 p-0 opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'pointer-events-auto size-7 p-0 opacity-70 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        // Single rounded button per cell — no cell-level background hacks so
        // hover/focus stays inside the rounded shape (no black corners).
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-9 rounded-md p-0 font-normal aria-selected:opacity-100',
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        // Apply selected state to the inner button so its rounded shape wins
        // over hover/focus rectangles.
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside:
          'day-outside text-muted-foreground aria-selected:text-muted-foreground',
        disabled: 'text-muted-foreground opacity-50',
        range_middle:
          '[&>button]:bg-accent [&>button]:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
          // pointer-events-none so clicks on the SVG bubble to the parent
          // button (otherwise they're swallowed and nav doesn't fire).
          return <Icon className={cn('size-4 pointer-events-none', cls)} />
        },
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'
