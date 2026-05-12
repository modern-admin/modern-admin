import { BaseDatabase } from '@modern-admin/core'
import { PrismaResource } from './resource.js'
import type { PrismaDatabaseConfig, PrismaResourceConfig } from './types.js'

const isPrismaDatabaseConfig = (db: unknown): db is PrismaDatabaseConfig =>
  typeof db === 'object' &&
  db !== null &&
  'client' in db &&
  'dmmf' in db &&
  typeof (db as { dmmf?: { datamodel?: unknown } }).dmmf?.datamodel === 'object'

export class PrismaDatabase extends BaseDatabase {
  public readonly config: PrismaDatabaseConfig

  constructor(config: unknown) {
    super(config)
    if (!isPrismaDatabaseConfig(config)) {
      throw new Error('PrismaDatabase requires { client, dmmf } config')
    }
    this.config = config
  }

  static override isAdapterFor(db: unknown): boolean {
    return isPrismaDatabaseConfig(db)
  }

  override resources(): PrismaResource[] {
    const { client, dmmf, dialect } = this.config
    const enums = dmmf.datamodel.enums ?? []
    return dmmf.datamodel.models.map((model) => {
      const cfg: PrismaResourceConfig = { model, client, enums, dialect: dialect ?? 'pg' }
      return new PrismaResource(cfg)
    })
  }
}
