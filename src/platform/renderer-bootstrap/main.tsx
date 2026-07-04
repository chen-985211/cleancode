import React from 'react'
import { createRoot } from 'react-dom/client'

import { AppShell } from '../../presentation/app-shell/AppShell'
import './renderer.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
)
