import { Module } from '@nestjs/common'
import { CommentsAdminController } from './comments.controller.js'
import { AuditLogService } from '../audit-log.service.js'

@Module({
  controllers: [CommentsAdminController],
  providers: [AuditLogService],
})
export class CommentsAdminModule {}
