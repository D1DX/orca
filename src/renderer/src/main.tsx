import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FloatingTerminalWindowApp } from './components/floating-terminal/FloatingTerminalWindowApp'
import { applyDocumentTheme } from './lib/document-theme'

if (import.meta.env.DEV) {
  import('react-grab').then(({ init }) => init())
  import('react-grab/styles.css')
}

applyDocumentTheme('system', { disableTransitions: false })

const RootApp =
  new URLSearchParams(window.location.search).get('orcaSurface') === 'floating-terminal'
    ? FloatingTerminalWindowApp
    : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
)
