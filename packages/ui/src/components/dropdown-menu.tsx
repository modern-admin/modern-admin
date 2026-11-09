import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { usePortalContainer, useViewportCollisionPadding } from '../lib/floating-layer.js'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

/** Same as the Radix portal, but defaults its target to the enclosing
 *  Dialog/Sheet content — see lib/floating-layer.tsx for why that matters on
 *  touch devices. Used by call sites that portal submenus themselves. */
export const DropdownMenuPortal = ({
  container,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Portal>): React.ReactElement => {
  const portalContainer = usePortalContainer()
  return <DropdownMenuPrimitive.Portal container={container ?? portalContainer} {...props} />
}
DropdownMenuPortal.displayName = 'DropdownMenuPortal'

export const DropdownMenuSubTrigger = ({
  ref,
  className,
  inset,
  children,
  ...props
}: React.PropsWithoutRef<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>>) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
)

export const DropdownMenuSubContent = ({
  ref,
  className,
  collisionPadding,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.SubContent>>) => {
  const viewportPadding = useViewportCollisionPadding()
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      collisionPadding={collisionPadding ?? viewportPadding}
      className={cn(
        'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  )
}

export interface DropdownMenuContentProps extends React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
> {
  /** Override the portal target. Defaults to the enclosing Dialog/Sheet
   *  content (so touch-scroll works inside it) or `document.body`. */
  container?: HTMLElement | null
}

export const DropdownMenuContent = ({
  ref,
  className,
  sideOffset = 4,
  collisionPadding,
  container,
  ...props
}: React.PropsWithoutRef<DropdownMenuContentProps> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.Content>>) => {
  const portalContainer = usePortalContainer()
  const viewportPadding = useViewportCollisionPadding()
  return (
    <DropdownMenuPrimitive.Portal container={container ?? portalContainer}>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding ?? viewportPadding}
        className={cn(
          'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export const DropdownMenuItem = ({
  ref,
  className,
  inset,
  ...props
}: React.PropsWithoutRef<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.Item>>) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
)

export const DropdownMenuCheckboxItem = ({
  ref,
  className,
  children,
  checked,
  ...props
}: React.PropsWithoutRef<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>>) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
)

export const DropdownMenuRadioItem = ({
  ref,
  className,
  children,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>>) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
)

export const DropdownMenuLabel = ({
  ref,
  className,
  inset,
  ...props
}: React.PropsWithoutRef<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.Label>>) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    {...props}
  />
)

export const DropdownMenuSeparator = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>> &
  React.RefAttributes<React.ElementRef<typeof DropdownMenuPrimitive.Separator>>) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
)

export const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement => (
  <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'
