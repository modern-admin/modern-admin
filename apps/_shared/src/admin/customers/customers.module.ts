import { Module } from '@nestjs/common'
import { CustomersAdminController } from './customers.controller.js'

@Module({ controllers: [CustomersAdminController] })
export class CustomersAdminModule {}
