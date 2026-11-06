import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils.js'

export const Accordion = AccordionPrimitive.Root

export const AccordionItem = ({
  ref,
  className,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>> &
  React.RefAttributes<React.ElementRef<typeof AccordionPrimitive.Item>>) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-border', className)}
    {...props}
  />
)

export const AccordionTrigger = ({
  ref,
  className,
  children,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>> &
  React.RefAttributes<React.ElementRef<typeof AccordionPrimitive.Trigger>>) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-md py-3 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
)

export const AccordionContent = ({
  ref,
  className,
  children,
  ...props
}: React.PropsWithoutRef<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>> &
  React.RefAttributes<React.ElementRef<typeof AccordionPrimitive.Content>>) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-3 pt-0 text-sm', className)}>{children}</div>
  </AccordionPrimitive.Content>
)
