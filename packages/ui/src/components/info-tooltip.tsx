import * as React from 'react'
import { Info } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.js'

export interface InfoTooltipProps {
  content: React.ReactNode
  ariaLabel?: string
  className?: string
  iconClassName?: string
  side?: React.ComponentProps<typeof TooltipContent>['side']
}

export function InfoTooltip({
  content,
  ariaLabel,
  className,
  iconClassName,
  side = 'top',
}: InfoTooltipProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
        >
          <Info className={cn('size-3.5', iconClassName)} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-80 whitespace-pre-wrap text-left leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
