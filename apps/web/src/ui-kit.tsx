import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, UiKitGallery } from '@modern-admin/react'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root container missing')
createRoot(root).render(
  <I18nProvider>
    <UiKitGallery />
  </I18nProvider>,
)
