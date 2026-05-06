import type { LocaleBundle, TranslationDict } from './types.js'

export interface I18nOptions {
  locales: LocaleBundle[]
  /** Default locale code; falls back to the first registered locale. */
  defaultLocale?: string
  /** Locale to use when a key is missing in the active dict. */
  fallbackLocale?: string
}

const interpolate = (template: string, params?: Record<string, unknown>): string => {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name]
    return v == null ? match : String(v)
  })
}

/**
 * Tiny translation registry. Drop-in replacement for the parts of i18next we
 * actually use (lookup, interpolation, fallback). Frameworks pluging in real
 * i18next can wrap this interface trivially.
 */
export class I18n {
  private readonly dicts = new Map<string, TranslationDict>()
  private readonly names = new Map<string, string>()
  private current: string
  private readonly fallback: string

  constructor(options: I18nOptions) {
    if (options.locales.length === 0) {
      throw new Error('I18n requires at least one locale')
    }
    for (const bundle of options.locales) {
      this.dicts.set(bundle.code, { ...bundle.dict })
      this.names.set(bundle.code, bundle.name)
    }
    this.current = options.defaultLocale ?? options.locales[0]!.code
    this.fallback = options.fallbackLocale ?? options.locales[0]!.code
    if (!this.dicts.has(this.current)) this.current = options.locales[0]!.code
  }

  get locale(): string {
    return this.current
  }

  setLocale(code: string): void {
    if (this.dicts.has(code)) this.current = code
  }

  availableLocales(): Array<{ code: string; name: string }> {
    return Array.from(this.names.entries()).map(([code, name]) => ({ code, name }))
  }

  t(key: string, params?: Record<string, unknown>): string {
    const dict = this.dicts.get(this.current)
    const fallbackDict = this.dicts.get(this.fallback)
    const value = dict?.[key] ?? fallbackDict?.[key] ?? key
    return interpolate(value, params)
  }

  /** Add or replace translations for an existing locale (merges). */
  extend(code: string, dict: TranslationDict): void {
    const existing = this.dicts.get(code) ?? {}
    this.dicts.set(code, { ...existing, ...dict })
  }
}
