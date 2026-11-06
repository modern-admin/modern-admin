// shadcn-style Empty — placeholder for empty states.
// Compose: <Empty><EmptyHeader><EmptyMedia/><EmptyTitle/><EmptyDescription/></EmptyHeader><EmptyContent>…</EmptyContent></Empty>

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

export const Empty = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="empty"
    className={cn(
      'flex w-full flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border bg-card/40 p-8 text-center',
      className,
    )}
    {...props}
  />
)

export const EmptyHeader = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="empty-header"
    className={cn('flex flex-col items-center gap-3 text-center', className)}
    {...props}
  />
)

const emptyMediaVariants = cva('flex shrink-0 items-center justify-center [&>svg]:size-6', {
  variants: {
    variant: {
      default: 'text-muted-foreground',
      icon: 'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-6',
    },
  },
  defaultVariants: { variant: 'icon' },
})

export interface EmptyMediaProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof emptyMediaVariants> {}

export const EmptyMedia = ({
  ref,
  className,
  variant,
  ...props
}: React.PropsWithoutRef<EmptyMediaProps> & React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="empty-media"
    className={cn(emptyMediaVariants({ variant }), className)}
    {...props}
  />
)

export const EmptyTitle = ({
  ref,
  className,
  asChild,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLHeadingElement> & { asChild?: boolean }> &
  React.RefAttributes<HTMLHeadingElement>) => {
  const Comp = asChild ? Slot : 'h3'
  return (
    <Comp
      ref={ref}
      data-slot="empty-title"
      className={cn('text-base font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

export const EmptyDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLParagraphElement>> &
  React.RefAttributes<HTMLParagraphElement>) => (
  <p
    ref={ref}
    data-slot="empty-description"
    className={cn('max-w-sm text-sm text-muted-foreground', className)}
    {...props}
  />
)

export const EmptyContent = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLDivElement>> &
  React.RefAttributes<HTMLDivElement>) => (
  <div
    ref={ref}
    data-slot="empty-content"
    className={cn('flex flex-wrap items-center justify-center gap-2', className)}
    {...props}
  />
)
