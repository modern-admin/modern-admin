// @modern-admin/i18n — small translation registry plus 9 packaged locales.
// The runtime is intentionally minimal so consumers can swap it for i18next
// or react-intl by re-implementing the `I18n` surface.

export { I18n, type I18nOptions } from './i18n.js'
export type { LocaleBundle, TranslationDict } from './types.js'

export { en } from './locales/en.js'
export { ru } from './locales/ru.js'
export { de } from './locales/de.js'
export { fr } from './locales/fr.js'
export { es } from './locales/es.js'
export { it } from './locales/it.js'
export { ja } from './locales/ja.js'
export { pl } from './locales/pl.js'
export { ptBR } from './locales/pt-BR.js'

import { en } from './locales/en.js'
import { ru } from './locales/ru.js'
import { de } from './locales/de.js'
import { fr } from './locales/fr.js'
import { es } from './locales/es.js'
import { it } from './locales/it.js'
import { ja } from './locales/ja.js'
import { pl } from './locales/pl.js'
import { ptBR } from './locales/pt-BR.js'

/** All locales bundled with @modern-admin/i18n out of the box. */
export const builtinLocales = [en, ru, de, fr, es, it, ja, pl, ptBR]
