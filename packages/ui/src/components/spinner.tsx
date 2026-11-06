import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'

const spinnerVariants = cva('shrink-0 animate-spin', {
  variants: {
    size: {
      sm: 'size-3.5',
      default: 'size-4',
      lg: 'size-5',
      xl: 'size-8',
    },
  },
  defaultVariants: { size: 'default' },
})

export interface SpinnerProps
  extends Omit<React.ComponentProps<'svg'>, 'children'>, VariantProps<typeof spinnerVariants> {
  /**
   * Accessible name. When set, the spinner is announced as a `status`
   * region; when omitted it is decorative (`aria-hidden`) — use that when a
   * visible "Loading…" text or a busy button already conveys the state.
   */
  label?: string
}

/**
 * Indeterminate loading indicator. i18n-unaware: pass a translated `label`
 * when the spinner is the only thing telling the user something is loading.
 */
export function Spinner({ className, size, label, ...props }: SpinnerProps): React.ReactElement {
  return (
    <Loader2
      data-slot="spinner"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}

export { spinnerVariants }
