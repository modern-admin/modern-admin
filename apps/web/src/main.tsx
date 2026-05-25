// Demo entry point. Mounts the prebuilt admin SPA via the @modern-admin/web
// library API, passing demo-specific metadata translations and custom
// property-type components that ship only with this reference app.

import { mount, type ModernAdminRuntimeConfig } from '@modern-admin/web'
import type { MetadataLocaleTranslations } from '@modern-admin/react'
import enJson from './locales/en.json'
import ruJson from './locales/ru.json'
import { adminComponents } from './admin-components.js'

// JSON imports come in as their literal type. Casting through `unknown` keeps
// the structural compatibility check while letting us swap translation files
// (e.g. add a new resource) without touching the bundle entry point.
const en = enJson as unknown as MetadataLocaleTranslations
const ru = ruJson as unknown as MetadataLocaleTranslations

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

const config: ModernAdminRuntimeConfig = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  // The demo API (`apps/api-prisma`) mounts the Better Auth handler at
  // `/api/auth` (see `apps/_shared/src/nest/bootstrap.ts`), while the SPA
  // defaults to `/admin/api/auth`. Point the client at the actual mount
  // so sign-in / sign-out reach the right handler.
  authBasePath: '/api/auth',
  credentials: 'include',
  persistDemoSession: true,
  loginHint: 'admin@example.com / admin12345',
  metadataTranslations: { en, ru },
  // Restrict the header switcher to the languages we actually ship JSON
  // metadata for. Drop this array to expose all 9 built-in locales (the
  // chrome will still translate; only resource labels fall back to en/ru).
  locales: ['en', 'ru'],
}

mount(container, { config, components: adminComponents })
