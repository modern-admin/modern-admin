// Deep coverage for PrismaResource.create / update — specifically the
// `writableData` coercion pipeline that turns raw payload values from the
// transport layer into a Prisma-compatible `data:` argument.
//
// What we want to catch here:
//   • DateTime normalisation (datetime-local strings, Date objects,
//     invalid strings, empty strings, ISO round-trip idempotence).
//   • Required-vs-null filtering.
//   • Read-only field handling (FKs preserved, computed dropped).
//   • Relation (`kind: 'object'`) fields stripped on every shape.
//   • Enum / Json / Boolean / number scalars passed through unchanged.
//   • Array (`isList`) scalar columns passed through.
//   • Partial update preserves untouched keys (doesn't accidentally
//     overwrite with `undefined`).
//   • Prisma error → ValidationError translation for both P2002 and P2003.
//
// Tests intentionally assert on the args passed to the fake delegate
// (`delegate.calls.at(-1)?.args`) rather than the post-state — that lets
// each test target the converter behaviour without leaking the fake
// store's semantics into the expectations.

import { describe, expect, test } from 'bun:test'
import { ValidationError } from '@modern-admin/core'
import { PrismaResource } from '../src/resource.js'
import type { DmmfEnum, DmmfField, DmmfModel } from '../src/types.js'
import { createClient, createDelegate, type FakeDelegate } from './_helpers/fake-client.js'

// ─── DMMF builders ────────────────────────────────────────────────────────

const f = (overrides: Partial<DmmfField>): DmmfField => ({
  name: overrides.name ?? 'field',
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

// A wide model that exercises every scalar branch + a relation + an enum.
const wideModel: DmmfModel = {
  name: 'Product',
  fields: [
    f({ name: 'id', type: 'String', isId: true, isRequired: true, hasDefaultValue: true }),
    f({ name: 'name', type: 'String', isRequired: true }),
    f({ name: 'description', type: 'String' }),
    f({ name: 'price', type: 'Float' }),
    f({ name: 'quantity', type: 'Int' }),
    f({ name: 'rating', type: 'Decimal' }),
    f({ name: 'big', type: 'BigInt' }),
    f({ name: 'inStock', type: 'Boolean', isRequired: true, hasDefaultValue: true }),
    f({ name: 'launchedAt', type: 'DateTime' }),
    f({ name: 'createdAt', type: 'DateTime', isRequired: true, hasDefaultValue: true }),
    f({ name: 'metadata', type: 'Json' }),
    f({ name: 'gallery', type: 'String', isList: true }),
    f({ name: 'currency', kind: 'enum', type: 'Currency' }),
    f({ name: 'tier', kind: 'enum', type: 'Tier', isRequired: true, hasDefaultValue: true }),
    // FK backing the relation — read-only but still writable.
    f({ name: 'categoryId', type: 'String', isReadOnly: true }),
    f({
      name: 'category',
      kind: 'object',
      type: 'Category',
      relationName: 'ProductCategory',
      relationFromFields: ['categoryId'],
      relationToFields: ['id'],
    }),
    // Pure computed field — read-only, not backing any relation. Should be
    // stripped on writes.
    f({ name: 'computed', type: 'String', isReadOnly: true }),
  ],
}

const currencyEnum: DmmfEnum = {
  name: 'Currency',
  values: [{ name: 'USD' }, { name: 'EUR' }, { name: 'RUB' }],
}
const tierEnum: DmmfEnum = {
  name: 'Tier',
  values: [{ name: 'free' }, { name: 'pro' }],
}

// Int-id model (for id-casting tests).
const intIdModel: DmmfModel = {
  name: 'Counter',
  fields: [
    f({ name: 'id', type: 'Int', isId: true, isRequired: true, hasDefaultValue: true }),
    f({ name: 'value', type: 'Int' }),
  ],
}

interface Built {
  resource: PrismaResource
  delegate: FakeDelegate
}

const buildWide = (initial: Array<Record<string, unknown>> = []): Built => {
  const delegate = createDelegate(initial)
  const client = createClient({ product: delegate })
  const resource = new PrismaResource({
    model: wideModel,
    client,
    enums: [currencyEnum, tierEnum],
  })
  return { resource, delegate }
}

const buildIntId = (initial: Array<Record<string, unknown>> = []): Built => {
  const delegate = createDelegate(initial)
  const client = createClient({ counter: delegate })
  const resource = new PrismaResource({ model: intIdModel, client })
  return { resource, delegate }
}

const lastData = (d: FakeDelegate): Record<string, unknown> =>
  (d.calls.at(-1)?.args as { data: Record<string, unknown> }).data

const lastWhere = (d: FakeDelegate): Record<string, unknown> =>
  (d.calls.at(-1)?.args as { where: Record<string, unknown> }).where

// ─── DateTime normalisation ───────────────────────────────────────────────

describe('writableData — DateTime coercion', () => {
  test('full ISO string is preserved (round-trip idempotent)', async () => {
    const { resource, delegate } = buildWide()
    const iso = '2025-03-14T15:09:26.535Z'
    await resource.create({ name: 'A', launchedAt: iso })
    expect(lastData(delegate).launchedAt).toBe(iso)
  })

  test('datetime-local format (no seconds, no tz) becomes a full ISO', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', launchedAt: '2025-03-14T15:09' })
    const out = lastData(delegate).launchedAt
    expect(typeof out).toBe('string')
    // Resulting string must be parseable AND complete (Z suffix).
    expect(String(out).endsWith('Z')).toBe(true)
    expect(new Date(String(out)).toISOString()).toBe(out as string)
  })

  test('date-only YYYY-MM-DD becomes a full ISO at midnight UTC', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', launchedAt: '2025-03-14' })
    const out = String(lastData(delegate).launchedAt)
    expect(out.startsWith('2025-03-14')).toBe(true)
    expect(out.endsWith('Z')).toBe(true)
  })

  test('invalid string falls through unchanged (Prisma will surface the error)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', launchedAt: 'not-a-date' })
    expect(lastData(delegate).launchedAt).toBe('not-a-date')
  })

  test('Date object is preserved (not stringified)', async () => {
    const { resource, delegate } = buildWide()
    const d = new Date('2025-01-01T00:00:00.000Z')
    await resource.create({ name: 'A', launchedAt: d })
    expect(lastData(delegate).launchedAt).toBeInstanceOf(Date)
  })

  test('null on a nullable DateTime is preserved (clears the column)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', launchedAt: null })
    expect(lastData(delegate).launchedAt).toBeNull()
  })

  test('empty string on a nullable DateTime is normalised to null', async () => {
    // The form (DatePicker) emits null on clear, but direct API consumers
    // can send `""` for the same intent. Forwarding a literal empty string
    // to Prisma 7 yields a 500 ("Invalid value for argument 'launchedAt':
    // expected DateTime, got String"). The adapter MUST normalise it.
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', launchedAt: '' })
    expect(lastData(delegate).launchedAt).toBeNull()
  })

  test('null on a required DateTime is dropped (DB default fires)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', createdAt: null })
    expect('createdAt' in lastData(delegate)).toBe(false)
  })
})

// ─── Required vs null filtering ───────────────────────────────────────────

describe('writableData — null + required handling', () => {
  test('null on a required scalar with a default is dropped (so the default fires)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', tier: null, inStock: null })
    const data = lastData(delegate)
    expect('tier' in data).toBe(false)
    expect('inStock' in data).toBe(false)
  })

  test('null on an optional scalar IS persisted (clears the column)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', description: null, price: null })
    const data = lastData(delegate)
    expect(data.description).toBeNull()
    expect(data.price).toBeNull()
  })

  test('empty string on a required enum is dropped (avoid Prisma "invalid value" 500)', async () => {
    // The Select editor with the `_empty_` placeholder emits `''` when the
    // user picks the dash option. For a required enum the adapter MUST drop
    // it so the column @default fires instead of Prisma erroring.
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', tier: '' })
    expect('tier' in lastData(delegate)).toBe(false)
  })

  test('empty string on an optional enum becomes null (clear semantic)', async () => {
    // Optional enum columns accept null to unset. The transport may send
    // `''`; forwarding it raw is invalid Prisma — coerce to null.
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', currency: '' })
    expect(lastData(delegate).currency).toBeNull()
  })
})

// ─── Read-only + relation stripping ───────────────────────────────────────

describe('writableData — relation/read-only handling', () => {
  test('relation field (`kind: object`) is stripped on create', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({
      name: 'A',
      categoryId: 'cat-1',
      category: { connect: { id: 'cat-1' } },
    })
    const data = lastData(delegate)
    expect('category' in data).toBe(false)
    expect(data.categoryId).toBe('cat-1')
  })

  test('relation field is stripped on update (FK kept)', async () => {
    const { resource, delegate } = buildWide([{ id: '1', name: 'A' }])
    await resource.update('1', {
      categoryId: 'cat-2',
      category: { whatever: 1 },
    })
    const data = lastData(delegate)
    expect('category' in data).toBe(false)
    expect(data.categoryId).toBe('cat-2')
  })

  test('pure computed read-only column is stripped', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', computed: 'do not save' })
    expect('computed' in lastData(delegate)).toBe(false)
  })

  test('absent FK is not invented (no `categoryId: undefined`)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A' })
    expect('categoryId' in lastData(delegate)).toBe(false)
  })
})

// ─── Scalar passthroughs ──────────────────────────────────────────────────

describe('writableData — scalar passthroughs', () => {
  test('Json column accepts object, array, primitive, and null', async () => {
    const { resource, delegate } = buildWide()

    await resource.create({ name: 'A', metadata: { foo: 1, nested: { ok: true } } })
    expect(lastData(delegate).metadata).toEqual({ foo: 1, nested: { ok: true } })

    await resource.create({ name: 'A', metadata: [1, 2, 3] })
    expect(lastData(delegate).metadata).toEqual([1, 2, 3])

    await resource.create({ name: 'A', metadata: 'just a string' })
    expect(lastData(delegate).metadata).toBe('just a string')

    await resource.create({ name: 'A', metadata: null })
    expect(lastData(delegate).metadata).toBeNull()
  })

  test('Boolean false is persisted (not treated as missing)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', inStock: false })
    expect(lastData(delegate).inStock).toBe(false)
  })

  test('Int / Float / Decimal scalar values pass through; numeric strings get coerced', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({
      name: 'A',
      quantity: 42,
      price: 19.99,
      rating: '4.5',
      big: '9007199254740993', // > Number.MAX_SAFE_INTEGER
    })
    const data = lastData(delegate)
    expect(data.quantity).toBe(42)
    expect(data.price).toBe(19.99)
    // Decimal columns accept either Decimal/string/number; we coerce
    // numeric strings to JS numbers so form-encoded payloads
    // (`rating=4.5`) make it past Prisma 7's strict type checker.
    expect(data.rating).toBe(4.5)
    // BigInt columns receive a BigInt instance (Prisma 7 rejects the
    // numeric string and would also lose precision for values above
    // `Number.MAX_SAFE_INTEGER`).
    expect(typeof data.big).toBe('bigint')
    expect(data.big).toBe(BigInt('9007199254740993'))
  })

  test('scalar array (`String[]`) is persisted as an array', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', gallery: ['a.png', 'b.png'] })
    expect(lastData(delegate).gallery).toEqual(['a.png', 'b.png'])
  })

  test('empty scalar array is persisted (clears the column)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', gallery: [] })
    expect(lastData(delegate).gallery).toEqual([])
  })
})

// ─── Partial update preserves untouched keys ──────────────────────────────

describe('update — partial payload semantics', () => {
  test('omitted keys are not sent in `data` (Prisma keeps the column)', async () => {
    const { resource, delegate } = buildWide([
      { id: '1', name: 'Old', price: 10 },
    ])
    await resource.update('1', { price: 20 })
    const data = lastData(delegate)
    expect(Object.keys(data)).toEqual(['price'])
    expect(data.price).toBe(20)
  })

  test('explicit `undefined` value is also omitted (not coerced to null)', async () => {
    const { resource, delegate } = buildWide([{ id: '1', name: 'Old' }])
    // The `in` check is positive for `undefined` values too — but the
    // adapter must not turn that into a Prisma `null`. Either drop the
    // key or pass undefined through, both are fine; what's NOT fine is
    // producing `data.price = null`.
    await resource.update('1', { price: undefined })
    const data = lastData(delegate)
    expect(data.price).toBeUndefined()
  })
})

// ─── ID casting ───────────────────────────────────────────────────────────

describe('id casting', () => {
  test('Int id model: string id is cast to Number before findUnique', async () => {
    const { resource, delegate } = buildIntId([{ id: 7, value: 1 }])
    await resource.findOne('7')
    expect(lastWhere(delegate)).toEqual({ id: 7 })
  })

  test('Int id model: numeric id stays numeric', async () => {
    const { resource, delegate } = buildIntId([{ id: 7, value: 1 }])
    await resource.findOne('7')
    expect(typeof (lastWhere(delegate).id)).toBe('number')
  })

  test('Int id model: non-numeric string is preserved as-is (Prisma surfaces the error)', async () => {
    const { resource, delegate } = buildIntId()
    await resource.findOne('abc').catch(() => null)
    expect(lastWhere(delegate).id).toBe('abc')
  })

  test('String id model: id is forwarded verbatim', async () => {
    const { resource, delegate } = buildWide([{ id: '01963c44', name: 'A' }])
    await resource.findOne('01963c44')
    expect(lastWhere(delegate)).toEqual({ id: '01963c44' })
  })

  test('findMany applies the same cast to every id in the list', async () => {
    const { resource, delegate } = buildIntId([
      { id: 1, value: 10 },
      { id: 2, value: 20 },
      { id: 3, value: 30 },
    ])
    await resource.findMany(['1', 2, '3'])
    const where = (delegate.calls.at(-1)?.args as { where: { id: { in: unknown[] } } }).where
    expect(where.id.in).toEqual([1, 2, 3])
  })
})

// ─── Prisma error mapping ─────────────────────────────────────────────────

describe('toValidationError', () => {
  test('P2002 unique violation maps to ValidationError with per-field entries', async () => {
    const { resource, delegate } = buildWide()
    delegate.nextError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['email', 'name'] },
    })
    try {
      await resource.create({ name: 'dup' })
      throw new Error('expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(Object.keys(ve.propertyErrors)).toEqual(['email', 'name'])
      expect(ve.propertyErrors.email!.type).toBe('unique')
    }
  })

  test('P2003 FK violation maps to ValidationError on the offending field', async () => {
    const { resource, delegate } = buildWide()
    delegate.nextError = Object.assign(new Error('Foreign key constraint failed'), {
      code: 'P2003',
      meta: { field_name: 'categoryId' },
    })
    try {
      await resource.create({ name: 'A', categoryId: 'missing' })
      throw new Error('expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.propertyErrors.categoryId!.type).toBe('foreignKey')
    }
  })

  test('unknown Prisma errors propagate unchanged', async () => {
    const { resource, delegate } = buildWide()
    const original = Object.assign(new Error('boom'), { code: 'P9999' })
    delegate.nextError = original
    try {
      await resource.create({ name: 'A' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBe(original)
    }
  })

  test('non-Prisma errors propagate unchanged', async () => {
    const { resource, delegate } = buildWide()
    const original = new TypeError('not a prisma error')
    delegate.nextError = original
    try {
      await resource.create({ name: 'A' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBe(original)
    }
  })

  test('PrismaClientValidationError "Argument is missing" → ValidationError(required)', async () => {
    // Prisma 7 emits this when a required arg has no value. Without
    // mapping it would surface as a 500 instead of a per-field 400.
    const { resource, delegate } = buildWide()
    const err = new Error(
      'Invalid `this.delegate().create()` invocation\n\nArgument `email` is missing.',
    )
    err.name = 'PrismaClientValidationError'
    delegate.nextError = err
    try {
      await resource.create({ name: 'A' })
      throw new Error('expected ValidationError')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ValidationError)
      const ve = caught as ValidationError
      expect(ve.propertyErrors.email!.type).toBe('required')
    }
  })

  test('PrismaClientValidationError "Invalid value provided" → ValidationError(invalid)', async () => {
    const { resource, delegate } = buildWide()
    const err = new Error(
      'Invalid `this.delegate().create()` invocation\n\nArgument `inStock`: Invalid value provided. Expected Boolean, provided String.',
    )
    err.name = 'PrismaClientValidationError'
    delegate.nextError = err
    try {
      await resource.create({ name: 'A', inStock: 'true' as unknown as boolean })
      throw new Error('expected ValidationError')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ValidationError)
      const ve = caught as ValidationError
      expect(ve.propertyErrors.inStock!.type).toBe('invalid')
    }
  })
})

// ─── Form-encoded scalar coercion ─────────────────────────────────────────

describe('writableData — form-encoded scalar coercion', () => {
  // Multipart / urlencoded payloads serialise every value as a string.
  // Prisma 7 strictly type-checks scalar arguments and rejects with a
  // PrismaClientValidationError (= 500 without mapping) for boolean,
  // int, float and bigint columns. The adapter must coerce these.

  test('Boolean: "true" / "false" → real booleans', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({
      name: 'A',
      inStock: 'true' as unknown as boolean,
    })
    expect(lastData(delegate).inStock).toBe(true)

    await resource.create({
      name: 'B',
      inStock: 'false' as unknown as boolean,
    })
    expect(lastData(delegate).inStock).toBe(false)
  })

  test('Boolean: "1" / "0" → real booleans', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', inStock: '1' as unknown as boolean })
    expect(lastData(delegate).inStock).toBe(true)
    await resource.create({ name: 'B', inStock: '0' as unknown as boolean })
    expect(lastData(delegate).inStock).toBe(false)
  })

  test('Boolean: "on" (HTML checkbox default) → true', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', inStock: 'on' as unknown as boolean })
    expect(lastData(delegate).inStock).toBe(true)
  })

  test('Int: numeric string coerced to number; non-integer falls through', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', quantity: '42' as unknown as number })
    expect(lastData(delegate).quantity).toBe(42)
    await resource.create({ name: 'A', quantity: 'not-a-number' as unknown as number })
    // Falls through → Prisma will surface the validation error.
    expect(lastData(delegate).quantity).toBe('not-a-number')
  })

  test('Float / Decimal: numeric string coerced to number', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', price: '19.99' as unknown as number })
    expect(lastData(delegate).price).toBe(19.99)
    await resource.create({ name: 'A', rating: '4.25' as unknown as number })
    expect(lastData(delegate).rating).toBe(4.25)
  })

  test('BigInt: numeric string coerced to BigInt (preserves precision)', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', big: '9007199254740993' as unknown as bigint })
    const out = lastData(delegate).big
    expect(typeof out).toBe('bigint')
    expect(out).toBe(BigInt('9007199254740993'))
  })

  test('String: identical string passes through unchanged', async () => {
    const { resource, delegate } = buildWide()
    await resource.create({ name: 'A', description: 'plain text' })
    expect(lastData(delegate).description).toBe('plain text')
  })
})

// ─── End-to-end create + read symmetry ────────────────────────────────────

describe('create → read round-trip', () => {
  test('a wide payload survives the round-trip with every field intact', async () => {
    const { resource } = buildWide()
    const rec = await resource.create({
      name: 'Wide',
      description: 'desc',
      price: 9.99,
      quantity: 3,
      rating: '4.5',
      inStock: true,
      launchedAt: '2025-01-01T12:00:00.000Z',
      metadata: { featured: true, tags: ['x', 'y'] },
      gallery: ['a.png', 'b.png'],
      currency: 'USD',
      tier: 'pro',
      categoryId: 'cat-1',
    })
    expect(rec.name).toBe('Wide')
    expect(rec.inStock).toBe(true)
    expect(rec.metadata).toEqual({ featured: true, tags: ['x', 'y'] })
    expect(rec.gallery).toEqual(['a.png', 'b.png'])
  })
})
