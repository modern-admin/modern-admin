import { mount, readWindowConfig } from '@modern-admin/web'
import { adminComponents } from './admin-components.js'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('[modern-admin] expected #root container')

mount(container, {
  config: readWindowConfig(),
  components: adminComponents,
})
