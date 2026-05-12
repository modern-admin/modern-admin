import type { ReactElement } from 'react'
import { AdminApp, I18nProvider, ModernAdminProvider } from '@modern-admin/react'
import { en } from './locales/en.js'
import { ru } from './locales/ru.js'
import { adminComponents } from './admin-components.js'

const metadataTranslations = {
  en,
  ru,
}

export function App(): ReactElement {
  return (
    <I18nProvider metadataTranslations={metadataTranslations}>
      <ModernAdminProvider
        components={adminComponents}
        clientOptions={{
          baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
          credentials: 'include',
          persistDemoSession: true,
        }}
      >
        <AdminApp loginHint="admin@example.com / admin12345" />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
