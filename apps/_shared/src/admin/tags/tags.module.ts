import { Module } from '@nestjs/common'
import { TagsAdminController } from './tags.controller.js'
import { TagStatsService } from '../tag-stats.service.js'

@Module({
  controllers: [TagsAdminController],
  providers: [TagStatsService],
})
export class TagsAdminModule {}
