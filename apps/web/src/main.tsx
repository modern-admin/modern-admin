import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from '@modern-admin/ui'
import '@modern-admin/ui/styles.css'
import { App } from './App.js'

initTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
