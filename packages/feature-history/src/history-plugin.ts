import type { GlobalPlugin } from '@modern-admin/core'
import { historyFeature } from './history-feature.js'
import type { HistoryPluginOptions } from './types.js'

export function historyPlugin(options: HistoryPluginOptions = {}): GlobalPlugin {
  const { include, exclude, ...featureOptions } = options
  const feature = historyFeature(featureOptions)
  return {
    name: 'history',
    ...(include !== undefined ? { include } : {}),
    ...(exclude !== undefined ? { exclude } : {}),
    apply: (resourceOptions) => feature(resourceOptions),
  }
}
