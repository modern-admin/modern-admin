// Maps a UI locale code to the date-fns locale object that `<Calendar>`,
// `<DatePicker>`, and `<DateRangeInput>` need for month names, weekday
// headers, and react-day-picker's own ARIA labels.
//
// Lives here rather than in @modern-admin/react because `date-fns` is a
// dependency of this package; consumers get it through the barrel.

import type { Locale } from 'date-fns'
import { de, enUS, es, fr, it, ja, pl, ptBR, ru } from 'date-fns/locale'

/** Keyed by the codes of the nine bundled `@modern-admin/i18n` locales. */
const DATE_LOCALES: Record<string, Locale> = {
  de,
  en: enUS,
  es,
  fr,
  it,
  ja,
  pl,
  'pt-BR': ptBR,
  ru,
}

/**
 * Resolves `'pt-BR'` exactly, then falls back to the base language (`'pt'`),
 * then to `undefined` — which leaves date-fns on its own `en-US` default.
 */
export function dateFnsLocale(code: string | undefined): Locale | undefined {
  if (!code) return undefined
  const exact = DATE_LOCALES[code]
  if (exact) return exact
  const base = code.split('-')[0]
  return base ? DATE_LOCALES[base] : undefined
}

export type { Locale }
