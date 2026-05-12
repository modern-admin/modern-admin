import * as React from 'react'
import { cn } from '../lib/utils.js'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type ?? 'text'}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        // Hide native number-input spinner buttons (Firefox + WebKit/Blink).
        // The framework provides a single canonical text-style number input;
        // callers who explicitly need spinners can opt back in by overriding
        // these utilities via `className`.
        '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

