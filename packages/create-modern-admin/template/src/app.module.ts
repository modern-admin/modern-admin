import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'

/**
 * Starter wiring for {{name}}. Register your adapters and resources via
 * `ModernAdminModule.forRoot({ databases: [...] })`. See the @modern-admin
 * docs for adapter packages (prisma, drizzle) and auth providers.
 */
@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [],
      resources: [],
    }),
  ],
})
export class AppModule {}
