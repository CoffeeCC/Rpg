import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the build works from any path (GitHub Pages subdirectory).
  base: './',
  server: {
    headers: {
      // Never cache source modules in dev. Belt to the braces in `main.tsx`.
      //
      // CORRECTION: this header was added believing Vite's HMR websocket was
      // the cause of stale modules. It was not, and this header alone did not
      // fix anything. The real culprit was the PWA service worker, which
      // `main.tsx` registered unconditionally — including in dev — and which
      // is cache-first for everything but navigations. A service worker
      // answers from its own cache without consulting the network at all, so
      // no response header can reach it. That is why restarting the dev server
      // never helped.
      //
      // The actual fix is the `isProd` guard in `main.tsx`. This stays as
      // defence in depth for any other cache between here and the browser, and
      // because it costs nothing in dev.
      'Cache-Control': 'no-store',
    },
  },
})
