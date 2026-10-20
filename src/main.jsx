import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const updateSW = registerSW({
  immediate: true,

  onNeedRefresh() {
    const shouldReload = window.confirm(
      'A new version of ShiftClock is available. Reload now?',
    )

    if (shouldReload) {
      void updateSW(true)
    }
  },

  onRegisterError(error) {
    console.error('Service worker registration failed:', error)
  },
})
