/**
 * Locale registry for the docs site.
 *
 * Only `en` is shipped right now. Add additional locales here as content
 * appears under `content/<locale>/...` — the rest of the wiring (middleware,
 * Nextra `Layout` `i18n` prop, `generateStaticParams`) reads from this file.
 */
export const locales = ['en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}
