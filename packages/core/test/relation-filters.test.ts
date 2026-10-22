import { describe, expect, test } from 'bun:test'
import { BaseProperty, BaseRecord, type FindOptions } from '../src/adapters'
import { type Action, type ListActionResponse } from '../src/actions'
import { ForbiddenError, ValidationError } from '../src/errors'
import { Filter, type RawFilters } from '../src/filter/filter.js'
import { ModernAdmin } from '../src/modern-admin.js'
import { MemoryCacheProvider } from '../src/ports'
import { uuidv7 } from '../src/utils/uuid.js'
import { FakeResource, type FakeRow, type FakeTable } from './_helpers/fake-adapter.js'

// A small scalar adapter: relation traversal itself belongs entirely to core.
class ScalarResource extends FakeResource {
  constructor(readonly data: FakeTable) {
    super(data)
  }

  private matching(filter: Filter): FakeRow[] {
    return this.data.rows.filter((row) =>
      filter.reduce((matches, element) => {
        const actual = row[element.path]
        if (!element.property) throw new Error(`Unresolved filter: ${element.path}`)
        switch (element.operator) {
          case 'in':
            return matches && Array.isArray(element.value) && element.value.includes(String(actual))
          case 'neq':
            return matches && actual !== element.value
          case 'empty':
            return matches && actual == null
          case 'nempty':
            return matches && actual != null
          default:
            return matches && actual === element.value
        }
      }, true),
    )
  }

  override async find(filter: Filter, options: FindOptions): Promise<BaseRecord[]> {
    return this.matching(filter)
      .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? Infinity))
      .map((row) => new BaseRecord(row, this))
  }

  override async count(filter: Filter): Promise<number> {
    return this.matching(filter).length
  }
  override async distinct(field: string): Promise<string[]> {
    return [...new Set(this.data.rows.map((row) => String(row[field])))]
  }
}

const id = () => new BaseProperty({ path: 'id', isId: true })
const ref = (path: string, reference: string) =>
  new BaseProperty({ path, reference, type: 'reference' })

function fixture() {
  const alice = uuidv7(),
    bob = uuidv7(),
    post = uuidv7(),
    otherPost = uuidv7()
  const comment = uuidv7(),
    otherComment = uuidv7(),
    orphan = uuidv7()
  const authors = new ScalarResource({
    name: 'authors',
    properties: [id(), new BaseProperty({ path: 'tier', availableValues: ['pro', 'free'] })],
    rows: [
      { id: alice, tier: 'pro' },
      { id: bob, tier: 'free' },
    ],
  })
  const posts = new ScalarResource({
    name: 'posts',
    properties: [id(), ref('authorId', 'authors'), new BaseProperty({ path: 'status' })],
    rows: [
      { id: post, authorId: alice, status: 'draft' },
      { id: otherPost, authorId: bob, status: 'published' },
    ],
  })
  const comments = new ScalarResource({
    name: 'comments',
    properties: [id(), ref('postId', 'posts')],
    rows: [
      { id: comment, postId: post },
      { id: otherComment, postId: otherPost },
      { id: orphan, postId: null },
    ],
  })
  const admin = new ModernAdmin({
    cache: new MemoryCacheProvider(),
    resources: [
      authors,
      posts,
      {
        resource: comments,
        options: {
          filterProperties: ['postId', 'postId.authorId', 'postId.authorId.tier'],
        },
      },
    ],
  })
  const list = (filters: RawFilters, query: Record<string, unknown> = {}) =>
    admin.invoke<ListActionResponse>({
      params: { resourceId: 'comments', action: 'list' },
      method: 'get',
      query: { filters, ...query },
    })
  return {
    admin,
    authors,
    posts,
    comments,
    alice,
    bob,
    post,
    otherPost,
    comment,
    otherComment,
    list,
  }
}

describe('relation filters and virtual related tables', () => {
  test('enforces access overrides on the declared relation filter itself', async () => {
    const f = fixture()
    f.comments.decorate().options.properties = {
      'postId.authorId.tier': { isAccessible: false },
    }
    await expect(f.list({ 'postId.authorId.tier': 'pro' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      f.admin.invoke({
        params: { resourceId: 'comments', action: 'values' },
        method: 'get',
        query: { field: 'postId.authorId.tier' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test('rejects overly broad matches and traversal through arrays', async () => {
    const f = fixture()
    f.posts.data.rows = Array.from({ length: 10_001 }, () => ({ id: uuidv7(), authorId: f.alice }))
    await expect(f.list({ 'postId.authorId': f.alice })).rejects.toBeInstanceOf(ValidationError)
    f.posts.decorate().getPropertyByKey('authorId')!.options.isArray = true
    await expect(f.list({ 'postId.authorId.tier': 'pro' })).rejects.toBeInstanceOf(ValidationError)
  })

  test('bounds self-referential paths before executing any lookups', async () => {
    const tree = new ScalarResource({
      name: 'tree',
      properties: [id(), ref('parentId', 'tree')],
      rows: [],
    })
    const admin = new ModernAdmin({ resources: [tree] })
    await expect(
      admin.invoke({
        params: { resourceId: 'tree', action: 'list' },
        method: 'get',
        query: { filters: { [`${'parentId.'.repeat(6)}id`]: uuidv7() } },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
  test('filters by a parent reference and a property two relationships away', async () => {
    const f = fixture()
    expect(
      (await f.list({ 'postId.authorId': { operator: 'eq', value: f.alice } })).records.map(
        (r) => r.id,
      ),
    ).toEqual([f.comment])
    expect(
      (await f.list({ 'postId.authorId.tier': { operator: 'eq', value: 'pro' } })).records.map(
        (r) => r.id,
      ),
    ).toEqual([f.comment])
  })

  test('legacy dotted, bracketed and structured predicates preserve the full path', async () => {
    const f = fixture()
    for (const filters of [
      { 'postId.authorId': f.alice },
      { postId: { authorId: f.alice } },
      { 'postId.authorId': { operator: 'in', values: [f.alice] } },
    ]) {
      expect((await f.list(filters)).records.map((r) => r.id)).toEqual([f.comment])
    }
    const parsed = new Filter({ 'postId.authorId': f.alice }, f.comments, {
      preserveRelationPaths: true,
    })
    expect(parsed.get('postId.authorId')?.value).toBe(f.alice)
  })

  test('ANDs predicates on the same related record and retains a direct FK predicate', async () => {
    const f = fixture()
    expect(
      (
        await f.list({
          'postId.authorId.tier': { operator: 'eq', value: 'pro' },
          'postId.status': { operator: 'eq', value: 'published' },
        })
      ).meta.total,
    ).toBe(0)
    expect((await f.list({ postId: f.otherPost, 'postId.authorId': f.alice })).meta.total).toBe(0)
    expect(
      (await f.list({ postId: f.post, 'postId.authorId': f.alice })).records.map((r) => r.id),
    ).toEqual([f.comment])
    expect(
      (await f.list({ 'postId.authorId': { operator: 'eq', value: uuidv7() } })).meta.total,
    ).toBe(0)
  })

  test('terminal null checks and negation require an existing relation', async () => {
    const f = fixture()
    expect(
      (await f.list({ 'postId.authorId.tier': { operator: 'neq', value: 'pro' } })).records.map(
        (r) => r.id,
      ),
    ).toEqual([f.otherComment])
    f.authors.data.rows[0]!.tier = null
    expect(
      (await f.list({ 'postId.authorId.tier': { operator: 'empty' } })).records.map((r) => r.id),
    ).toEqual([f.comment])
  })

  test('collects intermediate matches beyond the list page cap and paginates final rows', async () => {
    const f = fixture()
    f.posts.data.rows = Array.from({ length: 205 }, () => ({
      id: uuidv7(),
      authorId: f.alice,
      status: 'draft',
    }))
    f.comments.data.rows = f.posts.data.rows.map((post) => ({ id: uuidv7(), postId: post.id }))
    const result = await f.list({ 'postId.authorId': f.alice }, { page: 2, perPage: 10 })
    expect(result.meta.total).toBe(205)
    expect(result.records.map((r) => r.id)).toEqual(
      f.comments.data.rows.slice(10, 20).map((r) => r.id),
    )
  })

  test('resolves each nested lookup once while paging and scopes it to one invocation', async () => {
    const f = fixture()
    f.authors.data.rows = Array.from({ length: 405 }, () => ({ id: uuidv7(), tier: 'pro' }))
    f.posts.data.rows = f.authors.data.rows.map((author) => ({ id: uuidv7(), authorId: author.id }))
    f.comments.data.rows = f.posts.data.rows.map((post) => ({ id: uuidv7(), postId: post.id }))
    let authorReads = 0
    const findAuthors = f.authors.find.bind(f.authors)
    f.authors.find = (filter, options) => {
      authorReads++
      return findAuthors(filter, options)
    }
    const filters = { 'postId.authorId.tier': { operator: 'eq' as const, value: 'pro' } }
    expect((await f.list(filters)).meta.total).toBe(405)
    expect(authorReads).toBe(3)
    f.authors.data.rows.forEach((author) => {
      author.tier = 'free'
    })
    expect((await f.list(filters)).meta.total).toBe(0)
    expect(authorReads).toBe(4)
  })

  test('never sends an empty relation result to adapter find/count', async () => {
    const f = fixture()
    f.comments.find = async () => {
      throw new Error('Unscoped adapter read')
    }
    f.comments.count = async () => {
      throw new Error('Unscoped adapter count')
    }
    const result = await f.list({ postId: f.otherPost, 'postId.authorId': f.alice })
    expect(result.records).toEqual([])
    expect(result.meta.total).toBe(0)
  })

  test('runs intermediate row-scoping hooks with the same principal', async () => {
    const f = fixture()
    const action = f.posts.decorate().getAction('list')!.merged as Action
    action.before = (request, context) => ({
      ...request,
      query: {
        ...request.query,
        filters: {
          ...(request.query?.filters as RawFilters),
          authorId: { operator: 'eq', value: context.currentAdmin?.id },
        },
      },
    })
    const result = await f.admin.invoke<ListActionResponse>(
      {
        params: { resourceId: 'comments', action: 'list' },
        method: 'get',
        query: { filters: { 'postId.status': 'published' } },
      },
      { id: f.alice },
    )
    expect(result.meta.total).toBe(0)
  })

  test('rechecks access after a successful read and rejects inaccessible terminal properties', async () => {
    const f = fixture()
    await f.list({ 'postId.authorId.tier': 'pro' })
    const action = f.authors.decorate().getAction('list')!.merged as Action
    action.isAccessible = false
    await expect(f.list({ 'postId.authorId.tier': 'pro' })).rejects.toBeInstanceOf(ForbiddenError)
    action.isAccessible = true
    f.authors.decorate().getPropertyByKey('tier')!.options.isAccessible = false
    await expect(f.list({ 'postId.authorId.tier': 'pro' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  test('checks API-key permissions on intermediate resources', async () => {
    const f = fixture()
    await expect(
      f.admin.invoke(
        {
          params: { resourceId: 'comments', action: 'list' },
          method: 'get',
          query: { filters: { 'postId.authorId': f.alice } },
        },
        { id: uuidv7(), apiKey: { id: uuidv7(), permissions: { comments: ['list'] } } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test('does not reuse stale membership after an intermediate mutation', async () => {
    const f = fixture()
    expect((await f.list({ 'postId.authorId': f.alice })).meta.total).toBe(1)
    await f.admin.invoke({
      params: { resourceId: 'posts', action: 'edit', recordId: f.post },
      method: 'post',
      payload: { authorId: f.bob },
    })
    expect((await f.list({ 'postId.authorId': f.alice })).meta.total).toBe(0)
  })

  test('an in-flight relation read cannot seed a stale result for the next read', async () => {
    const f = fixture()
    const originalFind = f.posts.find.bind(f.posts)
    let release!: () => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    f.posts.find = async (filter, options) => {
      const records = await originalFind(filter, options)
      started()
      await gate
      return records
    }
    const pending = f.list({ 'postId.authorId': f.alice })
    await ready
    await f.admin.invoke({
      params: { resourceId: 'posts', action: 'edit', recordId: f.post },
      method: 'post',
      payload: { authorId: f.bob },
    })
    f.posts.find = originalFind
    release()
    await pending
    expect((await f.list({ 'postId.authorId': f.alice })).meta.total).toBe(0)
  })

  test('infers filter-only descriptors and hides them when a path becomes inaccessible', async () => {
    const f = fixture()
    const json = f.comments.decorate().toJSON()
    const tier = json.properties.find((p) => p.path === 'postId.authorId.tier')!
    expect(tier.availableValues).toEqual([
      { value: 'pro', label: 'pro' },
      { value: 'free', label: 'free' },
    ])
    expect(tier.isSortable).toBe(false)
    expect(tier.visibility).toEqual({
      list: false,
      show: false,
      new: false,
      edit: false,
      filter: true,
    })
    expect(json.propertyOrder.filter).toContain('postId.authorId.tier')
    expect(json.propertyOrder.list).not.toContain('postId.authorId.tier')
    f.authors.decorate().getPropertyByKey('tier')!.options.isAccessible = false
    const scoped = await f.comments
      .decorate()
      .toJSON({ admin: f.admin, resource: f.comments, cache: f.admin.cache })
    expect(scoped.properties.some((p) => p.path === 'postId.authorId.tier')).toBe(false)
    expect(scoped.propertyOrder.filter).not.toContain('postId.authorId.tier')
  })

  test('distinct values use the terminal resource and reject invalid paths', async () => {
    const f = fixture()
    const result = await f.admin.invoke({
      params: { resourceId: 'comments', action: 'values' },
      method: 'get',
      query: { field: 'postId.authorId.tier' },
    })
    expect(result.values).toEqual(['pro', 'free'])
    await expect(f.list({ 'postId.unknown': 'x' })).rejects.toBeInstanceOf(ValidationError)
  })
})
