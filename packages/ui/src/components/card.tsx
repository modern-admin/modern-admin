import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../lib/utils.js'

export function Card({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-3 sm:p-6', className)}
      {...props}
    />
  )
}

export interface CardTitleProps extends React.ComponentProps<'h3'> {
  /**
   * Render the title styles onto the single child — use it to pick the
   * heading level that fits the page outline (`<CardTitle asChild><h2>…`).
   * Defaults to an `<h3>`.
   */
  asChild?: boolean
}

export function CardTitle({ className, asChild, ...props }: CardTitleProps): React.ReactElement {
  const Comp = asChild ? Slot : 'h3'
  return (
    <Comp
      data-slot="card-title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.ReactElement {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

// `[&:not(:first-child)]:pt-0` collapses the top padding only when this content
// follows a sibling (typically a `CardHeader`), so a standalone `<Card><CardContent/>`
// keeps full top padding instead of inheriting the header-aware `pt-0`.
export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="card-content"
      className={cn('p-3 sm:p-6 [&:not(:first-child)]:pt-0', className)}
      {...props}
    />
  )
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 p-3 pt-0 sm:p-6 sm:pt-0', className)}
      {...props}
    />
  )
}
