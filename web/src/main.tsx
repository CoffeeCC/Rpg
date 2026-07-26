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
//
// PRODUCTION ONLY, and that guard is not a nicety — it fixes a bug that cost
// this project hours across several sessions.
//
// `sw.js` is CACHE-FIRST for everything except navigations. A service worker
// intercepts fetches before they reach the network, so in dev it would answer
// every module request from its own cache and the dev server would never be
// asked. The symptoms are baffling in a specific way: you edit a file, reload,
// and the page keeps running the OLD module, while `fetch` of the same URL in
// the console returns the NEW source — because that fetch has a cache-busting
// query and therefore misses. Restarting Vite does nothing, since the stale
// copy lives in the browser. `Cache-Control` headers do nothing, since the
// network is never consulted.
//
// It was originally misdiagnosed as Vite's HMR websocket failing to connect.
// It was this.
//
// If a stale worker is already installed from a previous dev session, it will
// keep serving until it is removed — hence the unregister below rather than
// merely skipping registration.
const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ?? false
if ('serviceWorker' in navigator) {
  if (isProd) {
    window.addEventListener('load', () => {
      const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
      navigator.serviceWorker.register(`${base}sw.js`).catch(() => {})
    })
  } else {
    // Evict any worker installed by an earlier dev session, and drop its
    // caches, so a developer who hit this once is not stuck with it forever.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
    }
  }
}
