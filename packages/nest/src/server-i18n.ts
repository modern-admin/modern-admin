import { builtinLocales, I18n, type LocaleBundle } from '@modern-admin/i18n'

/** Negotiate a supported language, including regional variants and q weights. */
export function requestLocale(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  customLocales: ReadonlyArray<LocaleBundle> = [],
): string {
  const raw =
    headers instanceof Headers ? headers.get('accept-language') : headers?.['accept-language']
  const available = [...builtinLocales, ...customLocales].map((bundle) => bundle.code)
  const preferences = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((value) => {
      const [language = '', ...params] = value.trim().split(';')
      const quality = params.find((param) => param.trim().startsWith('q='))
      return {
        language: language.toLowerCase(),
        weight: quality ? Number(quality.trim().slice(2)) : 1,
      }
    })
    .filter(({ weight }) => weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight)
  for (const { language } of preferences) {
    const exact = available.find((code) => code.toLowerCase() === language)
    if (exact) return exact
    const base = language.split('-')[0]
    const regional = available.find((code) => code.toLowerCase().split('-')[0] === base)
    if (regional) return regional
  }
  return 'en'
}

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
