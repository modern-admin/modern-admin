import { builtinLocales, I18n, type LocaleBundle } from '@modern-admin/i18n'

/** Translate server-side failures with English as the deterministic fallback. */
export function translateServerMessage(
  locale: string | undefined,
  key: string,
  params?: Record<string, unknown>,
  customLocales: ReadonlyArray<LocaleBundle> = [],
): string {
  const byCode = new Map(builtinLocales.map((bundle) => [bundle.code, bundle]))
  for (const bundle of customLocales) byCode.set(bundle.code, bundle)
  const runtime = new I18n({
    locales: [...byCode.values()],
    defaultLocale: locale ?? 'en',
    fallbackLocale: 'en',
  })
  return runtime.t(key, params)
}
