import { describe, expect, it } from 'bun:test'
import { estimateMediaGenerationPrice, type MediaGenerationCatalogModel } from '../src/index.js'

describe('estimateMediaGenerationPrice', () => {
  it('matches tariff dimensions and applies a linear unit price', () => {
    const model: MediaGenerationCatalogModel = {
      id: 'video',
      group: '',
      name: 'Video',
      type: 'video',
      tags: [],
      capabilities: [],
      params: [],
      priceFrom: '0.25',
      priceMultiplier: { param: 'seconds', catalogValue: 5 },
      pricing: [
        {
          key: 'landscape',
          price: '0.50',
          unitPrice: '0.10',
          isDefault: true,
          dimensions: { aspectRatio: '16:9' },
        },
        {
          key: 'portrait',
          price: '0.75',
          unitPrice: '0.15',
          isDefault: false,
          dimensions: { aspectRatio: '9:16' },
        },
      ],
    }

    expect(
      estimateMediaGenerationPrice(model, {
        aspectRatio: '9:16',
        seconds: 10,
      }),
    ).toBe(1.5)
  })
})
