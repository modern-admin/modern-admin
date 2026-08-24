import { describe, expect, it } from 'bun:test'
import type { ActionContext, ActionRequest, BaseRecord, ResourceOptions } from '@modern-admin/core'
import {
  DEFAULT_MEDIA_GENERATION_ACTION,
  MEDIA_GENERATION_ACTION_COMPONENT,
  mediaGenerationFeature,
} from '../src/index.js'

describe('mediaGenerationFeature', () => {
  it('adds a record action and only interpolates allowlisted fields', async () => {
    const feature = mediaGenerationFeature({
      targetProperty: 'thumbnail',
      sourceProperties: ['name', 'details.color'],
      promptTemplate: 'Product {name}; color {details.color}; private {secret}',
      mediaTypes: ['image'],
    })
    const options = feature({} as ResourceOptions)
    const action = options.actions?.[DEFAULT_MEDIA_GENERATION_ACTION]
    const handler = action?.handler
    if (typeof handler !== 'function') throw new Error('Expected a media generation handler')
    const record = {
      params: { name: 'Cup', details: { color: 'blue' }, secret: 'hidden' },
      toJSON: () => ({ id: 'record-1', title: 'Cup', params: {} }),
    } as unknown as BaseRecord

    const result = await handler({} as ActionRequest, { record } as ActionContext)

    expect(action?.actionType).toBe('record')
    expect(action?.component).toBe(MEDIA_GENERATION_ACTION_COMPONENT)
    expect(result.mediaGeneration).toMatchObject({
      targetProperty: 'thumbnail',
      mediaTypes: ['image'],
      suggestedPrompt: 'Product Cup; color blue; private ',
    })
    expect(JSON.stringify(result)).not.toContain('hidden')
  })
})
