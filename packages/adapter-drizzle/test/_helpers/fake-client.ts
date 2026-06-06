import type {
  DrizzleClientLike,
  DrizzleDeleteBuilder,
  DrizzleInsertBuilder,
  DrizzleQueryBuilder,
  DrizzleSelectBuilder,
  DrizzleTable,
  DrizzleUpdateBuilder,
} from '../../src/types.js'

export interface FakeCall {
  op: 'select' | 'from' | 'where' | 'orderBy' | 'groupBy' | 'limit' | 'offset' | 'insert' | 'values' | 'returning' | 'update' | 'set' | 'delete'
  arg?: unknown
}

interface Canned {
  selectRows?: unknown[]
  countValue?: number
  insertRow?: Record<string, unknown>
  updateRow?: Record<string, unknown>
}

export interface FakeClient extends DrizzleClientLike {
  calls: FakeCall[]
  canned: Canned
}

/**
 * Build a duck-typed drizzle client for unit tests. Records every builder
 * call and resolves chains with canned rows. Does not execute SQL.
 */
export const createFakeClient = (canned: Canned = {}): FakeClient => {
  const calls: FakeCall[] = []

  const makeQueryBuilder = <T>(rows: T[]): DrizzleQueryBuilder<T> => {
    const qb: DrizzleQueryBuilder<T> = {
      where(condition) {
        calls.push({ op: 'where', arg: condition })
        return qb
      },
      orderBy(...columns) {
        calls.push({ op: 'orderBy', arg: columns })
        return qb
      },
      groupBy(...columns) {
        calls.push({ op: 'groupBy', arg: columns })
        return qb
      },
      limit(n) {
        calls.push({ op: 'limit', arg: n })
        return qb
      },
      offset(n) {
        calls.push({ op: 'offset', arg: n })
        return qb
      },
      then(onfulfilled) {
        const result = Promise.resolve(rows)
        return onfulfilled ? result.then(onfulfilled) : (result as never)
      },
    }
    return qb
  }

  const client: FakeClient = {
    calls,
    canned,
    select(fields?: Record<string, unknown>): DrizzleSelectBuilder {
      calls.push({ op: 'select', arg: fields })
      const isCount = fields && 'value' in fields
      return {
        from(table: DrizzleTable) {
          calls.push({ op: 'from', arg: table })
          if (isCount) {
            return makeQueryBuilder([{ value: canned.countValue ?? 0 }]) as DrizzleQueryBuilder<Record<string, unknown>>
          }
          return makeQueryBuilder((canned.selectRows ?? []) as Record<string, unknown>[])
        },
      }
    },
    insert(table: DrizzleTable): DrizzleInsertBuilder {
      calls.push({ op: 'insert', arg: table })
      return {
        values(value) {
          calls.push({ op: 'values', arg: value })
          return {
            async returning() {
              calls.push({ op: 'returning' })
              return [canned.insertRow ?? value]
            },
          }
        },
      }
    },
    update(table: DrizzleTable): DrizzleUpdateBuilder {
      calls.push({ op: 'update', arg: table })
      return {
        set(values) {
          calls.push({ op: 'set', arg: values })
          return {
            where(condition) {
              calls.push({ op: 'where', arg: condition })
              return {
                async returning() {
                  calls.push({ op: 'returning' })
                  return [canned.updateRow ?? values]
                },
              }
            },
          }
        },
      }
    },
    delete(table: DrizzleTable): DrizzleDeleteBuilder {
      calls.push({ op: 'delete', arg: table })
      return {
        async where(condition) {
          calls.push({ op: 'where', arg: condition })
          return undefined
        },
      }
    },
    async transaction<T>(fn: (tx: DrizzleClientLike) => Promise<T>): Promise<T> {
      return fn(client)
    },
  }
  return client
}
