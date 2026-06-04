import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getThemePref } from './lib/theme'

// aplica el tema antes de pintar (evita parpadeo)
applyTheme(getThemePref())
window
  .matchMedia?.('(prefers-color-scheme: dark)')
  .addEventListener?.('change', () => getThemePref() === 'auto' && applyTheme('auto'))

// Tipografías self-host (offline en la PWA)
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
