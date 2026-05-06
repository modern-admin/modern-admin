// @modern-admin/adapter-prisma — Prisma 7 adapter for @modern-admin/core.
//
// Usage:
//   import { Prisma, PrismaClient } from '@prisma/client'
//   import { PrismaDatabase } from '@modern-admin/adapter-prisma'
//   const admin = new ModernAdmin({
//     databases: [{ client: new PrismaClient(), dmmf: Prisma.dmmf }],
//     adapters: [{ Database: PrismaDatabase, Resource: PrismaResource }],
//   })

export { PrismaDatabase } from './database.js'
export { PrismaResource } from './resource.js'
export { PrismaProperty } from './property.js'
export { filterToWhere, findOptionsToPrisma } from './converters.js'
export type {
  DmmfDatamodel,
  DmmfDocument,
  DmmfEnum,
  DmmfField,
  DmmfModel,
  PrismaClientLike,
  PrismaDatabaseConfig,
  PrismaModelDelegate,
  PrismaResourceConfig,
} from './types.js'
