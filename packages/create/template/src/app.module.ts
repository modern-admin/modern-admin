/**
 * Root Nest module for {{name}}.
 *
 * Two concerns are composed:
 *   1. `AdminModule` — `@modern-admin/nest` mounts the REST controllers
 *      at `/admin/api/*` and registers our Prisma resources.
 *   2. `ModernAdminStaticUiModule` — serves the prebuilt SPA from
 *      `@modern-admin/web` at `/admin`. Same origin as the API, so
 *      cookies/CORS are not a concern.
 *
 * Better Auth's HTTP handler is mounted in `main.ts` via `toNodeHandler`
 * — it must run before any body parser, which Nest installs by default.
 */
import { Module } from '@nestjs/common'
import { ModernAdminStaticUiModule } from '@modern-admin/nest'
import { AdminModule } from './admin.module.js'

@Module({
  imports: [
    AdminModule,
    ModernAdminStaticUiModule.forRoot({
      path: '/admin',
      title: '{{name}}',
      runtimeConfig: {
        // SPA and API share the same Nest app — relative URLs only.
        apiUrl: '',
        credentials: 'include',
      },
    }),
  ],
})
export class AppModule {}
