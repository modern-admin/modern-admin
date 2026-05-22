import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * When provided, a clear button (×) is rendered on the right side of the
   * input whenever it has a non-empty value. The button is hidden when the
   * input is disabled or the value is empty.
   */
  onClear?: () => void
  /** aria-label for the clear button. Defaults to "Clear". */
  clearLabel?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onClear, clearLabel, ...props }, ref) => {
    const showClear = !!onClear && !!props.value && !props.disabled

    const input = (
      <input
        type={type ?? 'text'}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          // Hide native number-input spinner buttons (Firefox + WebKit/Blink).
          '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none',
          showClear && 'pr-8',
          className,
        )}
        {...props}
      />
    )

    if (!onClear) return input

    return (
      <div className="relative">
        {input}
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={clearLabel ?? 'Clear'}
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground opacity-50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
