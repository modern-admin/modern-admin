/**
 * Root <App> for the admin SPA. Wraps the AdminApp shell with i18n and the
 * ModernAdmin provider, wiring everything from a single runtime config.
 *
 * Used by both the standalone bundle (window.__MODERN_ADMIN__) and the
 * library `mount()` entry point — hosts compose it the same way.
 */

import type { ReactElement } from 'react'
import {
  AdminApp,
  ComponentLoader,
  I18nProvider,
  ModernAdminProvider,
} from '@modern-admin/react'
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
  return (
    <I18nProvider
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
        }}
      >
        <AdminApp loginHint={config.loginHint} />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
