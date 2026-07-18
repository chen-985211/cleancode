import React from 'react'
import { createRoot } from 'react-dom/client'

import { AppShellRoot } from '../../presentation/app-shell/AppShellRoot'
import { applyInitialThemePreference } from '../../presentation/app-shell/themePreference'
import './renderer.css'

applyInitialThemePreference()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppShellRoot />
  </React.StrictMode>
)
