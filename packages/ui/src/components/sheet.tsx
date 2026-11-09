// shadcn-style Sheet — side-anchored Dialog. Built on @radix-ui/react-dialog,
// shares the same primitive as <Dialog>. Variants: top / bottom / left / right.

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { LayerContainerProvider, mergeRefs } from '../lib/floating-layer.js'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close
export const SheetPortal = SheetPrimitive.Portal

export const SheetOverlay = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>> &
  React.RefAttributes<React.ElementRef<typeof SheetPrimitive.Overlay>>) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
)

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 max-h-[100dvh] overflow-y-auto border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 overflow-y-auto border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 overflow-y-auto border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: { side: 'right' },
  },
)

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Set to true to suppress the built-in absolute close button (e.g. when
   *  the consumer renders its own close control inside the header). */
  hideCloseButton?: boolean
  /**
   * Visually-hidden label for the built-in close button. Default: 'Close'.
   * Follows the same convention as `SidebarTrigger.toggleSidebarLabel` — this
   * package is i18n-unaware, so translated strings arrive as props.
   */
  labels?: { close?: string }
  /** @deprecated Use `labels.close`. */
  closeLabel?: string
}

export const SheetContent = ({
  ref,
  side = 'right',
  className,
  children,
  hideCloseButton,
  closeLabel = 'Close',
  labels,
  ...props
}: React.PropsWithoutRef<SheetContentProps> &
  React.RefAttributes<React.ElementRef<typeof SheetPrimitive.Content>>) => {
  // Nested popovers/selects portal into this node rather than `document.body`
  // so `react-remove-scroll` (which Radix wraps modal content in) lets touch
  // gestures scroll them on mobile. See lib/floating-layer.tsx.
  const [content, setContent] = React.useState<HTMLElement | null>(null)
  const composedRef = React.useMemo(() => mergeRefs(ref, setContent), [ref])
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={composedRef}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <LayerContainerProvider container={content}>{children}</LayerContainerProvider>
        {!hideCloseButton && (
          <SheetPrimitive.Close className="absolute right-4 top-4 z-10 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="size-4" />
            <span className="sr-only">{labels?.close ?? closeLabel}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

export const SheetTitle = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>> &
  React.RefAttributes<React.ElementRef<typeof SheetPrimitive.Title>>) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
)

export const SheetDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>> &
  React.RefAttributes<React.ElementRef<typeof SheetPrimitive.Description>>) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
)
