/** Translation bundle for one locale. Keys are namespaced with `:`. */
export type TranslationDict = Record<string, string>

export interface LocaleBundle {
  code: string
  name: string
  dict: TranslationDict
}
