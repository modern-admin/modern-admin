import { builtinLocales, I18n } from '@modern-admin/i18n'

/** Translate server-side failures with English as the deterministic fallback. */
export function translateServerMessage(
  locale: string | undefined,
  key: string,
  params?: Record<string, unknown>,
): string {
  const runtime = new I18n({
    locales: builtinLocales,
    defaultLocale: locale ?? 'en',
    fallbackLocale: 'en',
  })
  return runtime.t(key, params)
}
