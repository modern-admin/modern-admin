import { describe, expect, test } from 'bun:test'
import { ResourceDecorator } from '../src/decorators/resource-decorator.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import { FakeResource } from './_helpers/fake-adapter.js'
import type { ResourceOptions } from '../src/decorators/resource-options.js'

const decorate = (props: BaseProperty[], options: ResourceOptions = {}): ResourceDecorator =>
  new ResourceDecorator(
    new FakeResource({ name: 'users', rows: [], properties: props }),
    { id: 'users', ...options },
  )

describe('ResourceDecorator propertyOrder', () => {
  test('sorts view-visible properties by position (default, no explicit list)', () => {
    const decorator = decorate([
      new BaseProperty({ path: 'a', position: 2 }),
      new BaseProperty({ path: 'b', position: 1 }),
      new BaseProperty({ path: 'c', position: 3 }),
    ])
    expect(decorator.toJSON().propertyOrder.list).toEqual(['b', 'a', 'c'])
  })

  test('listProperties acts as an explicit whitelist + order, overriding visibility', () => {
    const decorator = decorate(
      [
        new BaseProperty({ path: 'id', isId: true, position: 1 }),
        new BaseProperty({ path: 'name', position: 2 }),
        new BaseProperty({ path: 'createdAt', position: 3 }),
      ],
      {
        listProperties: ['createdAt', 'id'],
        // id would normally be hidden from list — the explicit list still wins.
        properties: { id: { isVisible: { list: false } } },
      },
    )
    expect(decorator.toJSON().propertyOrder.list).toEqual(['createdAt', 'id'])
  })

  test('excludes list-hidden properties from the default order', () => {
    const decorator = decorate(
      [
        new BaseProperty({ path: 'id', isId: true, position: 1 }),
        new BaseProperty({ path: 'name', position: 2 }),
      ],
      { properties: { id: { isVisible: { list: false } } } },
    )
    expect(decorator.toJSON().propertyOrder.list).toEqual(['name'])
  })

  test('virtual option-only fields keep a trailing position under the sort', () => {
    const decorator = decorate(
      [
        new BaseProperty({ path: 'a', position: 1 }),
        new BaseProperty({ path: 'b', position: 2 }),
      ],
      { properties: { extra: { type: 'string' } } },
    )
    expect(decorator.toJSON().propertyOrder.edit).toEqual(['a', 'b', 'extra'])
  })
})
