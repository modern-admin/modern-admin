import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AdminModule } from './admin.module.js'

@Module({
  imports: [AdminModule],
  controllers: [AppController],
})
export class AppModule {}
