// Shared layout primitives for the Settings hub. Every section in
// `settings-page.tsx` (API keys, webhooks, AI assistant, ...) should use
// these so the look, spacing, and mobile behavior stays uniform.

import * as React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  cn,
} from '@modern-admin/ui'

type IconComponent = React.ComponentType<{ className?: string }>

interface SettingsCardProps {
  icon: IconComponent
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  /** Removes default padding/header so the card body can fill edge-to-edge. */
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * Unified card wrapper for a settings section. Header collapses
 * vertically on mobile and lays the action button to the right on `sm+`.
 * `CardContent` gets `min-w-0` so tables/grids inside can shrink and
 * scroll horizontally instead of forcing the parent grid wider.
 */
export function SettingsCard({
  icon: Icon,
  title,
  description,
  action,
  bodyClassName,
  children,
}: SettingsCardProps): React.ReactElement {
  return (
    <Card>
      <CardHeader
        className={cn(
          'flex-col items-start gap-2',
          action && 'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-5" />
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('min-w-0', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

/**
 * Horizontal-scroll wrapper for tables inside `SettingsCard`. On mobile
 * the content extends to the card edges (`-mx-6`) so the user sees the
 * left edge of the table flush with the card; from `sm+` the negative
 * margin is removed.
 */
export function SettingsTableScroll({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="-mx-6 overflow-x-auto sm:mx-0">{children}</div>
}

interface SettingsEmptyProps {
  icon: IconComponent
  title: React.ReactNode
  description?: React.ReactNode
}

export function SettingsEmpty({ icon: Icon, title, description }: SettingsEmptyProps): React.ReactElement {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia>
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  )
}

interface SettingsListStateProps {
  isLoading: boolean
  error: unknown
  isEmpty: boolean
  loadingLabel: React.ReactNode
  empty: SettingsEmptyProps
  children: React.ReactNode
}

/**
 * Renders one of: loading row, destructive error banner, empty state, or
 * the actual list `children`. Keeps every section's "list with status"
 * surface identical.
 */
export function SettingsListState({
  isLoading,
  error,
  isEmpty,
  loadingLabel,
  empty,
  children,
}: SettingsListStateProps): React.ReactElement {
  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{loadingLabel}</div>
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }
  if (isEmpty) {
    return <SettingsEmpty {...empty} />
  }
  return <>{children}</>
}
