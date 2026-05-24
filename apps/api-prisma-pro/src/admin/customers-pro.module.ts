import { Module } from '@nestjs/common'
import { CustomersProAdminController } from './customers-pro.controller.js'

@Module({ controllers: [CustomersProAdminController] })
export class CustomersProAdminModule {}
