import * as React from 'react'
import { cn } from '../lib/utils.js'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-slate-900 text-white',
  secondary: 'bg-slate-100 text-slate-700',
  destructive: 'bg-red-100 text-red-700',
  outline: 'border border-slate-300 text-slate-700',
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'secondary', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
)
Badge.displayName = 'Badge'
