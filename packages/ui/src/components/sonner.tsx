import * as React from 'react'
import { Toaster as SonnerToaster, toast } from 'sonner'
import { cn } from '../lib/utils.js'

export type ToasterProps = React.ComponentProps<typeof SonnerToaster>

const useDocumentTheme = (): 'light' | 'dark' => {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  )
  React.useEffect(() => {
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(el.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export const Toaster = ({ className, ...props }: ToasterProps): React.ReactElement => {
  const theme = useDocumentTheme()
  return (
    // Modal layers disable pointer events on the body. Toasts must remain
    // interactive, and their gestures/focus must not dismiss the layer below.
    <div
      className="contents"
      onPointerDown={(event) => event.stopPropagation()}
      onFocus={(event) => event.stopPropagation()}
    >
      <SonnerToaster
        theme={theme}
        className={cn('toaster group pointer-events-auto', className)}
        swipeDirections={['left', 'right', 'top', 'bottom']}
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-muted-foreground',
            actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
            cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          },
        }}
        {...props}
      />
    </div>
  )
}

export { toast }
