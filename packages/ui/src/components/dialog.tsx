import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { LayerContainerProvider, mergeRefs } from '../lib/floating-layer.js'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>> &
  React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Overlay>>) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
)

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /**
   * Visually-hidden label for the built-in close button. Default: 'Close'.
   * Follows the same convention as `SidebarTrigger.toggleSidebarLabel` — this
   * package is i18n-unaware, so translated strings arrive as props.
   */
  labels?: { close?: string }
  /** @deprecated Use `labels.close`. */
  closeLabel?: string
  /** Suppress the built-in close button (e.g. when the footer has its own). */
  hideCloseButton?: boolean
}

export const DialogContent = ({
  ref,
  className,
  children,
  closeLabel = 'Close',
  labels,
  hideCloseButton,
  ...props
}: React.PropsWithoutRef<DialogContentProps> &
  React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Content>>) => {
  // Nested popovers/selects portal into this node rather than `document.body`
  // so `react-remove-scroll` (which Radix wraps modal content in) lets touch
  // gestures scroll them on mobile. See lib/floating-layer.tsx.
  const [content, setContent] = React.useState<HTMLElement | null>(null)
  const composedRef = React.useMemo(() => mergeRefs(ref, setContent), [ref])
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={composedRef}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
          className,
        )}
        {...props}
      >
        <LayerContainerProvider container={content}>{children}</LayerContainerProvider>
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 z-10 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">{labels?.close ?? closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

export const DialogTitle = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>> &
  React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Title>>) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
)

export const DialogDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>> &
  React.RefAttributes<React.ElementRef<typeof DialogPrimitive.Description>>) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
)
