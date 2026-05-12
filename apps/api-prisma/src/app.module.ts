import { Module } from '@nestjs/common'
import { QueueModule } from '@modern-admin/queue'
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
  ],
  controllers: [AppController],
})
export class AppModule {}
