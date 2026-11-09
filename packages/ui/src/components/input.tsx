import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  inputBoxClassName,
  invalidControlClassName,
} from './input-group.js'

// Hide native number-input spinners (Firefox + WebKit/Blink) and WebKit's
// search cancel control — the kit renders its own clear button.
const nativeChromeClassName =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-search-cancel-button]:appearance-none'

export const inputClassName = cn(
  inputBoxClassName,
  'flex h-9 w-full min-w-0 px-3 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
  invalidControlClassName,
)

export interface InputProps extends React.ComponentProps<'input'> {
  /**
   * When provided, a clear button (×) is rendered on the right side of the
   * input whenever it has a non-empty value. The button is hidden when the
   * input is disabled or the value is empty.
   *
   * A clearable input renders as an `InputGroup`: `className` then styles
   * the visible box (width, height, …) and every other prop — `ref`, `id`,
   * `aria-*` — still lands on the `<input>`.
   */
  onClear?: () => void
  labels?: { clear?: string }
  /** @deprecated Use `labels.clear`. */
  /** aria-label for the clear button. Defaults to "Clear". */
  clearLabel?: string
}

export function Input({
  className,
  type,
  onClear,
  clearLabel,
  labels,
  ...props
}: InputProps): React.ReactElement {
  if (!onClear) {
    return (
      <input
        data-slot="input"
        type={type ?? 'text'}
        className={cn(inputClassName, nativeChromeClassName, className)}
        {...props}
      />
    )
  }

  const showClear = props.value != null && props.value !== '' && !props.disabled && !props.readOnly
  return (
    <InputGroup className={className}>
      <InputGroupInput type={type ?? 'text'} className={nativeChromeClassName} {...props} />
      {showClear && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            // Escape / select-all + delete stay the keyboard path; the button
            // is a pointer convenience and must not add a tab stop.
            tabIndex={-1}
            size="icon-xs"
            className="size-6"
            aria-label={labels?.clear ?? clearLabel ?? 'Clear'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
