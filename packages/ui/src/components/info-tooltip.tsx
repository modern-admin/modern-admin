import * as React from 'react'
import { Info } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.js'
import { Popover, PopoverContent, PopoverTrigger } from './popover.js'

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
  // Hover/focus uses the tooltip; a tap or click pins the same hint open
  // as a popover, including inside modal surfaces.
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const label = ariaLabel ?? (typeof content === 'string' ? content : undefined)
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip open={tooltipOpen && !popoverOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className={cn(
                'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className,
              )}
            >
              <Info className={cn('size-3.5', iconClassName)} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-80 whitespace-pre-wrap text-left leading-relaxed"
        >
          {content}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side={side}
        aria-label={label}
        className="w-auto max-w-80 whitespace-pre-wrap px-3 py-1.5 text-left text-xs leading-relaxed"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
