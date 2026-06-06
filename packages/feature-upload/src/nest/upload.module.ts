/**
 * ModernAdminUploadModule — registers `UploadController` plus the sweeper
 * background task that purges orphaned pending uploads.
 *
 * Import alongside `ModernAdminModule.forRoot()` in the host application:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     ModernAdminModule.forRoot({ global: true, ... }),
 *     ModernAdminUploadModule.forRoot({ pendingTtlMs: 60 * 60 * 1000 }),
 *     // feature modules that use uploadFeature() ...
 *   ],
 * })
 * export class AdminModule {}
 * ```
 *
 * The module depends on `MODERN_ADMIN` and `ModernAdminAuthGuard` being
 * available in the DI tree, which is satisfied when `ModernAdminModule.forRoot`
 * is registered with `global: true` (the recommended default).
 */

import { type DynamicModule, Module } from '@nestjs/common'
import { UploadController } from './upload.controller.js'
import { UploadSweeperService } from './upload-sweeper.service.js'
import { UPLOAD_MODULE_OPTIONS, type ModernAdminUploadModuleOptions } from './upload.tokens.js'

export type { ModernAdminUploadModuleOptions } from './upload.tokens.js'

@Module({})
export class ModernAdminUploadModule {
  static forRoot(options: ModernAdminUploadModuleOptions = {}): DynamicModule {
    return {
      module: ModernAdminUploadModule,
      global: options.global ?? false,
      controllers: [UploadController],
      providers: [
        { provide: UPLOAD_MODULE_OPTIONS, useValue: options },
        UploadSweeperService,
      ],
      exports: [UPLOAD_MODULE_OPTIONS],
    }
  }
}
