import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { buttonVariants } from './button.js'
import { cn } from '../lib/utils.js'
import { LayerContainerProvider, mergeRefs } from '../lib/floating-layer.js'

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger
export const AlertDialogPortal = AlertDialogPrimitive.Portal

export const AlertDialogOverlay = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Overlay>>) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
)

export const AlertDialogContent = ({
  ref,
  className,
  children,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Content>>) => {
  // Nested popovers/selects portal into this node rather than `document.body`
  // so `react-remove-scroll` (which Radix wraps modal content in) lets touch
  // gestures scroll them on mobile. See lib/floating-layer.tsx.
  const [content, setContent] = React.useState<HTMLElement | null>(null)
  const composedRef = React.useMemo(() => mergeRefs(ref, setContent), [ref])
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={composedRef}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
          className,
        )}
        {...props}
      >
        <LayerContainerProvider container={content}>{children}</LayerContainerProvider>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

export const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />
)
AlertDialogHeader.displayName = 'AlertDialogHeader'

export const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
)
AlertDialogFooter.displayName = 'AlertDialogFooter'

export const AlertDialogTitle = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Title>>) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
)

export const AlertDialogDescription = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Description>>) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
)

export const AlertDialogAction = ({
  ref,
  className,
  variant = 'default',
  ...props
}: React.PropsWithoutRef<
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & {
    variant?: 'default' | 'destructive'
  }
> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Action>>) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants({ variant }), className)}
    {...props}
  />
)

export const AlertDialogCancel = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>> &
  React.RefAttributes<React.ElementRef<typeof AlertDialogPrimitive.Cancel>>) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: 'outline' }), className)}
    {...props}
  />
)
