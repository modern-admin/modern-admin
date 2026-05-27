import { createAppConfig } from '../../eslint.base.config.mjs'

export default createAppConfig({
  node: true,
  ignores: ['template/**'],
})
