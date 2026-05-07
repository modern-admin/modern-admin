import type { ReactElement } from 'react'
import { AdminApp, I18nProvider, ModernAdminProvider } from '@modern-admin/react'

export function App(): ReactElement {
  return (
    <I18nProvider>
      <ModernAdminProvider
        clientOptions={{
          baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
          credentials: 'include',
        }}
      >
        <AdminApp />
      </ModernAdminProvider>
    </I18nProvider>
  )
}
