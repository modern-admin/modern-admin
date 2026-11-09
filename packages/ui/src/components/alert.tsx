// Inline callout for errors, warnings and notices. Compose:
//
//   <Alert variant="destructive">
//     <AlertCircle />
//     <AlertTitle>Could not load the record</AlertTitle>
//     <AlertDescription>Check your connection and retry.</AlertDescription>
//   </Alert>
//
// A leading `<svg>` child becomes the icon column; without one the text
// spans the full width.

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 [&>svg]:shrink-0 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive: 'border-destructive/50 bg-destructive/10 text-destructive',
        warning: 'border-warning/40 bg-warning/10 text-warning',
        info: 'border-info/40 bg-info/10 text-info',
        success: 'border-success/40 bg-success/10 text-success',
      },
      size: {
        default: 'px-4 py-3 [&>svg]:mt-0.5 [&>svg]:size-4',
        sm: 'px-3 py-2 text-xs has-[>svg]:gap-x-2 [&>svg]:mt-px [&>svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface AlertProps
  extends React.ComponentProps<'div'>, VariantProps<typeof alertVariants> {}

export function Alert({
  className,
  variant,
  size,
  role,
  ...props
}: AlertProps): React.ReactElement {
  // Errors and warnings interrupt (`alert`); neutral notices are polite.
  const defaultRole = variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'
  return (
    <div
      data-slot="alert"
      role={role ?? defaultRole}
      className={cn(alertVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-semibold leading-snug', className)}
      {...props}
    />
  )
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="alert-description"
      // Body copy stays slightly softer than the title but keeps the tint, so
      // a destructive alert never reads as neutral text.
      className={cn('col-start-2 leading-relaxed [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}

export { alertVariants }
