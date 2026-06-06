/**
 * Deep coverage for the Prisma `filterToWhere` converter.
 *
 * Targets every {operator × field type × edge case} combination because the
 * `where`-clause translation is where most adapter bugs hide. Each test
 * asserts the produced Prisma `where` object directly — failures surface
 * exactly which translation broke.
 *
 * Companion to `converters.test.ts` (which only spot-checks the happy
 * paths). New tests should go here; once stable they can be folded back.
 */
import { describe, expect, test } from 'bun:test'
import { Filter } from '@modern-admin/core'
import { filterToWhere } from '../src/converters.js'
import { PrismaResource } from '../src/resource.js'
import type { DmmfEnum, DmmfField, DmmfModel } from '../src/types.js'
import { createClient, createDelegate } from './_helpers/fake-client.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

const field = (overrides: Partial<DmmfField>): DmmfField => ({
  name: overrides.name ?? 'f',
  kind: overrides.kind ?? 'scalar',
  type: overrides.type ?? 'String',
  isList: overrides.isList ?? false,
  isRequired: overrides.isRequired ?? false,
  isUnique: overrides.isUnique ?? false,
  isId: overrides.isId ?? false,
  isReadOnly: overrides.isReadOnly ?? false,
  hasDefaultValue: overrides.hasDefaultValue ?? false,
  ...(overrides.relationName ? { relationName: overrides.relationName } : {}),
  ...(overrides.relationFromFields ? { relationFromFields: overrides.relationFromFields } : {}),
  ...(overrides.relationToFields ? { relationToFields: overrides.relationToFields } : {}),
})

const REGION_ENUM: DmmfEnum = {
  name: 'Region',
  values: [{ name: 'eu' }, { name: 'us' }, { name: 'asia' }],
}

/**
 * A model that covers every distinct PropertyType the converter cares about,
 * plus relation + list variants. Mirrors apps/api-prisma schema shapes
 * (Customer / Post / Product / RegionalContent / Favorite).
 */
const richModel: DmmfModel = {
  name: 'Rich',
  fields: [
    field({ name: 'id', type: 'String', isId: true, isRequired: true, hasDefaultValue: true }),
    field({ name: 'name', type: 'String', isRequired: true }),
    field({ name: 'nick', type: 'String' }),                       // nullable string
    field({ name: 'age', type: 'Int' }),                           // number
    field({ name: 'price', type: 'Float' }),                       // float
    field({ name: 'big', type: 'BigInt' }),                        // number (BigInt)
    field({ name: 'paid', type: 'Decimal' }),                      // float
    field({ name: 'active', type: 'Boolean' }),                    // boolean
    field({ name: 'createdAt', type: 'DateTime' }),                // datetime
    field({ name: 'meta', type: 'Json' }),                         // json
    field({ name: 'region', kind: 'enum', type: 'Region' }),       // enum
    field({ name: 'tags', type: 'String', isList: true }),         // String[] (scalar list)
    field({ name: 'scores', type: 'Int', isList: true }),          // Int[]
    field({
      name: 'authorId',
      type: 'String',
      isReadOnly: true,
    }),
    field({
      name: 'author',
      kind: 'object',
      type: 'Customer',
      relationName: 'RichAuthor',
      relationFromFields: ['authorId'],
      relationToFields: ['id'],
    }),
  ],
}

const buildResource = (): PrismaResource =>
  new PrismaResource({
    model: richModel,
    client: createClient({ rich: createDelegate() }),
    enums: [REGION_ENUM],
  })

const where = (raw: Record<string, unknown>): Record<string, unknown> => {
  const resource = buildResource()
  return filterToWhere(new Filter(raw, resource))
}

// ════════════════════════════════════════════════════════════════════════════
// 1. SCALAR OPERATORS × FIELD TYPES
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — eq operator', () => {
  test('eq on string → equals + insensitive mode', () => {
    expect(where({ name: 'eq:John' })).toEqual({
      name: { equals: 'John', mode: 'insensitive' },
    })
  })

  test('eq on int → coerces to number', () => {
    expect(where({ age: 'eq:42' })).toEqual({ age: { equals: 42 } })
  })

  test('eq on float → coerces via parseFloat', () => {
    expect(where({ price: 'eq:19.99' })).toEqual({ price: { equals: 19.99 } })
  })

  test('eq on boolean true', () => {
    expect(where({ active: 'eq:true' })).toEqual({ active: { equals: true } })
  })

  test('eq on boolean false', () => {
    expect(where({ active: 'eq:false' })).toEqual({ active: { equals: false } })
  })

  test('eq on datetime coerces to Date', () => {
    const w = where({ createdAt: 'eq:2025-06-01T12:00:00Z' })
    const clause = w.createdAt as { equals: Date }
    expect(clause.equals).toBeInstanceOf(Date)
    expect(clause.equals.toISOString()).toBe('2025-06-01T12:00:00.000Z')
  })

  test('eq on enum keeps the raw enum name', () => {
    expect(where({ region: 'eq:eu' })).toEqual({ region: { equals: 'eu' } })
  })

  test('eq with invalid number falls back to raw string (Prisma rejects)', () => {
    // Documents current behaviour: invalid coercion is passed through.
    expect(where({ age: 'eq:not-a-number' })).toEqual({
      age: { equals: 'not-a-number' },
    })
  })
})

describe('filterToWhere — neq operator', () => {
  test('neq on string → notIn + insensitive mode', () => {
    expect(where({ name: 'neq:John' })).toEqual({
      name: { notIn: ['John'], mode: 'insensitive' },
    })
  })

  test('neq on int → not: coerced number', () => {
    expect(where({ age: 'neq:42' })).toEqual({ age: { not: 42 } })
  })

  test('neq on boolean', () => {
    expect(where({ active: 'neq:true' })).toEqual({ active: { not: true } })
  })
})

describe('filterToWhere — co operator', () => {
  test('co on string → contains + insensitive', () => {
    expect(where({ name: 'co:joh' })).toEqual({
      name: { contains: 'joh', mode: 'insensitive' },
    })
  })

  test('co preserves SQL wildcard characters as literal (Prisma escapes them)', () => {
    expect(where({ name: 'co:50%' })).toEqual({
      name: { contains: '50%', mode: 'insensitive' },
    })
  })

  test('co preserves underscore wildcard', () => {
    expect(where({ name: 'co:foo_bar' })).toEqual({
      name: { contains: 'foo_bar', mode: 'insensitive' },
    })
  })

  test('co on unicode', () => {
    expect(where({ name: 'co:Москва' })).toEqual({
      name: { contains: 'Москва', mode: 'insensitive' },
    })
  })

  test('co on numeric field is dropped (Prisma cannot `contains` an Int)', () => {
    // Fixed: non-string columns never receive `contains` clauses. The
    // whole filter element is silently dropped — preferable to a 500.
    expect(where({ age: 'co:4' })).toEqual({})
  })
})

describe('filterToWhere — nco operator', () => {
  test('nco emits a top-level NOT clause', () => {
    expect(where({ name: 'nco:spam' })).toEqual({
      AND: [
        {},
        { NOT: { name: { contains: 'spam', mode: 'insensitive' } } },
      ],
    })
  })

  test('nco combined with another filter merges via AND', () => {
    expect(where({ name: 'nco:spam', age: 'eq:30' })).toEqual({
      AND: [
        { age: { equals: 30 } },
        { NOT: { name: { contains: 'spam', mode: 'insensitive' } } },
      ],
    })
  })
})

describe('filterToWhere — sw / ew operators', () => {
  test('sw on string', () => {
    expect(where({ name: 'sw:Pro' })).toEqual({
      name: { startsWith: 'Pro', mode: 'insensitive' },
    })
  })

  test('ew on string', () => {
    expect(where({ name: 'ew:Inc' })).toEqual({
      name: { endsWith: 'Inc', mode: 'insensitive' },
    })
  })

  test('sw on numeric field is dropped (Prisma cannot `startsWith` an Int)', () => {
    expect(where({ age: 'sw:4' })).toEqual({})
  })
})

describe('filterToWhere — gt / lt operators', () => {
  test('gt on int coerces', () => {
    expect(where({ age: 'gt:18' })).toEqual({ age: { gt: 18 } })
  })

  test('lt on float coerces via parseFloat', () => {
    expect(where({ price: 'lt:9.99' })).toEqual({ price: { lt: 9.99 } })
  })

  test('gt on datetime coerces to Date', () => {
    const w = where({ createdAt: 'gt:2025-01-01' })
    const clause = w.createdAt as { gt: Date }
    expect(clause.gt).toBeInstanceOf(Date)
  })

  test('gt with negative number', () => {
    expect(where({ price: 'gt:-5.5' })).toEqual({ price: { gt: -5.5 } })
  })

  test('gt with zero', () => {
    expect(where({ age: 'gt:0' })).toEqual({ age: { gt: 0 } })
  })

  test('lt with very large number stays as Number (precision loss possible for BigInt)', () => {
    // Documents that BigInt fields lose precision because converter uses Number().
    // For Postgres BIGINT this matters past 2^53.
    expect(where({ big: 'gt:9007199254740993' })).toEqual({
      big: { gt: 9007199254740992 },                                 // off by 1
    })
  })
})

describe('filterToWhere — between operator', () => {
  test('between with from + to on int', () => {
    expect(where({ age: 'between:18,65' })).toEqual({
      age: { gte: 18, lte: 65 },
    })
  })

  test('between with only from', () => {
    expect(where({ age: 'between:18,' })).toEqual({ age: { gte: 18 } })
  })

  test('between with only to', () => {
    expect(where({ age: 'between:,65' })).toEqual({ age: { lte: 65 } })
  })

  test('between on float', () => {
    expect(where({ price: 'between:1.5,9.99' })).toEqual({
      price: { gte: 1.5, lte: 9.99 },
    })
  })

  test('between on datetime bumps the upper bound to end-of-day', () => {
    const w = where({ createdAt: 'between:2025-01-01,2025-12-31' })
    const clause = w.createdAt as { gte: Date; lte: Date }
    expect(clause.gte).toBeInstanceOf(Date)
    expect(clause.lte).toBeInstanceOf(Date)
    expect(clause.gte.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    // Fixed: the `to` bound for a yyyy-MM-dd input is bumped to
    // 23:59:59.999 of the same day so the user-visible "up to 2025-12-31"
    // actually includes rows timestamped later that day.
    expect(clause.lte.toISOString()).toBe('2025-12-31T23:59:59.999Z')
  })

  test('between with both bounds empty drops the clause entirely', () => {
    expect(where({ age: 'between:,' })).toEqual({})
  })

  test('between with negative range', () => {
    expect(where({ price: 'between:-10,-1' })).toEqual({
      price: { gte: -10, lte: -1 },
    })
  })
})

describe('filterToWhere — in operator', () => {
  test('in with comma-separated string on int (parsed as array by Filter)', () => {
    // The Filter constructor splits `in:a,b,c` into an array of strings.
    expect(where({ age: 'in:18,21,30' })).toEqual({
      age: { in: [18, 21, 30] },
    })
  })

  test('in with single value on string', () => {
    expect(where({ name: 'in:Alice' })).toEqual({ name: { in: ['Alice'] } })
  })

  test('in with empty string after operator → no filter applied', () => {
    // `field=in:` arrives when the user unchecks the last item in the
    // "Is one of" picker. The adapter drops the clause entirely so the
    // unfiltered list is returned, matching the Drizzle behaviour. The
    // previous "match nothing" semantics surprised users who expected
    // the picker to behave like a no-op when empty.
    expect(where({ name: 'in:' })).toEqual({})
  })

  test('in on scalar list field uses hasSome', () => {
    expect(where({ tags: 'in:red,blue' })).toEqual({
      tags: { hasSome: ['red', 'blue'] },
    })
  })

  test('in on enum keeps the raw values', () => {
    expect(where({ region: 'in:eu,us' })).toEqual({
      region: { in: ['eu', 'us'] },
    })
  })
})

describe('filterToWhere — empty / nempty operators', () => {
  test('empty on string → OR(null, "")', () => {
    expect(where({ name: 'empty:' })).toEqual({
      AND: [
        {},
        { OR: [{ name: null }, { name: '' }] },
      ],
    })
  })

  test('empty on non-string → simple null check', () => {
    expect(where({ age: 'empty:' })).toEqual({
      AND: [{}, { age: null }],
    })
  })

  test('nempty on string → both NOT(null) and NOT("")', () => {
    expect(where({ name: 'nempty:' })).toEqual({
      AND: [
        {},
        { NOT: { name: null } },
        { NOT: { name: '' } },
      ],
    })
  })

  test('nempty on non-string → single NOT(null)', () => {
    expect(where({ age: 'nempty:' })).toEqual({
      AND: [{}, { NOT: { age: null } }],
    })
  })

  test('empty on array field uses Prisma `isEmpty: true`', () => {
    // Fixed: array (isList) columns now route to `{isEmpty: true}`,
    // the only valid empty-check for Prisma scalar lists.
    expect(where({ tags: 'empty:' })).toEqual({ tags: { isEmpty: true } })
  })

  test('nempty on array field uses Prisma `isEmpty: false`', () => {
    expect(where({ tags: 'nempty:' })).toEqual({ tags: { isEmpty: false } })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. LEGACY (no-operator) IMPLICIT BEHAVIOUR
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — implicit (no operator)', () => {
  test('string → contains + insensitive (legacy)', () => {
    expect(where({ name: 'John' })).toEqual({
      name: { contains: 'John', mode: 'insensitive' },
    })
  })

  test('number → equals', () => {
    expect(where({ age: '42' })).toEqual({ age: { equals: 42 } })
  })

  test('boolean string → coerced + equals', () => {
    expect(where({ active: 'true' })).toEqual({ active: { equals: true } })
  })

  test('datetime string → equals Date', () => {
    const w = where({ createdAt: '2025-06-01' })
    expect((w.createdAt as { equals: Date }).equals).toBeInstanceOf(Date)
  })

  test('range qualifier ~~from / ~~to → gte / lte on datetime', () => {
    const w = where({
      'createdAt~~from': '2025-01-01',
      'createdAt~~to': '2025-12-31',
    })
    const clause = w.createdAt as { gte: Date; lte: Date }
    expect(clause.gte).toBeInstanceOf(Date)
    expect(clause.lte).toBeInstanceOf(Date)
  })

  test('range qualifier on integer field', () => {
    const w = where({ 'age~~from': '18', 'age~~to': '65' })
    expect(w.age).toEqual({ gte: 18, lte: 65 })
  })

  test('range qualifier with only ~~from', () => {
    expect(where({ 'age~~from': '18' })).toEqual({ age: { gte: 18 } })
  })

  test('range qualifier with empty string is dropped', () => {
    expect(where({ 'age~~from': '', 'age~~to': '65' })).toEqual({
      age: { lte: 65 },
    })
  })

  test('array value on scalar field → in', () => {
    expect(where({ age: ['18', '21'] })).toEqual({ age: { in: [18, 21] } })
  })

  test('array value on list field → hasSome', () => {
    expect(where({ tags: ['red', 'blue'] })).toEqual({
      tags: { hasSome: ['red', 'blue'] },
    })
  })

  test('single value on list field → has', () => {
    expect(where({ tags: 'red' })).toEqual({ tags: { has: 'red' } })
  })

  test('unknown field is silently skipped', () => {
    expect(where({ doesNotExist: 'foo' })).toEqual({})
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. RELATION (object-kind) FILTERS
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — relation filters', () => {
  test('relation field with scalar value emits {is: {id: {equals: v}}}', () => {
    // Filtering by the `author` relation path with a scalar id.
    expect(where({ author: 'user-42' })).toEqual({
      author: { is: { id: { equals: 'user-42' } } },
    })
  })

  test('foreign-key column (authorId) is promoted to uuid → exact equals', () => {
    // `authorId` matches the `Id$` heuristic in `property.ts:resolveType`
    // and is treated as type='uuid' rather than 'string'. That means no
    // substring `contains` lookup — implicit values become `equals`.
    expect(where({ authorId: 'user-42' })).toEqual({
      authorId: { equals: 'user-42' },
    })
  })

  test('foreign-key with eq operator → exact equals (no insensitive mode)', () => {
    // Same reason as above — uuid type, so the `isString` branch in
    // `buildOperatorClause` doesn't fire and no `mode` is added.
    expect(where({ authorId: 'eq:user-42' })).toEqual({
      authorId: { equals: 'user-42' },
    })
  })

  test('foreign-key with in operator', () => {
    expect(where({ authorId: 'in:u1,u2,u3' })).toEqual({
      authorId: { in: ['u1', 'u2', 'u3'] },
    })
  })

  test('relation field with empty-string value is dropped', () => {
    // Fixed: the empty string the URL produces for a cleared reference
    // picker no longer emits a spurious `{equals: ''}` (which would 500
    // on UUID/Int FK columns) — the entire filter element is dropped.
    expect(where({ author: '' })).toEqual({})
  })

  test('relation field with explicit operator is silently ignored', () => {
    // BUG MARKER: the relation branch fires BEFORE operator handling, so
    // any operator-prefixed value on a relation path falls through to the
    // scalar-equals path, losing the operator semantics.
    expect(where({ author: 'eq:user-42' })).toEqual({
      author: { is: { id: { equals: 'user-42' } } },
    })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4. MULTI-FIELD COMBINATIONS
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — multi-field combinations', () => {
  test('two simple field filters become two keys on the same where', () => {
    expect(where({ name: 'Alice', age: '30' })).toEqual({
      name: { contains: 'Alice', mode: 'insensitive' },
      age: { equals: 30 },
    })
  })

  test('mixing operators and implicit filters', () => {
    expect(where({ name: 'co:smith', age: 'gt:18', active: 'eq:true' })).toEqual({
      name: { contains: 'smith', mode: 'insensitive' },
      age: { gt: 18 },
      active: { equals: true },
    })
  })

  test('range + scalar combined', () => {
    expect(
      where({
        'createdAt~~from': '2025-01-01',
        active: 'eq:true',
      }),
    ).toMatchObject({
      active: { equals: true },
      createdAt: expect.anything(),
    })
  })

  test('two top-level operators combine under AND', () => {
    const w = where({ name: 'nco:spam', nick: 'empty:' })
    // Both `nco` and `empty` go to top-level, so AND has 3 entries
    // (base where {}, NOT for nco, OR for nempty).
    expect(w).toEqual({
      AND: [
        {},
        { NOT: { name: { contains: 'spam', mode: 'insensitive' } } },
        { OR: [{ nick: null }, { nick: '' }] },
      ],
    })
  })

  test('field-level + top-level operator merged via AND', () => {
    expect(where({ age: 'gt:18', name: 'empty:' })).toEqual({
      AND: [
        { age: { gt: 18 } },
        { OR: [{ name: null }, { name: '' }] },
      ],
    })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 5. ARRAY (isList) FIELD EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — scalar list (isArray) fields', () => {
  test('eq on list field uses `has` (any element equals)', () => {
    // Fixed: `eq:red` on `String[]` is now interpreted as element-wise
    // contains — `{has: 'red'}` is the canonical Prisma list match.
    expect(where({ tags: 'eq:red' })).toEqual({ tags: { has: 'red' } })
  })

  test('co/sw/ew on list field are dropped (no Prisma list equivalent)', () => {
    // Fixed: these operators have no element-wise list counterpart, so
    // the clause is dropped rather than emitting an invalid where.
    expect(where({ tags: 'co:red' })).toEqual({})
    expect(where({ tags: 'sw:re' })).toEqual({})
    expect(where({ tags: 'ew:ed' })).toEqual({})
  })

  test('in on list field with single value uses `hasSome`', () => {
    expect(where({ tags: 'in:red' })).toEqual({ tags: { hasSome: ['red'] } })
  })

  test('implicit array value on Int[] coerces each element', () => {
    expect(where({ scores: ['1', '2', '3'] })).toEqual({
      scores: { hasSome: [1, 2, 3] },
    })
  })

  test('implicit single value on Int[] coerces and uses has', () => {
    expect(where({ scores: '5' })).toEqual({ scores: { has: 5 } })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 6. EDGE CASES AND SECURITY
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — edge cases', () => {
  test('empty filter object yields empty where', () => {
    expect(where({})).toEqual({})
  })

  test('field with empty-string value is dropped (implicit branch)', () => {
    // Filter constructor preserves empty strings; converter passes them through.
    // For a String field the result is `{contains: '', mode: insensitive}`
    // which Prisma rewrites as "match anything". Documents the behaviour.
    expect(where({ name: '' })).toEqual({
      name: { contains: '', mode: 'insensitive' },
    })
  })

  test('null-ish values come through as is', () => {
    // The Filter constructor coerces undefined → undefined and skips it.
    expect(where({ age: '0' })).toEqual({ age: { equals: 0 } })
  })

  test('SQL-injection-ish payload is passed verbatim — Prisma parameterizes', () => {
    expect(where({ name: "co:'; DROP TABLE customers; --" })).toEqual({
      name: {
        contains: "'; DROP TABLE customers; --",
        mode: 'insensitive',
      },
    })
  })

  test('extremely long value passes through', () => {
    const long = 'x'.repeat(10_000)
    expect(where({ name: `co:${long}` })).toEqual({
      name: { contains: long, mode: 'insensitive' },
    })
  })

  test('boolean coerce of non-true/non-1 string yields false', () => {
    // Documents that `eq:no` collapses to `{equals: false}` rather than
    // erroring. Could hide typos in URLs.
    expect(where({ active: 'eq:no' })).toEqual({ active: { equals: false } })
  })

  test('whitespace around values is preserved (no trim)', () => {
    expect(where({ name: '  John  ' })).toEqual({
      name: { contains: '  John  ', mode: 'insensitive' },
    })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 7. NESTED PATHS
// ════════════════════════════════════════════════════════════════════════════

describe('filterToWhere — nested paths', () => {
  test('dotted path on a relation builds a nested `is: { <field>: ... }` clause', () => {
    // Fixed: `filters[author.name]=Alice` → Filter unflattens to
    // `{author: {name: 'Alice'}}`, and the converter now translates the
    // nested object into a proper Prisma relation filter rather than
    // dumping it as `{id: {equals: <object>}}`.
    expect(where({ 'author.name': 'Alice' })).toEqual({
      author: { is: { name: { contains: 'Alice', mode: 'insensitive' } } },
    })
  })

  test('multiple nested fields on the same relation merge under one `is`', () => {
    expect(where({ 'author.name': 'Alice', 'author.email': 'a@b.c' })).toEqual({
      author: {
        is: {
          name: { contains: 'Alice', mode: 'insensitive' },
          email: { contains: 'a@b.c', mode: 'insensitive' },
        },
      },
    })
  })

  test('nested path with empty value drops the relation clause', () => {
    expect(where({ 'author.name': '' })).toEqual({})
  })
})
