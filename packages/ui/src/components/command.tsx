import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Dialog, DialogContent } from './dialog.js'

export const Command = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive>>) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
)

export interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  /** Visually-hidden label on the dialog's close button. Default: 'Close'. */
  labels?: { close?: string }
  /** @deprecated Use `labels.close`. */
  closeLabel?: string
}

export const CommandDialog = ({
  children,
  closeLabel,
  labels,
  ...props
}: CommandDialogProps): React.ReactElement => (
  <Dialog {...props}>
    <DialogContent
      className="overflow-hidden p-0 shadow-lg"
      labels={{ close: labels?.close ?? closeLabel }}
    >
      <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
        {children}
      </Command>
    </DialogContent>
  </Dialog>
)

export const CommandInput = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Input>>) => (
  <div className="flex shrink-0 items-center border-b border-border px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
)

export const CommandList = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.List>>) => (
  <CommandPrimitive.List
    ref={ref}
    // `min-h-0` so the list — not the search input above it — is what gives
    // way when the popover is height-capped to the visible viewport.
    className={cn(
      'max-h-[300px] min-h-0 overscroll-contain overflow-y-auto overflow-x-hidden',
      className,
    )}
    {...props}
  />
)

export const CommandEmpty = ({
  ref,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Empty>>) => (
  <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm" {...props} />
)

export const CommandGroup = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Group>>) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className,
    )}
    {...props}
  />
)

export const CommandSeparator = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Separator>>) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border/40', className)}
    {...props}
  />
)

export const CommandItem = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Item>>) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      className,
    )}
    {...props}
  />
)

export const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement => (
  <span
    className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
    {...props}
  />
)
CommandShortcut.displayName = 'CommandShortcut'
