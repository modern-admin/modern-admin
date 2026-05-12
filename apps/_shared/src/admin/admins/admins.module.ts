import { Module } from '@nestjs/common'
import { AdminsAdminController } from './admins.controller.js'

@Module({ controllers: [AdminsAdminController] })
export class AdminsAdminModule {}
