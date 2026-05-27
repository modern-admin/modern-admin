// Two-pane sign-in screen: branded panel on the left, form on the right.
// Collapses into a single column on mobile (left pane hides — the form
// reuses the brand mark inline). Posts to Better Auth's email handler via
// AdminClient.login, then invalidates the `me` query so the gate flips
// to the authenticated app shell.
//
// Social providers are driven entirely by the server: BetterAuthProvider
// returns the list of enabled provider ids from `betterAuth({ socialProviders })`.
// Known providers (google, github, apple) get a dedicated lucide icon; any
// other id falls back to Globe with a capitalised label.

import * as React from 'react'
import { Button, Field, FieldDescription, FieldError, FieldLabel, Input, PasswordInput } from '@modern-admin/ui'
import { Database, Globe, LogIn } from 'lucide-react'
import { useAuthUiProps, useLogin, useSocialLogin } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { AdminApiError } from '../client.js'

// ─── Social provider registry ────────────────────────────────────────────────
// Maps a Better Auth provider id to a display label and an icon element.
// lucide-react 1.x dropped all brand icons, so known social providers use
// inline monochrome SVGs; unknown ids fall through to Globe.

type ProviderDef = { label: string; icon: React.ReactElement }

function GoogleIcon(): React.ReactElement {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function GitHubIcon(): React.ReactElement {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function AppleIcon(): React.ReactElement {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.459 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.378-3.066c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
    </svg>
  )
}

const SOCIAL_PROVIDERS: Record<string, ProviderDef> = {
  google: { label: 'Google', icon: <GoogleIcon/> },
  github: { label: 'GitHub', icon: <GitHubIcon/> },
  apple: { label: 'Apple', icon: <AppleIcon/> },
}

function resolveProvider(id: string): ProviderDef {
  return (
    SOCIAL_PROVIDERS[id] ?? {
      label: id.charAt(0).toUpperCase() + id.slice(1),
      icon: <Globe className="size-4" aria-hidden="true"/>,
    }
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

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
      <Database className={`${icon} text-primary`} aria-hidden="true"/>
    </span>
  )
}

export function LoginPage({ title, hint, tagline }: LoginPageProps): React.ReactElement {
  const { t } = useI18n()
  const login = useLogin()
  const socialLogin = useSocialLogin()
  const { data: authUi } = useAuthUiProps()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const providers = authUi?.providers ?? []
  const showEmailForm = authUi === undefined || authUi.emailAndPassword

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
          <BrandMark/>
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
            <BrandMark/>
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Social login buttons */}
          {providers.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {providers.map((id) => {
                const { label, icon } = resolveProvider(id)
                return (
                  <Button
                    key={id}
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={socialLogin.isPending}
                    onClick={() => socialLogin.mutate(id)}
                  >
                    {icon}
                    {t('auth:continueWith').replace('{provider}', label)}
                  </Button>
                )
              })}
            </div>
          )}

          {/* Divider between social and email/password */}
          {providers.length > 0 && showEmailForm && (
            <div className="relative mb-4 flex items-center gap-3">
              <div className="flex-1 border-t border-border"/>
              <span className="text-xs text-muted-foreground">
                {t('auth:orContinueWith')}
              </span>
              <div className="flex-1 border-t border-border"/>
            </div>
          )}

          {/* Email / password form */}
          {showEmailForm && (
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
                <LogIn className="size-4"/>
                {t('auth:login')}
              </Button>
              {hint && (
                <FieldDescription className="text-center">{hint}</FieldDescription>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
