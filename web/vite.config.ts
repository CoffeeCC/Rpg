import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the build works from any path (GitHub Pages subdirectory).
  base: './',
  server: {
    headers: {
      // NEVER cache source modules in dev.
      //
      // Vite normally relies on its HMR websocket to invalidate modules, and
      // in some embedded browsers that socket does not connect. When that
      // happens the page silently keeps executing STALE modules while a plain
      // `fetch` of the same URL returns the new source — so the file on disk,
      // the server response and the running code all disagree, and nothing
      // reports it.
      //
      // That cost hours: a lighting pass that appeared to contribute nothing
      // was really a stale sprite batcher, several versions old, which had
      // never been told to enable the vertex attribute the new shader reads.
      // Cache-busting the page's own imports did not help, because transitive
      // imports resolve to plain URLs.
      //
      // Dev only — this block does not affect the production build.
      'Cache-Control': 'no-store',
    },
  },
})
