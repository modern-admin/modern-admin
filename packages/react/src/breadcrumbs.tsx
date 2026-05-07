// Page breadcrumb helper. Each page builds its own crumb chain (home →
// resource → record → action) and hands it to <PageBreadcrumbs />, which
// renders the shadcn primitives with separators, hash-router-aware Links
// and a Home icon on the root crumb.

import * as React from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@modern-admin/ui'
import { Home } from 'lucide-react'
import { Link } from './router.js'
import type { Route } from './router.js'

export interface BreadcrumbItemSpec {
  label: string
  /** When set, renders a hash-router link; otherwise the crumb is plain text. */
  to?: Route
  /** Optional leading icon. The home crumb gets one by default. */
  icon?: React.ReactNode
}

export interface PageBreadcrumbsProps {
  items: BreadcrumbItemSpec[]
  className?: string
}

export function PageBreadcrumbs({
  items,
  className,
}: PageBreadcrumbsProps): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          const content = (
            <span className="inline-flex items-center gap-1.5">
              {item.icon}
              <span className="truncate max-w-[8rem] sm:max-w-[16rem]">{item.label}</span>
            </span>
          )
          return (
            <React.Fragment key={`${i}-${item.label}`}>
              <BreadcrumbItem>
                {isLast || !item.to ? (
                  <BreadcrumbPage>{content}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.to}>{content}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Default home crumb — used by every page; pass `homeLabel` to localize. */
export function homeCrumb(label: string): BreadcrumbItemSpec {
  return {
    label,
    to: { name: 'home' },
    icon: <Home className="size-3.5" />,
  }
}
