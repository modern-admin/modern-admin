// React bindings for @modern-admin/i18n. Wraps the I18n registry in a
// provider, persists the active locale in localStorage, and exposes a
// `useI18n()` hook that re-renders subscribers on locale changes.

import * as React from 'react'
import { I18n, builtinLocales, type LocaleBundle } from '@modern-admin/i18n'
import type { KeyValueFieldSpec, PropertyJSON, RelatedResource, ResourceJSON } from './types.js'

const STORAGE_KEY = 'modern-admin:locale'

export interface MetadataKeyValueFieldTranslations {
  label?: string
  description?: string
  placeholder?: string
  availableValues?: Record<string, string>
}

export interface MetadataPropertyTranslations {
  label?: string
  description?: string
  availableValues?: Record<string, string>
  keyValueFields?: Record<string, MetadataKeyValueFieldTranslations>
}

export interface MetadataActionTranslations {
  /** Display label shown in action menus, buttons, and tooltips. */
  label?: string
}

export interface MetadataResourceTranslations {
  label?: string
  name?: string
  navigation?: {
    name?: string
    group?: string
  }
  properties?: Record<string, MetadataPropertyTranslations>
  /** Per-action overrides keyed by action name (e.g. `publish`, `archive`). */
  actions?: Record<string, MetadataActionTranslations>
  /**
   * Tab label overrides for related-resource tabs on the show page.
   * Key is the related resource's `resourceId`.
   */
  relatedResources?: Record<string, string>
}

export interface MetadataLocaleTranslations {
  navigation?: {
    groups?: Record<string, string>
  }
  resources?: Record<string, MetadataResourceTranslations>
  properties?: Record<string, MetadataPropertyTranslations>
}

export type MetadataTranslations = Record<string, MetadataLocaleTranslations>

const isDefined = <T,>(value: T | undefined): value is T => value !== undefined

const firstDefined = <T,>(...values: Array<T | undefined>): T | undefined =>
  values.find(isDefined)

const localizeAvailableValues = (
  availableValues: Array<{ value: string; label: string }> | null,
  ...maps: Array<Record<string, string> | undefined>
): Array<{ value: string; label: string }> | null => {
  if (!availableValues) return availableValues
  return availableValues.map((option) => ({
    ...option,
    label: firstDefined(...maps.map((map) => map?.[option.value]), option.label) ?? option.label,
  }))
}

const localizeKeyValueField = (
  field: KeyValueFieldSpec,
  ...translations: Array<MetadataKeyValueFieldTranslations | undefined>
): KeyValueFieldSpec => ({
  ...field,
  label: firstDefined(...translations.map((translation) => translation?.label), field.label),
  description: firstDefined(...translations.map((translation) => translation?.description), field.description),
  placeholder: firstDefined(...translations.map((translation) => translation?.placeholder), field.placeholder),
  availableValues: field.availableValues?.map((option) => {
    if (typeof option === 'string') {
      const label =
        firstDefined(...translations.map((translation) => translation?.availableValues?.[option]), option) ??
        option
      return { value: option, label }
    }
    return {
      ...option,
      label:
        firstDefined(...translations.map((translation) => translation?.availableValues?.[option.value]), option.label) ??
        option.label,
    }
  }),
})

/**
 * Applies translated tab labels to `relatedResources`. Each translation map
 * is keyed by `resourceId`; the first map that has a matching entry wins.
 * Exported for unit testing.
 */
export const localizeRelatedResources = (
  relatedResources: RelatedResource[] | undefined,
  ...translations: Array<Record<string, string> | undefined>
): RelatedResource[] | undefined => {
  if (!relatedResources) return relatedResources
  return relatedResources.map((r) => {
    const translatedLabel = firstDefined(...translations.map((map) => map?.[r.resourceId]))
    return translatedLabel !== undefined ? { ...r, label: translatedLabel } : r
  })
}

const localizeProperty = (
  property: PropertyJSON,
  ...translations: Array<MetadataPropertyTranslations | undefined>
): PropertyJSON => ({
  ...property,
  label: firstDefined(...translations.map((translation) => translation?.label), property.label) ?? property.label,
  description: firstDefined(...translations.map((translation) => translation?.description), property.description),
  availableValues: localizeAvailableValues(
    property.availableValues,
    ...translations.map((translation) => translation?.availableValues),
  ),
  keyValueFields: property.keyValueFields?.map((field) =>
    localizeKeyValueField(
      field,
      ...translations.map((translation) => translation?.keyValueFields?.[field.key]),
    ),
  ),
})

interface I18nContextValue {
  locale: string
  setLocale(code: string): void
  t(key: string, params?: Record<string, unknown>): string
  availableLocales(): Array<{ code: string; name: string }>
  localizeResource(resource: ResourceJSON): ResourceJSON
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export interface I18nProviderProps {
  children: React.ReactNode
  /** Override or extend the bundled locales. Defaults to all 9 built-ins. */
  locales?: LocaleBundle[]
  /**
   * Locale to start in when the visitor has no persisted choice, or when
   * their persisted choice is not among `locales`. A previous, still-valid
   * choice wins over this — use `forceLocale` to override that too.
   */
  defaultLocale?: string
  fallbackLocale?: string
  metadataTranslations?: MetadataTranslations
  /**
   * Pin the UI to one locale: the persisted choice is ignored, `setLocale`
   * is a no-op, and `availableLocales()` returns only this locale so the
   * header switcher collapses. Unlike passing a single-entry `locales`
   * array, the other bundles stay loaded and keep serving `fallbackLocale`.
   *
   * Ignored entirely when the code is not one of `locales` — a typo leaves
   * normal switching intact rather than locking the UI.
   */
  forceLocale?: string
  /**
   * Per-locale overrides merged over the built-in dictionaries — the
   * supported way to rename the product, reword a built-in label, or ship a
   * translation fix without waiting for a release:
   *
   * ```ts
   * translations={{ ru: { 'common:appName': 'Acme', 'auth:tagline': '…' } }}
   * ```
   *
   * Keys are the flat `namespace:key` form used by the bundled locales.
   */
  translations?: Record<string, Record<string, string>>
}

export function I18nProvider({
  children,
  locales = builtinLocales,
  defaultLocale,
  fallbackLocale = 'en',
  metadataTranslations,
  forceLocale,
  translations,
}: I18nProviderProps): React.ReactElement {
  // A `forceLocale` that is not among `locales` cannot be applied. Resolving
  // it to `undefined` once, here, keeps the pin, the `setLocale` no-op, and
  // the switcher filter in agreement — reading the raw prop in each of them
  // separately would pin nothing while still hiding the switcher, leaving
  // the user stuck in the wrong language with no control to change it.
  const pinnedLocale = React.useMemo(
    () => (forceLocale && locales.some((l) => l.code === forceLocale) ? forceLocale : undefined),
    [forceLocale, locales],
  )

  // The documented usage passes an inline object literal
  // (`translations={{ ru: { … } }}`), which is a new reference every render.
  // Keying the memo on its content instead of its identity keeps that from
  // rebuilding the I18n instance — and re-rendering every `useI18n()`
  // consumer — on each pass.
  const translationsKey = React.useMemo(
    () => (translations ? JSON.stringify(translations) : ''),
    [translations],
  )

  const i18n = React.useMemo(() => {
    const enabled = new Set(locales.map((l) => l.code))
    const persisted =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    // A persisted choice only wins while it is still one of the enabled
    // locales. Otherwise `defaultLocale` applies — previously a stale
    // persisted code fell through to `locales[0]`, silently ignoring the
    // configured default.
    const initial =
      pinnedLocale ??
      (persisted && enabled.has(persisted) ? persisted : undefined) ??
      defaultLocale ??
      locales[0]?.code
    const inst = new I18n({ locales, defaultLocale: initial ?? undefined, fallbackLocale })
    // Host overrides go on last so they beat the bundled dictionaries.
    const parsed: Record<string, Record<string, string>> = translationsKey
      ? (JSON.parse(translationsKey) as Record<string, Record<string, string>>)
      : {}
    for (const [code, dict] of Object.entries(parsed)) inst.extend(code, dict)
    return inst
  }, [locales, defaultLocale, fallbackLocale, pinnedLocale, translationsKey])

  const [locale, setLocaleState] = React.useState(() => i18n.locale)

  // The state above is seeded once. Whenever the memo above produces a *new*
  // I18n instance — a changed `locales` whitelist, `forceLocale`, or
  // `translations` — `t()` starts answering in the new language while this
  // state still names the old one, and everything keyed on it (the date-fns
  // locale, `<html lang>`, the switcher's checkmark) goes stale.
  React.useEffect(() => {
    setLocaleState(i18n.locale)
  }, [i18n])

  // Keep `<html lang>` in step with the active locale: screen readers pick
  // pronunciation from it, and browsers offer to translate the page based
  // on it. The shell ships `lang="en"` and nothing else updated it.
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  }, [locale])

  const localizeResource = React.useCallback(
    (resource: ResourceJSON): ResourceJSON => {
      const localeMeta = metadataTranslations?.[locale]
      const fallbackMeta = metadataTranslations?.[fallbackLocale]
      const resourceLocale = localeMeta?.resources?.[resource.id]
      const resourceFallback = fallbackMeta?.resources?.[resource.id]
      const localizedName =
        firstDefined(resourceLocale?.label, resourceLocale?.name, resourceFallback?.label, resourceFallback?.name, resource.name) ??
        resource.name
      const group = resource.navigation?.group
      return {
        ...resource,
        name: localizedName,
        navigation:
          resource.navigation === null
            ? null
            : resource.navigation
              ? {
                ...resource.navigation,
                name: firstDefined(
                  resourceLocale?.navigation?.name,
                  resourceFallback?.navigation?.name,
                  resource.navigation.name,
                ),
                group: firstDefined(
                  resourceLocale?.navigation?.group,
                  resourceFallback?.navigation?.group,
                  group ? localeMeta?.navigation?.groups?.[group] : undefined,
                  group ? fallbackMeta?.navigation?.groups?.[group] : undefined,
                  resource.navigation.group,
                ),
              }
              : resource.navigation,
        properties: resource.properties.map((property) =>
          localizeProperty(
            property,
            resourceLocale?.properties?.[property.path],
            localeMeta?.properties?.[property.path],
            resourceFallback?.properties?.[property.path],
            fallbackMeta?.properties?.[property.path],
          ),
        ),
        actions: resource.actions.map((action) => {
          const localizedLabel = firstDefined(
            resourceLocale?.actions?.[action.name]?.label,
            resourceFallback?.actions?.[action.name]?.label,
          )
          if (localizedLabel === undefined) return action
          return {
            ...action,
            custom: { ...(action.custom ?? {}), label: localizedLabel },
          }
        }),
        relatedResources: localizeRelatedResources(
          resource.relatedResources,
          resourceLocale?.relatedResources,
          resourceFallback?.relatedResources,
        ),
      }
    },
    [fallbackLocale, locale, metadataTranslations],
  )

  const setLocale = React.useCallback(
    (code: string) => {
      if (pinnedLocale) return
      i18n.setLocale(code)
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, code)
      setLocaleState(i18n.locale)
    },
    [i18n, pinnedLocale],
  )

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => i18n.t(key, params),
      availableLocales: () =>
        pinnedLocale
          ? i18n.availableLocales().filter((l) => l.code === pinnedLocale)
          : i18n.availableLocales(),
      localizeResource,
    }),
    [locale, setLocale, i18n, localizeResource, pinnedLocale],
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
    localizeResource: (resource) => resource,
  }
}
