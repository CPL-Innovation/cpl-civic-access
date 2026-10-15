import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from './config';
import { TC_BASE, fixBySlug, planBySlug } from './content';
import Entrance from './entrance/Entrance';
import MicTestPage from './entrance/MicTestPage';
import Index from './Index';
import Kiosk from './kiosk/Kiosk';
import Links from './Links';
import { PhoneFix, PhoneFixes, PhonePlan, PhoneRef } from './phone/Phone';
import { Card, Slip } from './print/Print';
import Staff from './staff/Staff';

/**
 * One static build, one relay:
 *   /, /libraryentrance   Main Library entrance kiosk (the default home)
 *   /staff                Library assistant console (the human answering "Ask")
 *   /techcentral/…        The TechCentral prototype, as it was (kiosk, /tc/* phone pages, /print/*, /links)
 *   /mictest              Microphone record-and-replay check, for kiosk setup
 *   /links                Index of everything
 */
function techcentral(sub: string) {
  if (sub === '/') return <Kiosk />;
  if (sub === '/links') return <Links />;
  if (sub === '/print/slip') return <Slip />;
  if (sub === '/print/card') return <Card />;
  const m = sub.match(/^\/tc\/([\w-]+)$/);
  if (m) {
    if (m[1] === 'ref') return <PhoneRef />;
    if (m[1] === 'fix') return <PhoneFixes />;
    const plan = planBySlug(m[1]);
    if (plan) return <PhonePlan id={plan} />;
    const fix = fixBySlug(m[1]);
    if (fix) return <PhoneFix id={fix} />;
  }
  return <Links />;
}

function route() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/libraryentrance') {
    if (path === '/') window.history.replaceState(null, '', '/libraryentrance' + window.location.search);
    // Cut 1 rule: every fact shows as a visible placeholder tag. No sample values, not even behind a flag.
    config.placeholders = 'tags';
    return <Entrance />;
  }
  if (path === '/staff') return <Staff />;
  if (path === '/mictest') return <MicTestPage />;
  if (path === '/links') return <Index />;
  if (path === TC_BASE || path.startsWith(TC_BASE + '/')) return techcentral(path.slice(TC_BASE.length) || '/');
  // Old TechCentral paths (printed QR codes, bookmarks) moved under /techcentral.
  if (path.startsWith('/tc/') || path.startsWith('/print/')) {
    window.location.replace(TC_BASE + path + window.location.search);
    return null;
  }
  return <Index />;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{route()}</StrictMode>);

// Installable as a full-screen app on Android (Chrome → Add to Home screen / Install app). Production only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
