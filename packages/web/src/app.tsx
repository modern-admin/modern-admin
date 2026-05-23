/**
 * Root <App> for the admin SPA. Wraps the AdminApp shell with i18n and the
 * ModernAdmin provider, wiring everything from a single runtime config.
 *
 * Used by both the standalone bundle (window.__MODERN_ADMIN__) and the
 * library `mount()` entry point — hosts compose it the same way.
 */

import { type ReactElement, useMemo } from 'react'
import {
  AdminApp,
  ComponentLoader,
  I18nProvider,
  ModernAdminProvider,
} from '@modern-admin/react'
import { builtinLocales } from '@modern-admin/i18n'
import type { ModernAdminRuntimeConfig } from './runtime-config.js'

export interface AppProps {
  config: ModernAdminRuntimeConfig
  /**
   * Optional custom property-type components. The standalone bundle leaves
   * this unset; the library `mount()` lets callers pass demo / project-
   * specific components.
   */
  components?: ComponentLoader
}

export function App({ config, components }: AppProps): ReactElement {
  // Filter the built-in 9-locale bundle by the host's whitelist. Empty /
  // omitted → expose everything; the language switcher in the header
  // collapses itself when only one locale survives the filter.
  const enabledLocales = useMemo(() => {
    if (!config.locales || config.locales.length === 0) return builtinLocales
    const codes = new Set(config.locales)
    const filtered = builtinLocales.filter((l) => codes.has(l.code))
    return filtered.length > 0 ? filtered : builtinLocales
  }, [config.locales])
  return (
    <I18nProvider
      locales={enabledLocales}
      defaultLocale={config.defaultLocale}
      fallbackLocale={config.fallbackLocale}
      metadataTranslations={config.metadataTranslations}
    >
      <ModernAdminProvider
        components={components}
        clientOptions={{
          baseUrl: config.apiUrl,
          credentials: config.credentials ?? 'include',
          headers: config.headers,
          persistDemoSession: config.persistDemoSession,
          authBasePath: config.authBasePath,
        }}
      >
        <AdminApp loginHint={config.loginHint} basePath={config.basePath} />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
