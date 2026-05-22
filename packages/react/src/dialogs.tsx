// Imperative modal dialogs.
//
// `<DialogsProvider>` owns a small stack of active dialogs and renders them
// through shadcn's purpose-built primitives: `<AlertDialog>` for confirm/alert
// (focus trap + Esc-to-cancel + accessible role), and `<Dialog>` for arbitrary
// content opened via `open()`. `useDialogs()` exposes a promise-flavoured API
// (`confirm`, `alert`, `open`) so callers can `await` user choices instead of
// weaving open/close state through their components. All built-in dialogs go
// through `useI18n()` for labels — captions stay localized without callers
// writing translations on the call site.
//
// Custom dialogs use `open({ render })`, where `render` receives a `close`
// callback. The promise resolves with whatever value the caller passes to
// `close`, defaulting to `undefined` when the user dismisses the dialog
// (Esc / overlay click).

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
} from '@modern-admin/ui'
import { useI18n } from './i18n.js'

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive (red). Useful for delete dialogs. */
  destructive?: boolean
}

export interface AlertOptions {
  title?: string
  description?: string
  okLabel?: string
}

export interface OpenOptions<T> {
  render: (api: { close: (value?: T) => void }) => React.ReactNode
  /** Optional max-width override; defaults to `sm:max-w-lg`. */
  className?: string
  /** Disable closing on overlay click + Esc. */
  modal?: boolean
}

export interface DialogsApi {
  confirm(opts?: ConfirmOptions): Promise<boolean>
  alert(opts?: AlertOptions): Promise<void>
  open<T = unknown>(opts: OpenOptions<T>): Promise<T | undefined>
}

type EntryKind = 'confirm' | 'alert' | 'custom'

interface BaseEntry {
  id: number
  open: boolean
  resolve(value: unknown): void
}

interface ConfirmEntry extends BaseEntry {
  kind: 'confirm'
  opts: ConfirmOptions
}

interface AlertEntry extends BaseEntry {
  kind: 'alert'
  opts: AlertOptions
}

interface CustomEntry extends BaseEntry {
  kind: 'custom'
  className?: string
  modal?: boolean
  render(api: { close: (value?: unknown) => void }): React.ReactNode
}

type DialogEntry = ConfirmEntry | AlertEntry | CustomEntry

const DialogsContext = React.createContext<DialogsApi | null>(null)

let nextId = 1

export interface DialogsProviderProps {
  children: React.ReactNode
}

export function DialogsProvider({ children }: DialogsProviderProps): React.ReactElement {
  const [entries, setEntries] = React.useState<DialogEntry[]>([])
  const { t } = useI18n()

  const removeEntry = React.useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const closeEntry = React.useCallback(
    (id: number, value: unknown) => {
      setEntries((prev) => {
        const target = prev.find((e) => e.id === id)
        if (target) target.resolve(value)
        // Mark closed so Radix can play the leave animation, then remove.
        return prev.map((e) => (e.id === id ? { ...e, open: false } : e))
      })
      // Cleanup after the close animation ~200ms.
      window.setTimeout(() => removeEntry(id), 250)
    },
    [removeEntry],
  )

  const api = React.useMemo<DialogsApi>(() => {
    const push = <T,>(
      build: (id: number, resolve: (value: T | undefined) => void) => DialogEntry,
    ): Promise<T | undefined> =>
      new Promise<T | undefined>((resolve) => {
        const id = nextId++
        const entry = build(id, resolve)
        setEntries((prev) => [...prev, entry])
      })

    return {
      confirm: (opts = {}) =>
        push<boolean>((id, resolve) => ({
          kind: 'confirm',
          id,
          open: true,
          opts,
          resolve: (value) => resolve(value as boolean | undefined),
        })).then((v) => v === true),
      alert: (opts = {}) =>
        push<void>((id, resolve) => ({
          kind: 'alert',
          id,
          open: true,
          opts,
          resolve: () => resolve(undefined),
        })).then(() => undefined),
      open: <T,>(opts: OpenOptions<T>) =>
        push<T>((id, resolve) => ({
          kind: 'custom',
          id,
          open: true,
          className: opts.className,
          modal: opts.modal,
          render: ({ close }) => opts.render({ close: (value?: T) => close(value as unknown) }),
          resolve: (value) => resolve(value as T | undefined),
        })),
    }
  }, [])

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {entries.map((entry) => {
        if (entry.kind === 'confirm') {
          const title = entry.opts.title ?? t('common:confirmDelete')
          const confirmLabel =
            entry.opts.confirmLabel ?? t(entry.opts.destructive ? 'common:delete' : 'common:save')
          const cancelLabel = entry.opts.cancelLabel ?? t('common:cancel')
          return (
            <AlertDialog
              key={entry.id}
              open={entry.open}
              onOpenChange={(next) => {
                if (!next) closeEntry(entry.id, false)
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{title}</AlertDialogTitle>
                  {entry.opts.description && (
                    <AlertDialogDescription>{entry.opts.description}</AlertDialogDescription>
                  )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => closeEntry(entry.id, false)}>
                    {cancelLabel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant={entry.opts.destructive ? 'destructive' : 'default'}
                    onClick={() => closeEntry(entry.id, true)}
                  >
                    {confirmLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
        if (entry.kind === 'alert') {
          return (
            <AlertDialog
              key={entry.id}
              open={entry.open}
              onOpenChange={(next) => {
                if (!next) closeEntry(entry.id, undefined)
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{entry.opts.title ?? ''}</AlertDialogTitle>
                  {entry.opts.description && (
                    <AlertDialogDescription>{entry.opts.description}</AlertDialogDescription>
                  )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => closeEntry(entry.id, undefined)}>
                    {entry.opts.okLabel ?? t('common:ok')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
        // custom
        return (
          <Dialog
            key={entry.id}
            open={entry.open}
            onOpenChange={(next) => {
              if (!next) closeEntry(entry.id, undefined)
            }}
          >
            <DialogContent
              className={entry.className}
              onInteractOutside={(e) => {
                if (entry.modal) e.preventDefault()
              }}
              onEscapeKeyDown={(e) => {
                if (entry.modal) e.preventDefault()
              }}
            >
              {entry.render({ close: (value) => closeEntry(entry.id, value) })}
            </DialogContent>
          </Dialog>
        )
      })}
    </DialogsContext.Provider>
  )
}

/** Imperative dialog API. Falls back to a no-op when no provider is mounted. */
export function useDialogs(): DialogsApi {
  const ctx = React.useContext(DialogsContext)
  if (ctx) return ctx
  // No provider — fall back to native confirm/alert so basic flows still work
  // when a host app forgets to mount <DialogsProvider>.
  return {
    confirm: async (opts) =>
      typeof window === 'undefined'
        ? false
        : window.confirm([opts?.title, opts?.description].filter(Boolean).join('\n\n') || ''),
    alert: async (opts) => {
      if (typeof window !== 'undefined') {
        window.alert([opts?.title, opts?.description].filter(Boolean).join('\n\n') || '')
      }
    },
    open: async () => undefined,
  }
}
