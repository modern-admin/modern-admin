import { Module } from '@nestjs/common'
import { RolesAdminController } from './roles.controller.js'

@Module({ controllers: [RolesAdminController] })
export class RolesAdminModule {}
