import { Module } from '@nestjs/common'
import { CategoriesAdminController } from './categories.controller.js'

@Module({ controllers: [CategoriesAdminController] })
export class CategoriesAdminModule {}
