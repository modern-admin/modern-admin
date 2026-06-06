// Global, i18n-aware toast notifications.
//
// `useNotify()` returns a typed surface that translates message keys before
// handing them to sonner. Mount `<NotifyToaster />` once at the app root —
// it wraps the shadcn-flavoured `<Toaster />` with sensible defaults.
// Helpers also accept raw strings (already-translated) for cases where the
// caller has the literal text on hand (server error messages, etc.).

import * as React from 'react'
import { Toaster, toast, type ToasterProps } from '@modern-admin/ui'
import { useI18n } from './i18n.js'

export interface NotifyMessage {
  /** i18n key, e.g. 'toast:saved' */
  key?: string
  /** Already-translated literal text (used as-is when present). */
  message?: string
  /** Interpolation params for the `key` lookup. */
  params?: Record<string, unknown>
  /** Optional secondary line. */
  description?: string
}

type Input = string | NotifyMessage

interface NotifyApi {
  success(input: Input, opts?: { description?: string }): void
  error(input: Input, opts?: { description?: string }): void
  info(input: Input, opts?: { description?: string }): void
  warning(input: Input, opts?: { description?: string }): void
  /** Show loading -> success/error around a promise. Strings are i18n keys. */
  promise<T>(
    p: Promise<T>,
    messages: { loading: Input; success: Input | ((value: T) => Input); error: Input | ((err: unknown) => Input) },
  ): Promise<T>
  /** Escape hatch for callers that want raw sonner access. */
  raw: typeof toast
}

/** The global toaster. Mount once near the root of the admin shell. */
export function NotifyToaster(props: ToasterProps): React.ReactElement {
  return <Toaster richColors closeButton position="top-right" {...props} />
}

/** Hook returning a translation-aware notification surface. */
export function useNotify(): NotifyApi {
  const { t } = useI18n()

  const resolve = React.useCallback(
    (input: Input): { title: string; description?: string } => {
      if (typeof input === 'string') return { title: input }
      const title = input.key ? t(input.key, input.params) : (input.message ?? '')
      return input.description ? { title, description: input.description } : { title }
    },
    [t],
  )

  return React.useMemo<NotifyApi>(
    () => ({
      success: (input, opts) => {
        const r = resolve(input)
        toast.success(r.title, { description: opts?.description ?? r.description })
      },
      error: (input, opts) => {
        const r = resolve(input)
        toast.error(r.title, { description: opts?.description ?? r.description })
      },
      info: (input, opts) => {
        const r = resolve(input)
        toast.info(r.title, { description: opts?.description ?? r.description })
      },
      warning: (input, opts) => {
        const r = resolve(input)
        toast.warning(r.title, { description: opts?.description ?? r.description })
      },
      promise: (p, messages) => {
        toast.promise(p, {
          loading: resolve(messages.loading).title,
          success: (value) => {
            const m = typeof messages.success === 'function' ? messages.success(value) : messages.success
            return resolve(m).title
          },
          error: (err) => {
            const m = typeof messages.error === 'function' ? messages.error(err) : messages.error
            return resolve(m).title
          },
        })
        return p
      },
      raw: toast,
    }),
    [resolve],
  )
}
