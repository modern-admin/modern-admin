import * as React from 'react'
import { cn } from '../lib/utils.js'
import { inputBoxClassName, invalidControlClassName } from './input-group.js'

export type TextareaProps = React.ComponentProps<'textarea'>

export function Textarea({ className, ...props }: TextareaProps): React.ReactElement {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        inputBoxClassName,
        'flex min-h-[80px] w-full px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        invalidControlClassName,
        className,
      )}
      {...props}
    />
  )
}
