import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@modern-admin/ui/styles.css'
import { App } from './App.js'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
