import type { ReactElement } from 'react'
import { AdminApp, ModernAdminProvider } from '@modern-admin/react'

export function App(): ReactElement {
  return (
    <ModernAdminProvider
      clientOptions={{
        baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
        credentials: 'include',
      }}
    >
      <AdminApp />
    </ModernAdminProvider>
  )
}
