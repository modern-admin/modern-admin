import { Module } from '@nestjs/common'
import { ProductsAdminController } from './products.controller.js'
import { ProductTagsAdminController } from './product-tags.controller.js'

@Module({ controllers: [ProductsAdminController, ProductTagsAdminController] })
export class ProductsAdminModule {}
