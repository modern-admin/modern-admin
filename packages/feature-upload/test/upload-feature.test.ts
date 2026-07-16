import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { uploadFeature } from '../src/upload-feature.js'
import { UploadProviderRegistry } from '../src/registry.js'
import { PendingUploadsRegistry } from '../src/pending-registry.js'
import type { IUploadProvider, UploadedFile } from '../src/types.js'
import type { ActionOptions, ResourceOptions } from '@modern-admin/core'

// ─── Mock provider ────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<IUploadProvider> = {}): IUploadProvider {
  return {
    upload: mock(async (_file: UploadedFile, _key?: string) => 'uploaded-key.jpg'),
    getUrl: mock((key: string) => `https://cdn.example.com/${key}`),
    delete: mock(async (_key: string) => {}),
    urlTemplate: () => 'https://cdn.example.com/{key}',
    ...overrides,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyOptions: ResourceOptions = {}

function makeRecord(params: Record<string, unknown>) {
  return { get: (path: string) => params[path], params }
}

// ─── Registry tests ───────────────────────────────────────────────────────────

describe('UploadProviderRegistry', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('registers and retrieves a config by id', () => {
    const provider = makeProvider()
    UploadProviderRegistry.register('test-id', { provider })
    expect(UploadProviderRegistry.get('test-id')?.provider).toBe(provider)
  })

  it('stores uploadPath function alongside provider', () => {
    const provider = makeProvider()
    const uploadPath = (filename: string) => `custom/${filename}`
    UploadProviderRegistry.register('test-id', { provider, uploadPath })
    expect(UploadProviderRegistry.get('test-id')?.uploadPath).toBe(uploadPath)
  })

  it('returns undefined for unknown ids', () => {
    expect(UploadProviderRegistry.get('no-such-id')).toBeUndefined()
  })

  it('clear() empties the registry', () => {
    UploadProviderRegistry.register('p1', { provider: makeProvider() })
    UploadProviderRegistry.clear()
    expect(UploadProviderRegistry.get('p1')).toBeUndefined()
  })
})

// ─── uploadFeature() — property config ───────────────────────────────────────

describe('uploadFeature() — property configuration', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('returns a FeatureFn', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    expect(typeof feature).toBe('function')
  })

  it('marks the property as type: file', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    expect(feature(emptyOptions).properties?.avatar?.type).toBe('file')
  })

  it('stores uploadProviderId in property custom data', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string
    expect(typeof id).toBe('string')
    expect(id.startsWith('up_')).toBe(true)
  })

  it('registers the provider config in UploadProviderRegistry', () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string
    expect(UploadProviderRegistry.get(id)?.provider).toBe(provider)
  })

  it('derives a deterministic, resource-scoped id when a resource is supplied', () => {
    const resource = { id: () => 'users' } as unknown as Parameters<
      ReturnType<typeof uploadFeature>
    >[1]
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const first = feature(emptyOptions, resource)
    const id = first.properties?.avatar?.custom?.uploadProviderId as string
    // Deterministic form so every replica computes the same registry key.
    expect(id).toBe('up_users_avatar')
    // Re-applying (e.g. a second replica) yields the same id — resolvable.
    const second = feature(emptyOptions, resource)
    expect(second.properties?.avatar?.custom?.uploadProviderId).toBe(id)
    expect(UploadProviderRegistry.get(id)).toBeDefined()
  })

  it('stores urlTemplate in custom data', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)
    expect(result.properties?.avatar?.custom?.uploadUrlTemplate).toBe('https://cdn.example.com/{key}')
  })

  it('stores null urlTemplate when provider returns undefined', () => {
    const provider = makeProvider({ urlTemplate: undefined })
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    expect(feature(emptyOptions).properties?.avatar?.custom?.uploadUrlTemplate).toBeNull()
  })

  it('stores mimeTypes and maxSize', () => {
    const feature = uploadFeature({
      properties: { avatar: { provider: makeProvider(), mimeTypes: ['image/*'], maxSize: 5_000_000 } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.avatar?.custom?.uploadMimeTypes).toEqual(['image/*'])
    expect(result.properties?.avatar?.custom?.uploadMaxSize).toBe(5_000_000)
  })

  it('preserves existing property overrides', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature({ properties: { name: { label: 'Full Name' } } })
    expect(result.properties?.name?.label).toBe('Full Name')
    expect(result.properties?.avatar?.type).toBe('file')
  })

  it('handles multiple upload properties', () => {
    const feature = uploadFeature({
      properties: {
        avatar: { provider: makeProvider() },
        resume: { provider: makeProvider(), mimeTypes: ['application/pdf'] },
      },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.avatar?.type).toBe('file')
    expect(result.properties?.resume?.type).toBe('file')
    expect(result.properties?.resume?.custom?.uploadMimeTypes).toEqual(['application/pdf'])
  })
})

// ─── uploadFeature() — uploadPath ────────────────────────────────────────────

describe('uploadFeature() — uploadPath', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('stores uploadPath in the registry', () => {
    const uploadPath = (filename: string) => `avatars/${filename}`
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider(), uploadPath } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string
    expect(UploadProviderRegistry.get(id)?.uploadPath).toBe(uploadPath)
  })

  it('stores undefined uploadPath when not provided', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string
    expect(UploadProviderRegistry.get(id)?.uploadPath).toBeUndefined()
  })
})

// ─── uploadFeature() — hook chaining ─────────────────────────────────────────

describe('uploadFeature() — hook chaining', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('produces an after array for edit and delete actions', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)

    expect(Array.isArray((result.actions?.edit as any)?.after)).toBe(true)

    expect(Array.isArray((result.actions?.delete as any)?.after)).toBe(true)
  })

  it('chains onto an existing edit.after hook', () => {
    const existingHook = mock(async (res: unknown) => res)
    const incoming: ResourceOptions = {
      actions: { edit: { after: existingHook } as ActionOptions },
    }
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(incoming)

    const hooks = (result.actions?.['edit'] as any).after as unknown[]
    expect(Array.isArray(hooks)).toBe(true)
    expect(hooks.length).toBe(2)
    expect(hooks[0]).toBe(existingHook)
  })

  it('chains onto an existing delete.after hook array', () => {
    const h1 = mock(async (res: unknown) => res)
    const h2 = mock(async (res: unknown) => res)
    const incoming: ResourceOptions = {
      actions: { delete: { after: [h1, h2] } as ActionOptions },
    }
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(incoming)

    const hooks = (result.actions?.['delete'] as any).after as unknown[]
    expect(hooks.length).toBe(3)
    expect(hooks[0]).toBe(h1)
    expect(hooks[1]).toBe(h2)
  })

  it('existing hooks run before the upload hook', async () => {
    const order: string[] = []
    const existingHook = async (res: unknown) => { order.push('existing'); return res }
    const incoming: ResourceOptions = {
      actions: { edit: { after: existingHook } as ActionOptions },
    }
    const provider = makeProvider({ delete: mock(async () => { order.push('delete') }) })
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(incoming)


    const hooks = (result.actions?.['edit'] as any).after as Array<(r: unknown, q: unknown, c: unknown) => Promise<unknown>>
    const fakeResponse = { record: { params: { avatar: 'new.jpg' } } }
    const fakeRecord = makeRecord({ avatar: 'old.jpg' })
    for (const hook of hooks) {
      await hook(fakeResponse, {}, { record: fakeRecord })
    }
    expect(order).toEqual(['existing', 'delete'])
  })
})

// ─── delete hook ─────────────────────────────────────────────────────────────

describe('uploadFeature() — delete hook', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('deletes the stored file after record deletion', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const deleteHook = ((result.actions?.['delete'] as any).after as HookFn[])[0]!

    await deleteHook({}, {}, { record: makeRecord({ avatar: 'uploaded-key.jpg' }) })
    expect(provider.delete).toHaveBeenCalledWith('uploaded-key.jpg')
  })

  it('does not throw when record has no file value', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const deleteHook = ((result.actions?.['delete'] as any).after as HookFn[])[0]!

    await expect(deleteHook({}, {}, { record: makeRecord({ avatar: null }) })).resolves.toBeDefined()
    expect(provider.delete).not.toHaveBeenCalled()
  })

  it('swallows provider errors so the action response is returned', async () => {
    const provider = makeProvider({
      delete: mock(async () => { throw new Error('S3 unavailable') }),
    })
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const deleteHook = ((result.actions?.['delete'] as any).after as HookFn[])[0]!
    const fakeResponse = { notice: { message: 'deleted', type: 'success' } }
    await expect(deleteHook(fakeResponse, {}, { record: makeRecord({ avatar: 'key.jpg' }) }))
      .resolves.toEqual(fakeResponse)
  })
})

// ─── edit hook ────────────────────────────────────────────────────────────────

describe('uploadFeature() — edit hook', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('deletes old file when the field value changes', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!

    await editHook({ record: { params: { avatar: 'new-key.jpg' } } }, {}, { record: makeRecord({ avatar: 'old-key.jpg' }) })
    expect(provider.delete).toHaveBeenCalledWith('old-key.jpg')
  })

  it('does not delete when the value is unchanged', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!

    await editHook({ record: { params: { avatar: 'same-key.jpg' } } }, {}, { record: makeRecord({ avatar: 'same-key.jpg' }) })
    expect(provider.delete).not.toHaveBeenCalled()
  })

  it('returns the response unchanged', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)


    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>
    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!

    const response = { record: { id: '1', params: { avatar: 'new.jpg' }, title: 'foo', errors: {}, baseError: null, populated: {} } }
    const returned = await editHook(response, {}, { record: makeRecord({ avatar: 'old.jpg' }) })
    expect(returned).toBe(response)
  })
})

// ─── LocalUploadProvider — key parameter ─────────────────────────────────────

describe('LocalUploadProvider — optional key parameter', () => {
  it('uses a provided key instead of generating one', async () => {
    const { LocalUploadProvider } = await import('../src/providers/local.js')
    // Spy on writeFile via a temp dir approach.
    // We just verify the key is returned as-is.
    const provider = new LocalUploadProvider({ uploadDir: '/tmp/ma-test-uploads', baseUrl: '/uploads' })
    const file: UploadedFile = {
      originalName: 'test.jpg',
      mimeType: 'image/jpeg',
      size: 4,
      buffer: Buffer.from('data'),
    }
    const key = await provider.upload(file, 'custom/path/my-image.jpg')
    expect(key).toBe('custom/path/my-image.jpg')
  })

  it('auto-generates a key when none is provided', async () => {
    const { LocalUploadProvider } = await import('../src/providers/local.js')
    const provider = new LocalUploadProvider({ uploadDir: '/tmp/ma-test-uploads', baseUrl: '/uploads' })
    const file: UploadedFile = {
      originalName: 'photo.png',
      mimeType: 'image/png',
      size: 4,
      buffer: Buffer.from('data'),
    }
    const key = await provider.upload(file)
    expect(key.endsWith('.png')).toBe(true)
    expect(key.length).toBeGreaterThan(5)
  })
})

// ─── uploadFeature() — multi-file (isArray) ──────────────────────────────────

describe('uploadFeature() — isArray', () => {
  beforeEach(() => UploadProviderRegistry.clear())
  afterEach(() => UploadProviderRegistry.clear())

  it('marks the property as isArray when configured', () => {
    const feature = uploadFeature({
      properties: { gallery: { provider: makeProvider(), isArray: true } },
    })
    const result = feature(emptyOptions)
    expect(result.properties?.gallery?.type).toBe('file')
    expect(result.properties?.gallery?.isArray).toBe(true)
  })

  it('does not set isArray when the option is omitted', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)
    expect(result.properties?.avatar?.isArray).toBeUndefined()
  })

  it('records isArray in the provider registry', () => {
    const feature = uploadFeature({
      properties: { gallery: { provider: makeProvider(), isArray: true } },
    })
    const result = feature(emptyOptions)
    const id = result.properties?.gallery?.custom?.uploadProviderId as string
    expect(UploadProviderRegistry.get(id)?.isArray).toBe(true)
  })

  it('edit hook deletes only the keys removed from the array', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({
      properties: { gallery: { provider, isArray: true } },
    })
    const result = feature(emptyOptions)
    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>

    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!

    const oldList = ['a.jpg', 'b.jpg', 'c.jpg']
    const newList = ['a.jpg', 'd.jpg'] // b + c removed, d added
    await editHook(
      { record: { params: { gallery: newList } } },
      {},
      { record: makeRecord({ gallery: oldList }) },
    )
    expect(provider.delete).toHaveBeenCalledWith('b.jpg')
    expect(provider.delete).toHaveBeenCalledWith('c.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('a.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('d.jpg')
  })

  it('delete hook removes every key in the array', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({
      properties: { gallery: { provider, isArray: true } },
    })
    const result = feature(emptyOptions)
    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>

    const deleteHook = ((result.actions?.['delete'] as any).after as HookFn[])[0]!

    await deleteHook({}, {}, { record: makeRecord({ gallery: ['x.jpg', 'y.jpg', 'z.jpg'] }) })
    expect(provider.delete).toHaveBeenCalledWith('x.jpg')
    expect(provider.delete).toHaveBeenCalledWith('y.jpg')
    expect(provider.delete).toHaveBeenCalledWith('z.jpg')
  })

  it('handles null / empty array values without throwing', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({
      properties: { gallery: { provider, isArray: true } },
    })
    const result = feature(emptyOptions)
    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>

    const deleteHook = ((result.actions?.['delete'] as any).after as HookFn[])[0]!

    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!

    await deleteHook({}, {}, { record: makeRecord({ gallery: null }) })
    await deleteHook({}, {}, { record: makeRecord({ gallery: [] }) })
    await editHook(
      { record: { params: { gallery: [] } } },
      {},
      { record: makeRecord({ gallery: [] }) },
    )
    expect(provider.delete).not.toHaveBeenCalled()
  })
})

// ─── uploadFeature() — new.after + pending confirmation ──────────────────────

describe('uploadFeature() — new.after hook & pending confirmation', () => {
  beforeEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })
  afterEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })

  it('creates a new.after hook array', () => {
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature(emptyOptions)

    expect(Array.isArray((result.actions?.['new'] as any)?.after)).toBe(true)
  })

  it('chains onto an existing new.after hook', () => {
    const existing = mock(async (res: unknown) => res)
    const feature = uploadFeature({ properties: { avatar: { provider: makeProvider() } } })
    const result = feature({
      actions: { new: { after: existing } as ActionOptions },
    })

    const hooks = (result.actions?.['new'] as any).after as unknown[]
    expect(hooks.length).toBe(2)
    expect(hooks[0]).toBe(existing)
  })

  it('confirms freshly-uploaded keys after new', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string

    // Simulate the controller having tracked the key during upload.
    PendingUploadsRegistry.track('fresh-key.jpg', id, 60_000)
    expect(PendingUploadsRegistry.has('fresh-key.jpg')).toBe(true)

    type HookFn = (r: unknown, q: unknown, c: unknown) => unknown

    const newHook = ((result.actions?.['new'] as any).after as HookFn[])[0]!
    await newHook(
      { record: { params: { avatar: 'fresh-key.jpg' } } },
      {},
      { record: makeRecord({}) },
    )
    expect(PendingUploadsRegistry.has('fresh-key.jpg')).toBe(false)
  })

  it('confirms every key in an isArray property after new', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({
      properties: { gallery: { provider, isArray: true } },
    })
    const result = feature(emptyOptions)
    const id = result.properties?.gallery?.custom?.uploadProviderId as string

    PendingUploadsRegistry.track('a.jpg', id, 60_000)
    PendingUploadsRegistry.track('b.jpg', id, 60_000)
    PendingUploadsRegistry.track('c.jpg', id, 60_000)
    expect(PendingUploadsRegistry.size()).toBe(3)

    type HookFn = (r: unknown, q: unknown, c: unknown) => unknown

    const newHook = ((result.actions?.['new'] as any).after as HookFn[])[0]!
    await newHook(
      { record: { params: { gallery: ['a.jpg', 'b.jpg', 'c.jpg'] } } },
      {},
      { record: makeRecord({}) },
    )
    expect(PendingUploadsRegistry.size()).toBe(0)
  })

  it('confirms new keys after edit', async () => {
    const provider = makeProvider()
    const feature = uploadFeature({ properties: { avatar: { provider } } })
    const result = feature(emptyOptions)
    const id = result.properties?.avatar?.custom?.uploadProviderId as string
    PendingUploadsRegistry.track('replaced-by.jpg', id, 60_000)

    type HookFn = (r: unknown, q: unknown, c: unknown) => Promise<unknown>

    const editHook = ((result.actions?.['edit'] as any).after as HookFn[])[0]!
    await editHook(
      { record: { params: { avatar: 'replaced-by.jpg' } } },
      {},
      { record: makeRecord({ avatar: 'old.jpg' }) },
    )
    expect(PendingUploadsRegistry.has('replaced-by.jpg')).toBe(false)
  })
})

// ─── PendingUploadsRegistry ──────────────────────────────────────────────────

describe('PendingUploadsRegistry', () => {
  beforeEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })
  afterEach(() => {
    UploadProviderRegistry.clear()
    PendingUploadsRegistry.clear()
  })

  it('tracks a key with TTL', () => {
    PendingUploadsRegistry.track('k.jpg', 'p1', 60_000)
    expect(PendingUploadsRegistry.has('k.jpg')).toBe(true)
    expect(PendingUploadsRegistry.size()).toBe(1)
  })

  it('confirm() removes keys without invoking provider.delete', async () => {
    const provider = makeProvider()
    UploadProviderRegistry.register('p1', { provider })
    PendingUploadsRegistry.track('a.jpg', 'p1', 60_000)
    PendingUploadsRegistry.track('b.jpg', 'p1', 60_000)
    PendingUploadsRegistry.confirm(['a.jpg', 'b.jpg'])
    expect(PendingUploadsRegistry.size()).toBe(0)
    expect(provider.delete).not.toHaveBeenCalled()
  })

  it('confirm() ignores unknown keys', () => {
    PendingUploadsRegistry.track('a.jpg', 'p1', 60_000)
    PendingUploadsRegistry.confirm(['nonexistent.jpg'])
    expect(PendingUploadsRegistry.size()).toBe(1)
  })

  it('cancel() deletes the file via the provider and removes the entry', async () => {
    const provider = makeProvider()
    UploadProviderRegistry.register('p1', { provider })
    PendingUploadsRegistry.track('k.jpg', 'p1', 60_000)
    const ok = await PendingUploadsRegistry.cancel('k.jpg')
    expect(ok).toBe(true)
    expect(provider.delete).toHaveBeenCalledWith('k.jpg')
    expect(PendingUploadsRegistry.has('k.jpg')).toBe(false)
  })

  it('cancel() returns false for unknown / already-confirmed keys', async () => {
    const ok = await PendingUploadsRegistry.cancel('not-tracked')
    expect(ok).toBe(false)
  })

  it('cancel() swallows provider errors', async () => {
    const provider = makeProvider({
      delete: mock(async () => { throw new Error('storage down') }),
    })
    UploadProviderRegistry.register('p1', { provider })
    PendingUploadsRegistry.track('k.jpg', 'p1', 60_000)
    const ok = await PendingUploadsRegistry.cancel('k.jpg')
    expect(ok).toBe(true) // entry was removed; storage error is best-effort
  })

  it('sweep() removes entries past their TTL', async () => {
    const provider = makeProvider()
    UploadProviderRegistry.register('p1', { provider })
    // Two entries: one already expired, one fresh.
    PendingUploadsRegistry.track('expired.jpg', 'p1', -1) // expiresAt < now
    PendingUploadsRegistry.track('fresh.jpg', 'p1', 60_000)
    const swept = await PendingUploadsRegistry.sweep()
    expect(swept).toBe(1)
    expect(PendingUploadsRegistry.has('expired.jpg')).toBe(false)
    expect(PendingUploadsRegistry.has('fresh.jpg')).toBe(true)
    expect(provider.delete).toHaveBeenCalledWith('expired.jpg')
    expect(provider.delete).not.toHaveBeenCalledWith('fresh.jpg')
  })

  it('sweep() skips entries whose provider config is missing', async () => {
    PendingUploadsRegistry.track('orphan.jpg', 'unknown-provider', -1)
    const swept = await PendingUploadsRegistry.sweep()
    expect(swept).toBe(0)
    // Entry is still removed from the map even though delete could not run.
    expect(PendingUploadsRegistry.has('orphan.jpg')).toBe(false)
  })

  it('clear() empties the registry', () => {
    PendingUploadsRegistry.track('a', 'p', 60_000)
    PendingUploadsRegistry.track('b', 'p', 60_000)
    PendingUploadsRegistry.clear()
    expect(PendingUploadsRegistry.size()).toBe(0)
  })
})
