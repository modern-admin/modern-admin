import { describe, expect, test } from 'bun:test'
import { buildHref, parseLocation, type Route } from '../src/router.js'

describe('buildHref', () => {
  test('home', () => {
    expect(buildHref({ name: 'home' })).toBe('/')
  })

  test('cache', () => {
    expect(buildHref({ name: 'cache' })).toBe('/cache')
    expect(parseLocation('/cache', '')).toEqual({ name: 'cache' })
  })

  test('list', () => {
    expect(buildHref({ name: 'list', resourceId: 'users' })).toBe('/resources/users')
  })

  test('structured list filters round-trip without delimiter collisions', () => {
    const route: Route = {
      name: 'list',
      resourceId: 'users',
      query: {
        filters: {
          name: { operator: 'in', values: ['Smith, John', 'in-json:["a"]'] },
          deletedAt: { operator: 'empty' },
        },
      },
    }
    const href = buildHref(route)
    const [path, search] = href.split('?')

    expect(parseLocation(path!, `?${search}`)).toEqual(route)
    expect(new URLSearchParams(search).getAll('filters[name][values][]')).toEqual([
      'Smith, John',
      'in-json:["a"]',
    ])
  })

  test('parses a structured numeric range from a browser URL', () => {
    expect(
      parseLocation(
        '/resources/products',
        '?filters%5Bname%5D%5Boperator%5D=co&filters%5Bname%5D%5Bvalue%5D=big&filters%5Bprice%5D%5Boperator%5D=between&filters%5Bprice%5D%5Bfrom%5D=150&filters%5Bprice%5D%5Bto%5D=420',
      ),
    ).toEqual({
      name: 'list',
      resourceId: 'products',
      query: {
        filters: {
          name: { operator: 'co', value: 'big' },
          price: { operator: 'between', from: '150', to: '420' },
        },
      },
    })
  })

  test('show', () => {
    expect(buildHref({ name: 'show', resourceId: 'users', recordId: '42' })).toBe(
      '/resources/users/42',
    )
  })

  test('edit', () => {
    expect(buildHref({ name: 'edit', resourceId: 'users', recordId: '42' })).toBe(
      '/resources/users/42/edit',
    )
  })

  test('new', () => {
    expect(buildHref({ name: 'new', resourceId: 'users' })).toBe('/resources/users/new')
  })

  test('encodes special characters in ids', () => {
    expect(buildHref({ name: 'show', resourceId: 'a b', recordId: 'x/y' })).toBe(
      '/resources/a%20b/x%2Fy',
    )
  })

  test('resource-scoped custom action', () => {
    expect(buildHref({ name: 'action', resourceId: 'users', actionName: 'sendMassPush' })).toBe(
      '/resources/users/actions/sendMassPush',
    )
  })

  test('record-scoped custom action', () => {
    expect(
      buildHref({
        name: 'action',
        resourceId: 'users',
        recordId: '42',
        actionName: 'sendFirebase',
      }),
    ).toBe('/resources/users/42/actions/sendFirebase')
  })

  test('bulk-scoped custom action carries the selection in the query', () => {
    expect(
      buildHref({
        name: 'action',
        resourceId: 'users',
        actionName: 'tagAll',
        recordIds: ['1', '2', '3'],
      }),
    ).toBe('/resources/users/actions/tagAll?recordIds=1%2C2%2C3')
  })

  test('an empty selection is omitted rather than emitted as a blank param', () => {
    expect(
      buildHref({ name: 'action', resourceId: 'users', actionName: 'tagAll', recordIds: [] }),
    ).toBe('/resources/users/actions/tagAll')
  })
})

describe('parseLocation — custom action routes', () => {
  test('resource-scoped', () => {
    expect(parseLocation('/resources/users/actions/sendMassPush', '')).toEqual({
      name: 'action',
      resourceId: 'users',
      actionName: 'sendMassPush',
    })
  })

  test('record-scoped', () => {
    expect(parseLocation('/resources/users/42/actions/sendFirebase', '')).toEqual({
      name: 'action',
      resourceId: 'users',
      recordId: '42',
      actionName: 'sendFirebase',
    })
  })

  test('decodes percent-encoded segments', () => {
    expect(parseLocation('/resources/users/x%2Fy/actions/a%20b', '')).toEqual({
      name: 'action',
      resourceId: 'users',
      recordId: 'x/y',
      actionName: 'a b',
    })
  })

  test('a trailing "actions" with no name is not an action route', () => {
    // Falls through to the record patterns — `actions` is read as a record id.
    expect(parseLocation('/resources/users/actions', '')).toEqual({
      name: 'show',
      resourceId: 'users',
      recordId: 'actions',
    })
  })

  test('does not shadow the existing record routes', () => {
    expect(parseLocation('/resources/users/42', '')).toEqual({
      name: 'show',
      resourceId: 'users',
      recordId: '42',
    })
    expect(parseLocation('/resources/users/42/edit', '')).toEqual({
      name: 'edit',
      resourceId: 'users',
      recordId: '42',
    })
    expect(parseLocation('/resources/users/new', '')).toEqual({
      name: 'new',
      resourceId: 'users',
    })
  })

  test('reads a bulk selection back out of the query string', () => {
    expect(parseLocation('/resources/users/actions/tagAll', '?recordIds=1,2,3')).toEqual({
      name: 'action',
      resourceId: 'users',
      actionName: 'tagAll',
      recordIds: ['1', '2', '3'],
    })
  })

  test('an empty or blank recordIds param yields no selection key', () => {
    for (const search of ['', '?recordIds=', '?recordIds=,,']) {
      expect(parseLocation('/resources/users/actions/tagAll', search)).toEqual({
        name: 'action',
        resourceId: 'users',
        actionName: 'tagAll',
      })
    }
  })

  test('round-trips through buildHref', () => {
    const routes: Route[] = [
      { name: 'action', resourceId: 'users', actionName: 'sendMassPush' },
      { name: 'action', resourceId: 'users', recordId: '42', actionName: 'sendFirebase' },
      { name: 'action', resourceId: 'users', actionName: 'tagAll', recordIds: ['1', '2'] },
    ]
    for (const route of routes) {
      const href = buildHref(route)
      const [path, search] = href.split('?')
      expect(parseLocation(path!, search ? `?${search}` : '')).toEqual(route)
    }
  })
})
