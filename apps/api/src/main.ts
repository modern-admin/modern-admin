import { bootstrapApp } from '@modern-admin/app-shared'
import { auth, migrateAuth, seedDemoUser } from './auth.js'
import { AppModule } from './app.module.js'

// `auth.ts` publishes the instance onto globalThis as an import-time
// side-effect of `buildBetterAuth()`; `admin.module.ts` consumes it
// during module load.

void bootstrapApp({
  AppModule,
  auth,
  label: 'modern-admin/api',
  preBootstrap: async () => {
    await migrateAuth()
    await seedDemoUser()
  },
  openApi: {
    title: 'Modern Admin — Reference API',
    description:
      'REST surface of the @modern-admin/nest module. Authentication is cookie-based via Better Auth (`/api/auth/sign-in/email`).',
    version: '0.0.0',
    cookie: { description: 'Better Auth session cookie set on `/api/auth/sign-in/*`.' },
    bearer: { description: 'Modern Admin API key (Authorization: Bearer …)' },
    scalar: { theme: 'default', pageTitle: 'Modern Admin API' },
  },
})
