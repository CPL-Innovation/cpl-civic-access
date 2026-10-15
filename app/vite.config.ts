import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPA: every path (/, /libraryentrance, /staff, /techcentral/…) is served by index.html.
// /api goes to the library assistant relay (server/index.ts), started alongside by `npm run dev`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': { target: 'http://localhost:5181', changeOrigin: false } },
  },
});
