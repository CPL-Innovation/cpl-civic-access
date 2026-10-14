import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { fixBySlug, planBySlug } from './content';
import Kiosk from './kiosk/Kiosk';
import Links from './Links';
import { PhoneFix, PhoneFixes, PhonePlan, PhoneRef } from './phone/Phone';
import { Card, Slip } from './print/Print';

/** One static build: the kiosk at /, phone pages at /tc/*, printables at /print/*. */
function route() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return <Kiosk />;
  if (path === '/links') return <Links />;
  if (path === '/print/slip') return <Slip />;
  if (path === '/print/card') return <Card />;
  const m = path.match(/^\/tc\/([\w-]+)$/);
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

createRoot(document.getElementById('root')!).render(<StrictMode>{route()}</StrictMode>);
