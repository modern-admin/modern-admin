import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { jsonByKeyFeature } from '../src/json-by-key-feature.js'
import {
  PendingUploadsRegistry,
  UploadProviderRegistry,
  type IUploadProvider,
  type UploadedFile,
} from '@modern-admin/feature-upload'
import type { ActionOptions, ResourceOptions } from '@modern-admin/core'

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<IUploadProvider> = {}): IUploadProvider {
  return {
    upload: mock(async (_f: UploadedFile, _key?: string) => 'uploaded-key'),
    getUrl: mock((key: string) => `https://cdn.example.com/${key}`),
    delete: mock(async (_key: string) => {}),
    urlTemplate: () => 'https://cdn.example.com/{key}',
    ...overrides,
  }
}

function makeRecord(params: Record<string, unknown>) {
  return { get: (path: string) => params[path], params }
}

const emptyOptions: ResourceOptions = {}

type AnyHook = (...args: unknown[]) => Promise<unknown> | unknown

const getAfter = (result: ResourceOptions, action: string): AnyHook[] =>

  ((result.actions?.[action] as any).after as AnyHook[]) ?? []

const getBefore = (result: ResourceOptions, action: string): AnyHook[] =>

  ((result.actions?.[action] as any).before as AnyHook[]) ?? []

// ─── property generation ─────────────────────────────────────────────────────

describe('jsonByKeyFeature() — property generation', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('returns a FeatureFn', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    expect(typeof feature).toBe('function')
  })

  it('hides the source JSON property', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.previews?.isVisible).toBe(false)
  })

  it('emits one virtual per key with the default __ separator', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.previews__eu?.type).toBe('string')
    expect(result.properties?.previews__us?.type).toBe('string')
  })

  it('respects a custom separator', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      separator: '--',
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.['previews--eu']?.type).toBe('string')
  })

  it('attaches a showWhen rule pointing at the control field', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.previews__eu?.showWhen).toEqual({
      field: 'region',
      equals: 'eu',
    })
    expect(result.properties?.previews__us?.showWhen).toEqual({
      field: 'region',
      equals: 'us',
    })
  })

  it('marks the defaultKey virtual with defaultWhenEmpty', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      defaultKey: 'eu',
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.previews__eu?.showWhen).toEqual({
      field: 'region',
      equals: 'eu',
      defaultWhenEmpty: true,
    })
    expect(result.properties?.previews__us?.showWhen).toEqual({
      field: 'region',
      equals: 'us',
    })
  })

  it('passes through child config (isRequired, isArray, reference, description, availableValues)', () => {
    const feature = jsonByKeyFeature({
      controlField: 'kind',
      keys: ['x'],
      properties: {
        ref: {
          child: {
            type: 'reference',
            reference: 'users',
            isRequired: true,
            isArray: true,
            description: 'pick one',
            availableValues: ['a', { value: 'b', label: 'B' }],
          },
        },
      },
    })
    const result = feature(emptyOptions)
    const v = result.properties?.ref__x
    expect(v?.type).toBe('reference')
    expect(v?.reference).toBe('users')
    expect(v?.isRequired).toBe(true)
    expect(v?.isArray).toBe(true)
    expect(v?.description).toBe('pick one')
    expect(v?.availableValues).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'B' },
    ])
  })

  it('uses label callback when provided', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['east-eu'],
      properties: {
        previews: {
          child: { type: 'string' },
          label: (k) => `Preview (${k})`,
        },
      },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.['previews__east-eu']?.label).toBe('Preview (east-eu)')
  })

  it('attaches custom marker to virtual properties', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const custom = result.properties?.previews__eu?.custom as Record<string, unknown>
    expect(custom?.jsonByKey).toEqual({ sourceProperty: 'previews', key: 'eu' })
  })
})

// ─── file children ───────────────────────────────────────────────────────────

describe('jsonByKeyFeature() — file children', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('throws when type=file and no upload.provider given', () => {
    expect(() =>
      jsonByKeyFeature({
        controlField: 'r',
        keys: ['eu'],
        properties: { previews: { child: { type: 'file' } } },
      }),
    ).toThrow(/upload\.provider/)
  })

  it('registers an upload provider per virtual', () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: {
        previews: { child: { type: 'file', upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const idEu = (result.properties?.previews__eu?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    const idUs = (result.properties?.previews__us?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    expect(idEu).toMatch(/^up_/)
    expect(idUs).toMatch(/^up_/)
    expect(idEu).not.toBe(idUs)
    expect(UploadProviderRegistry.get(idEu)?.provider).toBe(provider)
    expect(UploadProviderRegistry.get(idUs)?.provider).toBe(provider)
  })

  it('records isArray flag in registry for multi-file children', () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'r',
      keys: ['eu'],
      properties: {
        gallery: { child: { type: 'file', isArray: true, upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const id = (result.properties?.gallery__eu?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    expect(UploadProviderRegistry.get(id)?.isArray).toBe(true)
  })

  it('wraps uploadPath callback with key + property context', async () => {
    const provider = makeProvider()
    const seen: Array<{ filename: string; key: string; property: string }> = []
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: {
        previews: {
          child: {
            type: 'file',
            upload: {
              provider,
              uploadPath: (filename, ctx) => {
                seen.push({ filename, ...ctx })
                return `previews/${ctx.key}/${filename}`
              },
            },
          },
        },
      },
    })
    const result = feature(emptyOptions)
    const idEu = (result.properties?.previews__eu?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    const wrapped = UploadProviderRegistry.get(idEu)?.uploadPath
    const out = wrapped?.('photo.jpg')
    expect(out).toBe('previews/eu/photo.jpg')
    expect(seen[0]).toEqual({ filename: 'photo.jpg', key: 'eu', property: 'previews' })
  })

  it('exposes urlTemplate and mime/maxSize in custom data', () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'r',
      keys: ['eu'],
      properties: {
        previews: {
          child: {
            type: 'file',
            upload: { provider, mimeTypes: ['image/*'], maxSize: 1_000_000 },
          },
        },
      },
    })
    const result = feature(emptyOptions)
    const c = result.properties?.previews__eu?.custom as Record<string, unknown>
    expect(c.uploadUrlTemplate).toBe('https://cdn.example.com/{key}')
    expect(c.uploadMimeTypes).toEqual(['image/*'])
    expect(c.uploadMaxSize).toBe(1_000_000)
  })
})

// ─── read hook (expand) ──────────────────────────────────────────────────────

describe('jsonByKeyFeature() — read hooks expand JSON to virtuals', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('expands record params on show', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getAfter(result, 'show')[0]!
    const response: { record: { params: Record<string, unknown> } } = {
      record: { params: { previews: { eu: 'a.jpg', us: 'b.jpg' } } },
    }
    await hook(response, {}, {})
    expect(response.record.params.previews__eu).toBe('a.jpg')
    expect(response.record.params.previews__us).toBe('b.jpg')
  })

  it('expands every record on list', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getAfter(result, 'list')[0]!
    const response: { records: Array<{ params: Record<string, unknown> }> } = {
      records: [
        { params: { previews: { eu: 'a.jpg' } } },
        { params: { previews: { eu: 'b.jpg' } } },
      ],
    }
    await hook(response, {}, {})
    expect(response.records[0]!.params.previews__eu).toBe('a.jpg')
    expect(response.records[1]!.params.previews__eu).toBe('b.jpg')
  })

  it('skips when source is null/undefined', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getAfter(result, 'show')[0]!
    const response: { record: { params: Record<string, unknown> } } = {
      record: { params: { previews: null } },
    }
    await hook(response, {}, {})
    expect(response.record.params.previews__eu).toBeUndefined()
  })
})

// ─── write hook (collapse) ───────────────────────────────────────────────────

describe('jsonByKeyFeature() — write hooks collapse virtuals into JSON', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('collapses virtuals into the source property and removes them', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getBefore(result, 'edit')[0]!
    const request: { payload: Record<string, unknown> } = {
      payload: {
        region: 'eu',
        previews__eu: 'a.jpg',
        previews__us: 'b.jpg',
      },
    }
    await hook(request, {})
    expect(request.payload).toEqual({
      region: 'eu',
      previews: { eu: 'a.jpg', us: 'b.jpg' },
    })
  })

  it('deletes a JSON key when its virtual is empty / null / []', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getBefore(result, 'edit')[0]!
    const request: { payload: Record<string, unknown> } = {
      payload: {
        previews: { eu: 'old.jpg', us: 'keep.jpg' },
        previews__eu: null,
      },
    }
    await hook(request, {})
    expect(request.payload.previews).toEqual({ us: 'keep.jpg' })
    expect('previews__eu' in request.payload).toBe(false)
  })

  it('leaves source untouched when no virtuals are present in the payload', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getBefore(result, 'edit')[0]!
    const original = { foo: 'bar' }
    const request: { payload: Record<string, unknown> } = {
      payload: { other: 'x', previews: original },
    }
    await hook(request, {})
    expect(request.payload.previews).toBe(original)
  })

  it('collapses on new as well', async () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    const hook = getBefore(result, 'new')[0]!
    const request: { payload: Record<string, unknown> } = {
      payload: { previews__eu: 'a.jpg' },
    }
    await hook(request, {})
    expect(request.payload).toEqual({ previews: { eu: 'a.jpg' } })
  })
})

// ─── after hooks: file diff + pending confirmation ────────────────────────────

describe('jsonByKeyFeature() — file diff & pending confirmation', () => {
  beforeEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })
  afterEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })

  it('deletes orphaned files on edit (per JSON key diff)', async () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: {
        previews: { child: { type: 'file', upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const editHook = getAfter(result, 'edit')[0]!
    await editHook(
      {
        record: {
          params: { previews: { eu: 'new-eu.jpg', us: 'kept-us.jpg' } },
        },
      },
      {},
      { record: makeRecord({ previews: { eu: 'old-eu.jpg', us: 'kept-us.jpg' } }) },
    )
    expect(provider.delete).toHaveBeenCalledWith('old-eu.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('kept-us.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('new-eu.jpg')
  })

  it('confirms freshly-uploaded keys after new', async () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: {
        previews: { child: { type: 'file', upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const idEu = (result.properties?.previews__eu?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    PendingUploadsRegistry.track('fresh.jpg', idEu, 60_000)
    expect(PendingUploadsRegistry.has('fresh.jpg')).toBe(true)

    const newHook = getAfter(result, 'new')[0]!
    await newHook(
      { record: { params: { previews: { eu: 'fresh.jpg' } } } },
      {},
      { record: makeRecord({}) },
    )
    expect(PendingUploadsRegistry.has('fresh.jpg')).toBe(false)
  })

  it('confirms freshly-uploaded keys on edit even when nothing changed', async () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: {
        previews: { child: { type: 'file', upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const idEu = (result.properties?.previews__eu?.custom as Record<string, unknown>)
      ?.uploadProviderId as string
    PendingUploadsRegistry.track('replacement.jpg', idEu, 60_000)

    const editHook = getAfter(result, 'edit')[0]!
    await editHook(
      { record: { params: { previews: { eu: 'replacement.jpg' } } } },
      {},
      { record: makeRecord({ previews: { eu: 'old.jpg' } }) },
    )
    expect(PendingUploadsRegistry.has('replacement.jpg')).toBe(false)
    expect(provider.delete).toHaveBeenCalledWith('old.jpg')
  })

  it('cascades file deletes when the record is deleted', async () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu', 'us'],
      properties: {
        previews: { child: { type: 'file', upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const deleteHook = getAfter(result, 'delete')[0]!
    await deleteHook(
      {},
      {},
      { record: makeRecord({ previews: { eu: 'a.jpg', us: 'b.jpg' } }) },
    )
    expect(provider.delete).toHaveBeenCalledWith('a.jpg')
    expect(provider.delete).toHaveBeenCalledWith('b.jpg')
  })

  it('does not register a delete hook when no file children exist', () => {
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature(emptyOptions)
    expect(result.actions?.delete).toBeUndefined()
  })

  it('handles isArray file children — diffs each region as an array', async () => {
    const provider = makeProvider()
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: {
        gallery: { child: { type: 'file', isArray: true, upload: { provider } } },
      },
    })
    const result = feature(emptyOptions)
    const editHook = getAfter(result, 'edit')[0]!
    await editHook(
      { record: { params: { gallery: { eu: ['a.jpg', 'd.jpg'] } } } },
      {},
      { record: makeRecord({ gallery: { eu: ['a.jpg', 'b.jpg', 'c.jpg'] } }) },
    )
    expect(provider.delete).toHaveBeenCalledWith('b.jpg')
    expect(provider.delete).toHaveBeenCalledWith('c.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('a.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('d.jpg')
  })
})

// ─── hook chaining ───────────────────────────────────────────────────────────

describe('jsonByKeyFeature() — hook chaining', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('chains onto an existing edit.before hook', () => {
    const existing = mock(async (req: unknown) => req)
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature({
      actions: { edit: { before: existing } as ActionOptions },
    })
    const hooks = getBefore(result, 'edit')
    expect(hooks.length).toBe(2)
    expect(hooks[0]).toBe(existing)
  })

  it('chains onto an existing show.after hook array', () => {
    const h1 = mock(async (res: unknown) => res)
    const h2 = mock(async (res: unknown) => res)
    const feature = jsonByKeyFeature({
      controlField: 'region',
      keys: ['eu'],
      properties: { previews: { child: { type: 'string' } } },
    })
    const result = feature({
      actions: { show: { after: [h1, h2] } as ActionOptions },
    })
    const hooks = getAfter(result, 'show')
    expect(hooks.length).toBe(3)
    expect(hooks[0]).toBe(h1)
    expect(hooks[1]).toBe(h2)
  })
})
