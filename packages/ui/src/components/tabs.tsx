import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils.js'

export const Tabs = TabsPrimitive.Root

// Underline-style tab strip — works visually even with a single tab because
// the active item has a clearly drawn bottom indicator that anchors it to the
// content below.
export const TabsList = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>> &
  React.RefAttributes<React.ElementRef<typeof TabsPrimitive.List>>) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-start gap-1 overflow-x-auto border-b border-border text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export const TabsTrigger = ({
  ref,
  className,
  onPointerDown,
  onKeyDown,
  onBlur,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>> &
  React.RefAttributes<React.ElementRef<typeof TabsPrimitive.Trigger>>) => {
  // Radix focuses triggers programmatically on mouse down, which can retain
  // :focus-visible after pointer input. Keep the ring for keyboard input only.
  const [pointerFocus, setPointerFocus] = React.useState(false)

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative -mb-px inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm font-medium ring-offset-background transition-all',
        'hover:text-foreground',
        'outline-none',
        !pointerFocus && 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (!event.defaultPrevented) setPointerFocus(true)
      }}
      onKeyDown={(event) => {
        setPointerFocus(false)
        onKeyDown?.(event)
      }}
      onBlur={(event) => {
        setPointerFocus(false)
        onBlur?.(event)
      }}
    />
  )
}

export const TabsContent = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>> &
  React.RefAttributes<React.ElementRef<typeof TabsPrimitive.Content>>) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
)
