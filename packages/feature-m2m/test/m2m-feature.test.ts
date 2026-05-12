import { describe, expect, it } from 'bun:test'
import {
  BaseDatabase,
  BaseProperty,
  BaseRecord,
  BaseResource,
  Filter,
  ModernAdmin,
  type ActionRequest,
  type ActionResponse,
  type FindOptions,
  type ParamsType,
  type ResourceOptions,
} from '@modern-admin/core'
import { m2mFeature } from '../src/m2m-feature.js'

// ─── Tiny in-memory adapter (test harness) ───────────────────────────────────

interface Row { id: string; [k: string]: unknown }
interface Table {
  __testTable: true
  name: string
  properties: BaseProperty[]
  rows: Row[]
}

class TestResource extends BaseResource {
  constructor(private readonly table: Table) {
    super()
  }
  static override isAdapterFor(raw: unknown): boolean {
    return typeof raw === 'object' && raw !== null && (raw as Table).__testTable === true
  }
  override id(): string { return this.table.name }
  override databaseName(): string { return 'test' }
  override properties(): BaseProperty[] { return this.table.properties }
  override async count(filter: Filter): Promise<number> {
    return this.match(filter).length
  }
  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    const rows = this.match(filter).slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? this.table.rows.length))
    return rows.map((r) => new BaseRecord(r, this))
  }
  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.table.rows.find((r) => r.id === id)
    return row ? new BaseRecord(row, this) : null
  }
  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const set = new Set(ids.map(String))
    return this.table.rows.filter((r) => set.has(r.id)).map((r) => new BaseRecord(r, this))
  }
  override async create(params: ParamsType): Promise<ParamsType> {
    const id = String((params as Row).id ?? `${this.table.name}-${this.table.rows.length + 1}`)
    const row: Row = { ...(params as Row), id }
    this.table.rows.push(row)
    return row
  }
  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`row ${id} not found`)
    const next: Row = { ...this.table.rows[idx], ...params, id } as Row
    this.table.rows[idx] = next
    return next
  }
  override async delete(id: string): Promise<void> {
    const idx = this.table.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.table.rows.splice(idx, 1)
  }
  /** Exact-match filter: avoids in-memory substring quirk for FK lookups. */
  private match(filter: Filter): Row[] {
    return this.table.rows.filter((row) => {
      for (const [path, el] of Object.entries(filter.filters)) {
        if (String(row[path] ?? '') !== String(el.value)) return false
      }
      return true
    })
  }
}

class TestDatabase extends BaseDatabase {
  constructor(private readonly tables: Table[]) {
    super({ tables })
  }
  static override isAdapterFor(input: unknown): boolean {
    return typeof input === 'object' && input !== null && Array.isArray((input as { tables?: Table[] }).tables)
      && ((input as { tables: Table[] }).tables[0]?.__testTable === true)
  }
  override resources(): BaseResource[] { return this.tables.map((t) => new TestResource(t)) }
}

const tbl = (name: string, props: string[], rows: Row[] = []): Table => ({
  __testTable: true,
  name,
  properties: props.map((p) =>
    new BaseProperty({ path: p, type: 'string', ...(p === 'id' ? { isId: true } : {}) }),
  ),
  rows,
})

// `TestResource` requires a Table in its constructor but the adapter contract
// is the abstract zero-arg shape — cast through unknown so the test harness
// can plug it in without redoing the whole adapter API.
const adapter = {
  Database: TestDatabase,
  Resource: TestResource,
} as unknown as { Database: typeof BaseDatabase; Resource: typeof BaseResource }

// ─── Build admin instance helper ─────────────────────────────────────────────

interface BuildOpts {
  postOptions?: ResourceOptions
  postExtra?: ResourceOptions
}

const buildAdmin = (opts: BuildOpts = {}) => {
  const tagsTable = tbl('tags', ['id', 'name'], [
    { id: 't1', name: 'rust' },
    { id: 't2', name: 'go' },
    { id: 't3', name: 'ts' },
  ])
  const postsTable = tbl('posts', ['id', 'title'], [
    { id: 'p1', title: 'Hello' },
    { id: 'p2', title: 'World' },
  ])
  const postTagsTable = tbl('postTags', ['id', 'postId', 'tagId', 'addedAt', 'note'], [])

  const admin = new ModernAdmin({
    adapters: [adapter],
    resources: [
      { resource: tagsTable },
      { resource: postTagsTable },
      {
        resource: postsTable,
        features: [
          m2mFeature({
            property: 'tags',
            through: 'postTags',
            localKey: 'postId',
            foreignKey: 'tagId',
            reference: 'tags',
            extraFields: ['addedAt', 'note'],
          }),
        ],
        options: opts.postOptions,
      },
    ],
  })
  return {
    admin,
    posts: admin.findResource('posts'),
    tags: admin.findResource('tags'),
    junction: admin.findResource('postTags'),
    tagsTable,
    postsTable,
    postTagsTable,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('m2mFeature — virtual property registration', () => {
  it('registers a property of type "m2m" with reference + custom payload', () => {
    const { posts } = buildAdmin()
    const prop = posts.decorate().getPropertyByKey('tags')
    expect(prop).not.toBeNull()
    expect(prop!.type()).toBe('m2m')
    expect(prop!.toJSON().reference).toBe('tags')
    const custom = prop!.toJSON().custom as { m2m: Record<string, unknown> }
    expect(custom.m2m.through).toBe('postTags')
    expect(custom.m2m.localKey).toBe('postId')
    expect(custom.m2m.foreignKey).toBe('tagId')
    expect(custom.m2m.extraFields).toEqual(['addedAt', 'note'])
  })

  it('chains after-hooks (does not overwrite existing)', () => {
    const existing = async (r: ActionResponse) => r
    const { posts } = buildAdmin({ postOptions: { actions: { edit: { after: [existing] } } } })
    const merged = posts.decorate().actions.get('edit')!.merged
    const after = Array.isArray(merged.after) ? merged.after : [merged.after]
    expect(after.length).toBe(2)
  })
})

describe('m2mFeature — read hook', () => {
  it('hydrates record.params[property] with [{id, ...extras}]', async () => {
    const ctx = buildAdmin()
    // seed two junction rows
    await ctx.junction.create({ postId: 'p1', tagId: 't1', addedAt: '2024-01-01', note: 'rust' })
    await ctx.junction.create({ postId: 'p1', tagId: 't3', addedAt: '2024-02-01', note: 'ts' })

    const response = await ctx.admin.invoke({
      method: 'get',
      params: { resourceId: 'posts', recordId: 'p1', action: 'show' },
    }) as { record: { id: string; params: Record<string, unknown>; populated: Record<string, unknown> } }

    const items = response.record.params.tags as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id).sort()).toEqual(['t1', 't3'])
    const first = items.find((i) => i.id === 't1')!
    expect(first.note).toBe('rust')
    expect(first.addedAt).toBe('2024-01-01')

    expect(response.record.populated['tags.t1']).toBeDefined()
    expect(response.record.populated['tags.t3']).toBeDefined()
  })

  it('returns empty array when no junction rows exist', async () => {
    const ctx = buildAdmin()
    const response = await ctx.admin.invoke({
      method: 'get',
      params: { resourceId: 'posts', recordId: 'p2', action: 'show' },
    }) as { record: { params: Record<string, unknown>; populated: Record<string, unknown> } }
    expect(response.record.params.tags).toEqual([])
  })

  it('hydrates each record on list action', async () => {
    const ctx = buildAdmin()
    await ctx.junction.create({ postId: 'p1', tagId: 't1' })
    await ctx.junction.create({ postId: 'p2', tagId: 't2' })
    await ctx.junction.create({ postId: 'p2', tagId: 't3' })

    const response = await ctx.admin.invoke({
      method: 'get',
      params: { resourceId: 'posts', action: 'list' },
    }) as { records: Array<{ id: string; params: Record<string, unknown> }> }

    const byId = new Map(response.records.map((r) => [r.id, r]))
    expect((byId.get('p1')!.params.tags as unknown[]).length).toBe(1)
    expect((byId.get('p2')!.params.tags as unknown[]).length).toBe(2)
  })
})

describe('m2mFeature — write hook (diff)', () => {
  it('inserts new junction rows from id-strings', async () => {
    const ctx = buildAdmin()
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: { tags: ['t1', 't2'] } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows.length).toBe(2)
    expect(ctx.postTagsTable.rows.map((r) => r.tagId).sort()).toEqual(['t1', 't2'])
    expect(ctx.postTagsTable.rows.every((r) => r.postId === 'p1')).toBe(true)
  })

  it('inserts new junction rows from objects with extra fields', async () => {
    const ctx = buildAdmin()
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: {
        tags: [
          { id: 't1', addedAt: '2024-03-01', note: 'r' },
          { id: 't2', addedAt: '2024-03-02', note: 'g' },
        ],
      } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows).toHaveLength(2)
    const r1 = ctx.postTagsTable.rows.find((r) => r.tagId === 't1')!
    expect(r1.note).toBe('r')
    expect(r1.addedAt).toBe('2024-03-01')
  })

  it('parses flattened payload (tags.0.id / tags.0.note)', async () => {
    const ctx = buildAdmin()
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: {
        'tags.0.id': 't1',
        'tags.0.note': 'flat',
        'tags.1.id': 't3',
        'tags.1.note': 'flat3',
      } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows.map((r) => r.tagId).sort()).toEqual(['t1', 't3'])
    expect(ctx.postTagsTable.rows.find((r) => r.tagId === 't1')!.note).toBe('flat')
  })

  it('diffs existing rows: deletes removed, updates changed extras, leaves untouched', async () => {
    const ctx = buildAdmin()
    await ctx.junction.create({ postId: 'p1', tagId: 't1', note: 'old1' })
    await ctx.junction.create({ postId: 'p1', tagId: 't2', note: 'old2' })
    await ctx.junction.create({ postId: 'p1', tagId: 't3', note: 'old3' })

    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: {
        // drop t2; update t1's note; keep t3 unchanged
        tags: [
          { id: 't1', note: 'new1' },
          { id: 't3' },
        ],
      } as unknown as Record<string, unknown>,
    })

    const remaining = ctx.postTagsTable.rows.filter((r) => r.postId === 'p1')
    expect(remaining.map((r) => r.tagId).sort()).toEqual(['t1', 't3'])
    expect(remaining.find((r) => r.tagId === 't1')!.note).toBe('new1')
    // t3's note must be preserved (not in payload).
    expect(remaining.find((r) => r.tagId === 't3')!.note).toBe('old3')
  })

  it('clears all junction rows when payload tags = []', async () => {
    const ctx = buildAdmin()
    await ctx.junction.create({ postId: 'p1', tagId: 't1' })
    await ctx.junction.create({ postId: 'p1', tagId: 't2' })
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: { tags: [] } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows.filter((r) => r.postId === 'p1')).toHaveLength(0)
  })

  it('leaves junction rows alone when payload omits the property', async () => {
    const ctx = buildAdmin()
    await ctx.junction.create({ postId: 'p1', tagId: 't1' })
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: { title: 'updated' } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows.filter((r) => r.postId === 'p1')).toHaveLength(1)
  })

  it('rehydrates response.record.params.tags after write', async () => {
    const ctx = buildAdmin()
    const response = await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'edit' },
      payload: {
        tags: [{ id: 't1', note: 'fresh' }],
      } as unknown as Record<string, unknown>,
    }) as { record: { params: Record<string, unknown>; populated: Record<string, unknown> } }
    const items = response.record.params.tags as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]!.note).toBe('fresh')
    expect(response.record.populated['tags.t1']).toBeDefined()
  })

  it('persists across new (create) action too', async () => {
    const ctx = buildAdmin()
    const created = await ctx.posts.create({ id: 'p3', title: 'Brand new' })
    expect(created.id).toBe('p3')
    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p3', action: 'edit' },
      payload: { tags: ['t1'] } as unknown as Record<string, unknown>,
    })
    expect(ctx.postTagsTable.rows.find((r) => r.postId === 'p3' && r.tagId === 't1')).toBeDefined()
  })
})

describe('m2mFeature — cascade delete', () => {
  it('removes junction rows when parent is deleted', async () => {
    const ctx = buildAdmin()
    await ctx.junction.create({ postId: 'p1', tagId: 't1' })
    await ctx.junction.create({ postId: 'p1', tagId: 't2' })
    await ctx.junction.create({ postId: 'p2', tagId: 't3' })

    await ctx.admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'delete' },
    })

    expect(ctx.postTagsTable.rows.filter((r) => r.postId === 'p1')).toHaveLength(0)
    // unrelated junctions untouched
    expect(ctx.postTagsTable.rows.filter((r) => r.postId === 'p2')).toHaveLength(1)
  })

  it('skips cascade when feature configured with cascadeDelete: false', async () => {
    const tagsTable = tbl('tags', ['id', 'name'], [{ id: 't1', name: 'rust' }])
    const postsTable = tbl('posts', ['id', 'title'], [{ id: 'p1', title: 'X' }])
    const postTagsTable = tbl('postTags', ['id', 'postId', 'tagId'], [])
    const admin = new ModernAdmin({
      adapters: [adapter],
      resources: [
        { resource: tagsTable },
        { resource: postTagsTable },
        {
          resource: postsTable,
          features: [
            m2mFeature({
              property: 'tags',
              through: 'postTags',
              localKey: 'postId',
              foreignKey: 'tagId',
              reference: 'tags',
              cascadeDelete: false,
            }),
          ],
        },
      ],
    })
    await admin.findResource('postTags').create({ postId: 'p1', tagId: 't1' })
    await admin.invoke({
      method: 'post',
      params: { resourceId: 'posts', recordId: 'p1', action: 'delete' },
    })
    expect(postTagsTable.rows).toHaveLength(1)
  })
})

describe('m2mFeature — composes with other features', () => {
  it('two m2mFeature calls on the same resource expose two virtual properties', () => {
    const tagsT = tbl('tags', ['id', 'name'], [])
    const catsT = tbl('cats', ['id', 'name'], [])
    const postsT = tbl('posts', ['id', 'title'], [])
    const ptT = tbl('postTags', ['id', 'postId', 'tagId'], [])
    const pcT = tbl('postCats', ['id', 'postId', 'catId'], [])
    const admin = new ModernAdmin({
      adapters: [adapter],
      resources: [
        { resource: tagsT },
        { resource: catsT },
        { resource: ptT },
        { resource: pcT },
        {
          resource: postsT,
          features: [
            m2mFeature({ property: 'tags', through: 'postTags', localKey: 'postId', foreignKey: 'tagId', reference: 'tags' }),
            m2mFeature({ property: 'cats', through: 'postCats', localKey: 'postId', foreignKey: 'catId', reference: 'cats' }),
          ],
        },
      ],
    })
    const dec = admin.findResource('posts').decorate()
    expect(dec.getPropertyByKey('tags')!.type()).toBe('m2m')
    expect(dec.getPropertyByKey('cats')!.type()).toBe('m2m')
  })
})
