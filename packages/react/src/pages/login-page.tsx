// Two-pane sign-in screen: branded panel on the left, form on the right.
// Collapses into a single column on mobile (left pane hides — the form
// reuses the brand mark inline). Posts to Better Auth's email handler via
// AdminClient.login, then invalidates the `me` query so the gate flips
// to the authenticated app shell.

import * as React from 'react'
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PasswordInput,
} from '@modern-admin/ui'
import { Database, LogIn } from 'lucide-react'
import { useLogin } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { AdminApiError } from '../client.js'

export interface LoginPageProps {
  /** Optional title override (defaults to common:appName). */
  title?: React.ReactNode
  /** Optional helper line under the form — e.g. demo credentials. */
  hint?: React.ReactNode
  /** Optional tagline shown on the brand panel. */
  tagline?: React.ReactNode
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }): React.ReactElement {
  const tile = size === 'sm' ? 'size-8 rounded-lg' : 'size-9 rounded-xl'
  const icon = size === 'sm' ? 'size-4' : 'size-5'
  return (
    <span
      className={`flex ${tile} items-center justify-center bg-primary/10 ring-1 ring-primary/20`}
    >
      <Database className={`${icon} text-primary`} aria-hidden="true" />
    </span>
  )
}

export function LoginPage({ title, hint, tagline }: LoginPageProps): React.ReactElement {
  const { t } = useI18n()
  const login = useLogin()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (login.isPending) return
    login.mutate({ email, password })
  }

  const errMessage = (() => {
    const err = login.error
    if (!err) return null
    if (err instanceof AdminApiError && err.status === 401) {
      return t('auth:loginFailed')
    }
    // Better Auth surfaces structured errors as JSON; surface the message
    // field when present, otherwise fall back to the raw payload.
    if (err instanceof AdminApiError) {
      try {
        const body = JSON.parse(err.message) as { message?: string }
        if (body.message) return body.message
      } catch {
        /* non-JSON body — fall through */
      }
    }
    return err.message || t('errors:server')
  })()

  const heading = title ?? t('common:appName')
  const subtitle = t('auth:subtitle')
  const taglineText = tagline ?? t('auth:tagline')

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
      {/* Brand panel — desktop only. Mirrors the sidebar's visual rhythm. */}
      <aside className="relative hidden flex-col justify-between border-r border-border bg-muted/30 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">
            {t('common:appName')}
          </span>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{taglineText}</p>
      </aside>

      {/* Form column. Centered card with mobile-friendly padding. */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <BrandMark />
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="login-email">{t('auth:email')}</FieldLabel>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={login.isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="login-password">{t('auth:password')}</FieldLabel>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={login.isPending}
                toggleLabel={{
                  show: t('common:showPassword'),
                  hide: t('common:hidePassword'),
                }}
              />
            </Field>
            {errMessage && <FieldError>{errMessage}</FieldError>}
            <Button
              type="submit"
              className="mt-2 w-full gap-2"
              disabled={login.isPending || !email || !password}
            >
              <LogIn className="size-4" />
              {t('auth:login')}
            </Button>
            {hint && (
              <FieldDescription className="text-center">{hint}</FieldDescription>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
