import * as React from 'react'
import { cn } from '../lib/utils.js'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  // `data-slot` follows the convention the rest of the primitives use and
  // gives callers (and tests) a way to tell placeholder content apart from
  // real content — visually they are indistinguishable by design.
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
