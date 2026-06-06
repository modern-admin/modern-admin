import * as React from 'react'
import { cn } from '../lib/utils.js'

/**
 * Single keyboard key glyph. Renders a `<kbd>` styled like a typical
 * key cap. Compose multiple `<Kbd>` siblings to spell out a chord:
 * `<Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>`. The cap uses `bg-muted` /
 * `text-foreground/80` so it reads well on any neutral surface
 * (cards, popovers, tooltips).
 */
export const Kbd = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/80 shadow-[0_1px_0_0_var(--border)]',
      className,
    )}
    {...props}
  />
))
Kbd.displayName = 'Kbd'

/**
 * Resolve the platform-appropriate label for the primary modifier
 * key. Renders `⌘` on macOS / iOS, `Ctrl` everywhere else.
 */
export function getModKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  const platform = navigator.platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac/i.test(ua) ? '⌘' : 'Ctrl'
}
