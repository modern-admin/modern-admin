import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '../lib/utils.js'

export interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  /** Classes for the filled bar (e.g. a status color). */
  indicatorClassName?: string
}

/** Determinate progress bar; pass `value={null}` for an indeterminate state. */
export function Progress({
  className,
  indicatorClassName,
  value,
  max = 100,
  ...props
}: ProgressProps): React.ReactElement {
  const effectiveMax = Number.isFinite(max) && max > 0 ? max : 100
  const effectiveValue =
    value == null || !Number.isFinite(value) ? null : Math.min(effectiveMax, Math.max(0, value))
  const percent = effectiveValue == null ? null : (effectiveValue / effectiveMax) * 100
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={effectiveValue}
      max={effectiveMax}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-150 ease-out',
          percent == null && 'w-1/3 animate-pulse',
          indicatorClassName,
        )}
        style={percent == null ? undefined : { width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  )
}
