// Page navigation: first / previous / a sliding window of page numbers /
// next / last. Zero-based and fully controlled — the caller owns the page
// state (URL, TanStack Table, …) and reacts to `onPageChange`.
//
// i18n-unaware: pass translated aria labels through `labels`.

import * as React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'

/**
 * Sliding window of up to `windowSize` zero-based page indices, centred on
 * `pageIndex` and clamped to `[0, pageCount)`.
 */
export function getPageWindow(pageIndex: number, pageCount: number, windowSize = 10): number[] {
  if (pageCount <= 0 || windowSize <= 0) return []
  const half = Math.floor(windowSize / 2)
  let start = pageIndex - half
  let end = start + windowSize
  if (start < 0) {
    start = 0
    end = windowSize
  }
  if (end > pageCount) {
    end = pageCount
    start = Math.max(0, end - windowSize)
  }
  return Array.from({ length: end - start }, (_, i) => start + i)
}

export interface PaginationLabels {
  /** `aria-label` of the `<nav>` landmark. Default: 'Pagination'. */
  navigation?: string
  first?: string
  previous?: string
  next?: string
  last?: string
}

export interface PaginationProps extends Omit<React.ComponentProps<'nav'>, 'onChange'> {
  /** Current page, zero-based. */
  pageIndex: number
  /** Total number of pages. `0` renders the edge buttons disabled and no numbers. */
  pageCount: number
  onPageChange(pageIndex: number): void
  /** How many page numbers to show at once. Default: 10. */
  windowSize?: number
  /** Render the first/last jump buttons. Default: true. */
  showEdges?: boolean
  size?: 'xs' | 'sm' | 'default'
  disabled?: boolean
  labels?: PaginationLabels
}

const defaultLabels: Required<PaginationLabels> = {
  navigation: 'Pagination',
  first: 'First page',
  previous: 'Previous page',
  next: 'Next page',
  last: 'Last page',
}

export function Pagination({
  pageIndex,
  pageCount,
  onPageChange,
  windowSize = 10,
  showEdges = true,
  size = 'sm',
  disabled = false,
  labels,
  className,
  ...props
}: PaginationProps): React.ReactElement {
  const l = { ...defaultLabels, ...labels }
  const pages = getPageWindow(pageIndex, pageCount, windowSize)
  const canPrevious = !disabled && pageCount > 0 && pageIndex > 0
  const canNext = !disabled && pageCount > 0 && pageIndex < pageCount - 1
  const iconSize = size === 'default' ? 'icon' : size === 'xs' ? 'icon-xs' : 'icon-sm'
  return (
    <nav
      data-slot="pagination"
      aria-label={l.navigation}
      className={cn('flex items-center gap-1', className)}
      {...props}
    >
      {showEdges && (
        <Button
          type="button"
          variant="outline"
          size={iconSize}
          onClick={() => onPageChange(0)}
          disabled={!canPrevious}
          aria-label={l.first}
        >
          <ChevronsLeft />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size={iconSize}
        onClick={() => onPageChange(pageIndex - 1)}
        disabled={!canPrevious}
        aria-label={l.previous}
      >
        <ChevronLeft />
      </Button>
      {pages.map((p) => {
        const current = p === pageIndex
        return (
          <Button
            key={p}
            type="button"
            variant={current ? 'default' : 'outline'}
            size={size}
            className="min-w-8 px-2 tabular-nums"
            onClick={() => onPageChange(p)}
            disabled={disabled}
            aria-current={current ? 'page' : undefined}
          >
            {p + 1}
          </Button>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size={iconSize}
        onClick={() => onPageChange(pageIndex + 1)}
        disabled={!canNext}
        aria-label={l.next}
      >
        <ChevronRight />
      </Button>
      {showEdges && (
        <Button
          type="button"
          variant="outline"
          size={iconSize}
          onClick={() => onPageChange(pageCount - 1)}
          disabled={!canNext}
          aria-label={l.last}
        >
          <ChevronsRight />
        </Button>
      )}
    </nav>
  )
}
