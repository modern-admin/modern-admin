import * as React from 'react'
import { cn } from '../lib/utils.js'

export const Table = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableElement>> &
  React.RefAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
)

export const TableHeader = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableSectionElement>> &
  React.RefAttributes<HTMLTableSectionElement>) => (
  <thead
    ref={ref}
    className={cn('[&_tr]:border-b [&_tr]:border-border bg-muted/40', className)}
    {...props}
  />
)

export const TableBody = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableSectionElement>> &
  React.RefAttributes<HTMLTableSectionElement>) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
)

export const TableFooter = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableSectionElement>> &
  React.RefAttributes<HTMLTableSectionElement>) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-border bg-muted/40 font-medium [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
)

export const TableRow = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableRowElement>> &
  React.RefAttributes<HTMLTableRowElement>) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      className,
    )}
    {...props}
  />
)

export const TableHead = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ThHTMLAttributes<HTMLTableCellElement>> &
  React.RefAttributes<HTMLTableCellElement>) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground border-r border-border last:border-r-0',
      className,
    )}
    {...props}
  />
)

export const TableCell = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.TdHTMLAttributes<HTMLTableCellElement>> &
  React.RefAttributes<HTMLTableCellElement>) => (
  <td
    ref={ref}
    className={cn('px-3 py-2 align-middle border-r border-border last:border-r-0', className)}
    {...props}
  />
)

export const TableCaption = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.HTMLAttributes<HTMLTableCaptionElement>> &
  React.RefAttributes<HTMLTableCaptionElement>) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
)
