import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPA: every path (/, /tc/usb, /print/slip …) is served by index.html.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
});
