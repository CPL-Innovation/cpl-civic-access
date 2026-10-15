/**
 * Where the library assistant relay lives.
 * Empty = same origin (Railway serves the pages and /api together; `npm run dev` proxies /api).
 * Set VITE_API_BASE at build time when the pages are hosted elsewhere, e.g. on Vercel:
 *   VITE_API_BASE=https://<your-service>.up.railway.app
 */
export const API = ((import.meta.env.VITE_API_BASE as string | undefined) || '').replace(/\/+$/, '');
