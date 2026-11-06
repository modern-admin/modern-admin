import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '../lib/utils.js'

export const Breadcrumb = ({
  ref,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<'nav'>> &
  React.RefAttributes<HTMLElement>) => <nav ref={ref} aria-label="breadcrumb" {...props} />

export const BreadcrumbList = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<'ol'>> &
  React.RefAttributes<HTMLOListElement>) => (
  <ol
    ref={ref}
    className={cn(
      'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
      className,
    )}
    {...props}
  />
)

export const BreadcrumbItem = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<'li'>> &
  React.RefAttributes<HTMLLIElement>) => (
  <li ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props} />
)

export const BreadcrumbLink = ({
  ref,
  asChild,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<'a'> & { asChild?: boolean }> &
  React.RefAttributes<HTMLAnchorElement>) => {
  const Comp = asChild ? Slot : 'a'
  return (
    <Comp
      ref={ref}
      className={cn('transition-colors hover:text-foreground', className)}
      {...props}
    />
  )
}

export const BreadcrumbPage = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<'span'>> &
  React.RefAttributes<HTMLSpanElement>) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn('font-normal text-foreground', className)}
    {...props}
  />
)

export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'li'>): React.ReactElement => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn('[&>svg]:size-3.5', className)}
    {...props}
  >
    {children ?? <ChevronRight />}
  </li>
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'

export const BreadcrumbEllipsis = ({
  className,
  label = 'More',
  ...props
}: React.ComponentPropsWithoutRef<'span'> & {
  /** Visually-hidden text for the collapsed segment. Default: 'More'. */
  label?: string
}): React.ReactElement => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn('flex size-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontal className="size-4" />
    <span className="sr-only">{label}</span>
  </span>
)
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis'
