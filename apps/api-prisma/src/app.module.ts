import { Module } from '@nestjs/common'
import { QueueModule } from '@modern-admin/queue'
import { ModernAdminStaticUiModule } from '@modern-admin/nest'
import { AppController } from './app.controller.js'
import { AdminModule } from './admin.module.js'

@Module({
  imports: [
    QueueModule.forRoot({
      connection: process.env.REDIS_URL ?? {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    AdminModule,
    // Serve the prebuilt @modern-admin/web SPA at `/admin`. The admin REST
    // surface lives under `/admin/api/*` (see `ResourceController` etc.)
    // and is excluded by the module's middleware configuration.
    ModernAdminStaticUiModule.forRoot({
      path: '/admin',
      title: 'Modern Admin (Prisma demo)',
      runtimeConfig: {
        // Same-origin: the SPA and the API share the Nest app.
        apiUrl: '',
        credentials: 'include',
        loginHint: 'admin@example.com / admin12345',
        persistDemoSession: true,
        // This demo mounts Better Auth at `/api/auth` (not `/admin/api/auth`).
        authBasePath: '/api/auth',
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
