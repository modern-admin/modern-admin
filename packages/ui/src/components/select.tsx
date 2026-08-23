import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { usePortalContainer, useViewportCollisionPadding } from '../lib/floating-layer.js'

/**
 * Thin wrapper around `SelectPrimitive.Root` that suppresses the spurious
 * empty-string callback Radix fires through its hidden bubble-input while
 * `SelectItem` nodes register lazily via Portal after an external `value`
 * change (e.g. `form.reset()` after an async data load). Without this guard
 * the externally-set value is immediately overwritten with `''`.
 *
 * The empty string is never a legitimate choice from a rendered `SelectItem`,
 * so dropping it is always safe. Call sites should NOT add their own
 * `if (v === '') return` guards — this component handles it centrally.
 */
function SelectRoot({
  onValueChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>): React.ReactElement {
  const handleValueChange = React.useCallback(
    (value: string) => {
      if (value !== '') onValueChange?.(value)
    },
    [onValueChange],
  )
  return <SelectPrimitive.Root onValueChange={handleValueChange} {...props} />
}
SelectRoot.displayName = 'Select'

export const Select = SelectRoot
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, onMouseEnter, ...props }, ref) => {
  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>): void => {
    // Set native title only when the value span is actually clipped so the
    // tooltip doesn't appear redundantly on short values.
    const valueSpan = e.currentTarget.querySelector<HTMLElement>('span')
    if (valueSpan && valueSpan.scrollWidth > valueSpan.offsetWidth) {
      e.currentTarget.title = valueSpan.textContent ?? ''
    } else {
      e.currentTarget.removeAttribute('title')
    }
    onMouseEnter?.(e)
  }

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className,
      )}
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  // Radix mounts this button after the viewport leaves the first option.
  // Keep its 24px slot mounted so the list does not grow and jump at that
  // point; the inner button still appears as intended.
  <div className="flex h-6 shrink-0">
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn('flex w-full cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  </div>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

export const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  // Radix unmounts this button after the viewport reaches the last option.
  // Keep its 24px slot mounted so the list does not shrink and jump at that
  // point; the inner button still disappears as intended.
  <div className="flex h-6 shrink-0">
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn('flex w-full cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  </div>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {
  /** Override the portal target. Defaults to the enclosing Dialog/Sheet
   *  content (so touch-scroll works inside it) or `document.body`. */
  container?: HTMLElement | null
}

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = 'popper', collisionPadding, container, ...props }, ref) => {
  const portalContainer = usePortalContainer()
  const viewportPadding = useViewportCollisionPadding()
  return (
    <SelectPrimitive.Portal container={container ?? portalContainer}>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          // `max-h-96` is the design cap; the available-height variable is the
          // hard one — it keeps the list inside the visible viewport on short
          // mobile screens instead of overflowing under the browser chrome.
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'max-h-[min(24rem,var(--radix-select-content-available-height))] data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        collisionPadding={collisionPadding ?? viewportPadding}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    title={typeof children === 'string' ? children : undefined}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>
      <span className="block truncate">{children}</span>
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

/**
 * Plain native `<select>` styled to match the rest of the kit. Useful when
 * you need a no-JS, SSR-friendly fallback or simple form posts. Most call
 * sites should prefer the Radix-based `Select` family above.
 */
export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
NativeSelect.displayName = 'NativeSelect'
