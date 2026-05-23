// Demo entry point. Mounts the prebuilt admin SPA via the @modern-admin/web
// library API, passing demo-specific metadata translations and custom
// property-type components that ship only with this reference app.

import { mount, type ModernAdminRuntimeConfig } from '@modern-admin/web'
import { en } from './locales/en.js'
import { ru } from './locales/ru.js'
import { adminComponents } from './admin-components.js'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

const config: ModernAdminRuntimeConfig = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  // Demo APIs (`apps/api` and `apps/api-prisma`) mount the Better Auth
  // handler at `/api/auth` (see `apps/_shared/src/nest/bootstrap.ts`),
  // while the SPA defaults to `/admin/api/auth`. Point the client at the
  // actual mount so sign-in / sign-out reach the right handler.
  authBasePath: '/api/auth',
  credentials: 'include',
  persistDemoSession: true,
  loginHint: 'admin@example.com / admin12345',
  metadataTranslations: { en, ru },
}

mount(container, { config, components: adminComponents })
