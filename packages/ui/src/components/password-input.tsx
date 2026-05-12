// Password field with a built-in show/hide toggle. Drops in anywhere a
// regular <Input type="password" /> would — it forwards refs and accepts
// the same props (the `type` prop is intentionally ignored).

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../lib/utils.js'

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible label for the visibility toggle button. */
  toggleLabel?: { show: string; hide: string }
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleLabel, disabled, ...props }, ref) => {
    const [revealed, setRevealed] = React.useState(false)
    const labels = toggleLabel ?? { show: 'Show password', hide: 'Hide password' }
    return (
      <div className="relative">
        <input
          ref={ref}
          type={revealed ? 'text' : 'password'}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-background pl-3 pr-10 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((v) => !v)}
          disabled={disabled}
          aria-label={revealed ? labels.hide : labels.show}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
