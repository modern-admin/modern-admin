import { Module } from '@nestjs/common'
import { RegionalContentAdminController } from './regional-content.controller.js'
import { FavoritesAdminController } from './favorites.controller.js'

@Module({
  controllers: [RegionalContentAdminController, FavoritesAdminController],
})
export class RegionalAdminModule {}
