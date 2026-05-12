import { describe, expect, test } from 'bun:test'
import {
  BaseProperty,
  BaseRecord,
  BaseResource,
  Filter,
  ModernAdmin,
  type FindOptions,
  type ParamsType,
} from '@modern-admin/core'
import { buildAiAssistantTools } from '../src/ai-assistant-tools.js'

class TestResource extends BaseResource {
  private readonly props = [
    new BaseProperty({ path: 'id', type: 'uuid', isId: true, isRequired: true }),
    new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
  ]

  constructor(
    private readonly resourceId: string,
    private readonly tableName: string,
    private readonly rows: ParamsType[] = [],
  ) {
    super()
  }

  override id(): string {
    return this.resourceId
  }

  override databaseName(): string {
    return this.tableName
  }

  override properties(): BaseProperty[] {
    return this.props
  }

  override async count(_filter: Filter): Promise<number> {
    return this.rows.length
  }

  override async find(_filter: Filter, _options: FindOptions): Promise<BaseRecord[]> {
    return this.rows.map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.rows.find((item) => String(item.id) === id)
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const wanted = new Set(ids.map(String))
    return this.rows
      .filter((row) => wanted.has(String(row.id)))
      .map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    this.rows.push(params)
    return params
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const index = this.rows.findIndex((row) => String(row.id) === id)
    this.rows[index] = { ...this.rows[index], ...params }
    return this.rows[index]!
  }

  override async delete(id: string): Promise<void> {
    const index = this.rows.findIndex((row) => String(row.id) === id)
    if (index >= 0) this.rows.splice(index, 1)
  }
}

describe('buildAiAssistantTools', () => {
  test('prefers decorated resource when database resources duplicate the same table', () => {
    const admin = new ModernAdmin({
      resources: [
        new TestResource('RegionalContent', 'regional_content'),
        {
          resource: new TestResource('regionalContent', 'regional_content'),
          options: { navigation: { icon: 'Globe' } },
        },
      ],
    })

    const built = buildAiAssistantTools({
      admin,
      rawQuery: async () => [],
    })

    expect(Object.keys(built.tools).filter((name) => name.endsWith('_regionalcontent'))).toEqual([
      'list_regionalcontent',
      'show_regionalcontent',
      'search_regionalcontent',
    ])
    expect(built.resourceIds).toEqual(['regionalContent'])
    expect(built.sqlResources).toEqual([
      {
        resourceId: 'regionalContent',
        tableName: 'regional_content',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, reference: null },
          { name: 'name', type: 'string', nullable: false, reference: null },
        ],
      },
    ])
  })

  test('execute_sql returns JSON-safe rows', async () => {
    const admin = new ModernAdmin({
      resources: [new TestResource('posts', 'post')],
    })
    const built = buildAiAssistantTools({
      admin,
      rawQuery: async () => [{ count: 12n, createdAt: new Date('2026-05-11T00:00:00.000Z') }],
    })

    const result = await (built.tools['execute_sql'] as unknown as {
      execute(input: { query: string }): Promise<unknown>
    }).execute({ query: 'SELECT COUNT(*) AS "count" FROM "post";' })

    expect(result).toEqual({
      rows: [{ count: '12', createdAt: '2026-05-11T00:00:00.000Z' }],
      rowCount: 1,
      truncated: false,
      citations: [],
    })
    expect(() => JSON.stringify(result)).not.toThrow()
  })
})
