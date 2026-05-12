// shadcn-style Empty — placeholder for empty states.
// Compose: <Empty><EmptyHeader><EmptyMedia/><EmptyTitle/><EmptyDescription/></EmptyHeader><EmptyContent>…</EmptyContent></Empty>

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

export const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border bg-card/40 p-8 text-center',
        className,
      )}
      {...props}
    />
  ),
)
Empty.displayName = 'Empty'

export const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-header"
      className={cn('flex flex-col items-center gap-3 text-center', className)}
      {...props}
    />
  ),
)
EmptyHeader.displayName = 'EmptyHeader'

const emptyMediaVariants = cva(
  'flex shrink-0 items-center justify-center [&>svg]:size-6',
  {
    variants: {
      variant: {
        default: 'text-muted-foreground',
        icon: 'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-6',
      },
    },
    defaultVariants: { variant: 'icon' },
  },
)

export interface EmptyMediaProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyMediaVariants> {}

export const EmptyMedia = React.forwardRef<HTMLDivElement, EmptyMediaProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-media"
      className={cn(emptyMediaVariants({ variant }), className)}
      {...props}
    />
  ),
)
EmptyMedia.displayName = 'EmptyMedia'

export const EmptyTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    data-slot="empty-title"
    className={cn('text-base font-semibold tracking-tight', className)}
    {...props}
  />
))
EmptyTitle.displayName = 'EmptyTitle'

export const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="empty-description"
    className={cn('max-w-sm text-sm text-muted-foreground', className)}
    {...props}
  />
))
EmptyDescription.displayName = 'EmptyDescription'

export const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-content"
      className={cn('flex flex-wrap items-center justify-center gap-2', className)}
      {...props}
    />
  ),
)
EmptyContent.displayName = 'EmptyContent'
