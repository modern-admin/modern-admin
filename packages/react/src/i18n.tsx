// React bindings for @modern-admin/i18n. Wraps the I18n registry in a
// provider, persists the active locale in localStorage, and exposes a
// `useI18n()` hook that re-renders subscribers on locale changes.

import * as React from 'react'
import { I18n, builtinLocales, type LocaleBundle } from '@modern-admin/i18n'
import type { KeyValueFieldSpec, PropertyJSON, ResourceJSON } from './types.js'

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
  defaultLocale?: string
  fallbackLocale?: string
  metadataTranslations?: MetadataTranslations
}

export function I18nProvider({
  children,
  locales = builtinLocales,
  defaultLocale,
  fallbackLocale = 'en',
  metadataTranslations,
}: I18nProviderProps): React.ReactElement {
  const i18n = React.useMemo(() => {
    const initial =
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) ||
      defaultLocale ||
      locales[0]?.code
    return new I18n({ locales, defaultLocale: initial ?? undefined, fallbackLocale })
  }, [locales, defaultLocale, fallbackLocale])

  const [locale, setLocaleState] = React.useState(() => i18n.locale)

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
      }
    },
    [fallbackLocale, locale, metadataTranslations],
  )

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
      localizeResource,
    }),
    [locale, setLocale, i18n, localizeResource],
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
