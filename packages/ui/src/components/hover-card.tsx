import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { cn } from '../lib/utils.js'
import { usePortalContainer, useViewportCollisionPadding } from '../lib/floating-layer.js'

/**
 * Rich preview on hover/focus (e.g. a referenced record next to its link).
 * Hover cards are not reachable on touch devices — never put the only copy
 * of information or an action inside one.
 */
export function HoverCard({
  openDelay = 300,
  closeDelay = 150,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>): React.ReactElement {
  return <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />
}

export const HoverCardTrigger = HoverCardPrimitive.Trigger

export interface HoverCardContentProps extends React.ComponentProps<
  typeof HoverCardPrimitive.Content
> {
  /** Override the portal target. Defaults to the enclosing Dialog/Sheet
   *  content or `document.body`. */
  container?: HTMLElement | null
}

export function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  collisionPadding,
  container,
  ...props
}: HoverCardContentProps): React.ReactElement {
  const portalContainer = usePortalContainer()
  const viewportPadding = useViewportCollisionPadding()
  return (
    <HoverCardPrimitive.Portal container={container ?? portalContainer}>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding ?? viewportPadding}
        className={cn(
          'z-50 w-64 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}
