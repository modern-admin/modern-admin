import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../lib/utils.js'
import { usePortalContainer, useViewportCollisionPadding } from '../lib/floating-layer.js'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Override the portal target. Defaults to the enclosing Dialog/Sheet
   *  content (so touch-scroll works inside it) or `document.body`. */
  container?: HTMLElement | null
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, collisionPadding, container, ...props }, ref) => {
  const portalContainer = usePortalContainer()
  const viewportPadding = useViewportCollisionPadding()
  return (
    <PopoverPrimitive.Portal container={container ?? portalContainer}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding ?? viewportPadding}
        className={cn(
          'z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName
