import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: register the service worker so Everdusk installs to the home screen and
// runs offline. Relative to BASE_URL so it works under the /Rpg/ Pages subpath.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {})
  })
}
