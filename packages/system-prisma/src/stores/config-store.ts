import { type ConfigEntry, type ConfigScope, type IConfigStore, uuidv7 } from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

interface ConfigRow {
  id: string
  scope: string
  scopeId: string
  key: string
  value: unknown
  updatedAt: Date
}

const GLOBAL_SCOPE_ID = ''
const encodeScopeId = (scopeId: string | null): string => scopeId ?? GLOBAL_SCOPE_ID
const decodeScopeId = (scopeId: string): string | null => scopeId === GLOBAL_SCOPE_ID ? null : scopeId

const rowToEntry = (row: ConfigRow): ConfigEntry => ({
  scope: row.scope as ConfigScope,
  scopeId: decodeScopeId(row.scopeId),
  key: row.key,
  value: row.value,
  updatedAt: row.updatedAt.toISOString(),
})

export class PrismaConfigStore implements IConfigStore {
  constructor(private readonly delegate: PrismaDelegate<ConfigRow>) {
  }

  async get(scope: ConfigScope, scopeId: string | null, key: string): Promise<unknown> {
    // findFirst instead of findUnique: tolerates accidental duplicates and
    // returns the most-recently-updated row rather than throwing.
    const row = await this.delegate.findFirst({
      where: { scope, scopeId: encodeScopeId(scopeId), key },
      orderBy: { updatedAt: 'desc' },
    })
    return row?.value
  }

  async set(
    scope: ConfigScope,
    scopeId: string | null,
    key: string,
    value: unknown,
  ): Promise<void> {
    const encodedScopeId = encodeScopeId(scopeId)
    // Use findFirst + update-by-id / create instead of upsert with a
    // compound unique key.  Prisma 7 + PrismaPg adapter can misidentify
    // compound-key upserts and issue a second INSERT rather than an UPDATE,
    // which violates the unique constraint.  Anchoring the update on the
    // surrogate id is always safe.
    const existing = await this.delegate.findFirst({
      where: { scope, scopeId: encodedScopeId, key },
    })
    if (existing) {
      await this.delegate.update({
        where: { id: existing.id },
        data: { value: value ?? null },
      })
    } else {
      await this.delegate.create({
        data: { id: uuidv7(), scope, scopeId: encodedScopeId, key, value: value ?? null },
      })
    }
  }

  async delete(scope: ConfigScope, scopeId: string | null, key: string): Promise<void> {
    // deleteMany avoids "record not found" and also cleans up any duplicates.
    await this.delegate
      .deleteMany({ where: { scope, scopeId: encodeScopeId(scopeId), key } })
      .catch(() => undefined)
  }

  async list(scope: ConfigScope, scopeId: string | null): Promise<ConfigEntry[]> {
    const rows = await this.delegate.findMany({
      where: { scope, scopeId: encodeScopeId(scopeId) },
      orderBy: { key: 'asc' },
    })
    return rows.map(rowToEntry)
  }
}
