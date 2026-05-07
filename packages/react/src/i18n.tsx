// React bindings for @modern-admin/i18n. Wraps the I18n registry in a
// provider, persists the active locale in localStorage, and exposes a
// `useI18n()` hook that re-renders subscribers on locale changes.

import * as React from 'react'
import { I18n, builtinLocales, type LocaleBundle } from '@modern-admin/i18n'

const STORAGE_KEY = 'modern-admin:locale'

interface I18nContextValue {
  locale: string
  setLocale(code: string): void
  t(key: string, params?: Record<string, unknown>): string
  availableLocales(): Array<{ code: string; name: string }>
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export interface I18nProviderProps {
  children: React.ReactNode
  /** Override or extend the bundled locales. Defaults to all 9 built-ins. */
  locales?: LocaleBundle[]
  defaultLocale?: string
  fallbackLocale?: string
}

export function I18nProvider({
  children,
  locales = builtinLocales,
  defaultLocale,
  fallbackLocale = 'en',
}: I18nProviderProps): React.ReactElement {
  const i18n = React.useMemo(() => {
    const initial =
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) ||
      defaultLocale ||
      locales[0]?.code
    return new I18n({ locales, defaultLocale: initial ?? undefined, fallbackLocale })
  }, [locales, defaultLocale, fallbackLocale])

  const [locale, setLocaleState] = React.useState(() => i18n.locale)

  const setLocale = React.useCallback(
    (code: string) => {
      i18n.setLocale(code)
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, code)
      setLocaleState(i18n.locale)
    },
    [i18n],
  )

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => i18n.t(key, params),
      availableLocales: () => i18n.availableLocales(),
    }),
    [locale, setLocale, i18n],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Subscribe to the active locale + translations. Falls back to a no-op
 * implementation when no provider is mounted, so consumers can render
 * without forcing apps to install i18n. */
export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (ctx) return ctx
  return {
    locale: 'en',
    setLocale: () => {},
    t: (k) => k,
    availableLocales: () => [{ code: 'en', name: 'English' }],
  }
}
