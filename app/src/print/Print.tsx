import { useEffect, useState } from 'react';
import { FIX, FIXES, PLANS, SITE, TC_BASE, checkedFor, pathOf, type FixId, type PlanId } from '../content';
import { T } from '../lib/ph';
import { Qr } from '../lib/Qr';
import './print.css';

const q = new URLSearchParams(window.location.search);

function Toolbar({ title, children }: { title: string; children?: React.ReactNode }) {
  useEffect(() => { document.title = title + ' · TechCentral'; }, [title]);
  return (
    <div className="pr-bar">
      <b>{title}</b>
      {children}
      <a href={TC_BASE + '/links'}>Prototype index</a>
      <button className="p" onClick={() => window.print()}>Print</button>
    </div>
  );
}

const num = (n: number | string) => (
  <b style={{ flex: 'none', width: 34, height: 34, border: '2px solid #002A5C', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#002A5C' }}>{n}</b>
);
const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

/** Letter-size slip printed from the takeaway screen. ?plan=usb or ?fix=lost */
export function Slip() {
  const [sel, setSel] = useState(q.get('fix') ? 'fix:' + q.get('fix') : 'plan:' + (q.get('plan') || 'usb'));
  const [kind, id] = sel.split(':');
  const isFix = kind === 'fix';
  const plan = !isFix ? PLANS[(id as PlanId)] ?? PLANS.usb : null;
  const fix = isFix ? FIX[(id as FixId)] ?? FIX.lost : null;
  const title = plan ? plan.title : fix!.title;
  const steps = plan ? plan.steps.map((s) => s.text) : fix!.steps;
  const url = plan ? plan.url : fix!.url;
  const is3d = id === 'A' || id === 'B';
  const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <Toolbar title="Printed plan slip">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Slip for
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {(Object.keys(PLANS) as PlanId[]).map((k) => <option key={k} value={'plan:' + k}>{PLANS[k].chip}</option>)}
            {(Object.keys(FIX) as FixId[]).map((k) => <option key={k} value={'fix:' + k}>Fix · {FIX[k].label}</option>)}
          </select>
        </label>
      </Toolbar>
      <div className="pr-desk">
        <div className="pr-sheet" style={{ width: 816, minHeight: 1056, boxSizing: 'border-box', padding: '64px 72px', background: '#FFFFFF', color: '#111111', fontSize: 16, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #002A5C', paddingBottom: 10, fontSize: 13, color: '#002A5C' }}>
            <span><b style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>TechCentral</b> · Cleveland Public Library</span>
            <span>{plan ? plan.eyebrow : 'Print trouble'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-.015em', color: '#002A5C' }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 15, color: '#444444' }}>
              {fix ? <><b>Likely cause:</b> <T s={fix.cause} /></> : <>{words[steps.length] || steps.length} steps. Keep this with you while you {is3d ? 'plan your print' : 'print'}.</>}
            </p>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', borderTop: '1px solid #999999' }}>
            {steps.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px solid #999999', fontSize: 19, lineHeight: 1.4 }}>{num(i + 1)}<span><T s={t} /></span></li>
            ))}
          </ol>
          {plan && (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: '6px 16px', fontSize: 15 }}>
              {plan.facts.map((f) => <div key={f.k} style={{ display: 'contents' }}><dt style={{ fontWeight: 700 }}>{f.k}</dt><dd style={{ margin: 0 }}><T s={f.v} /></dd></div>)}
            </dl>
          )}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 18, border: '2px solid #002A5C', borderRadius: 6 }}>
            <Qr path={pathOf(url)} label={'QR code for ' + url} style={{ flex: 'none', width: 128, height: 128 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, color: '#444444' }}>The same {plan ? 'plan' : 'steps'}, with pictures, on your phone:</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#002A5C', letterSpacing: '.01em' }}>{url}</span>
              <T s={SITE.shortUrlNote} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 16 }}>
            <b style={{ fontSize: 18, color: '#002A5C' }}>Stuck? Staff can sort it out.</b>
            <span><T s={SITE.staff} /> <T s={SITE.hours} /></span>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #999999', paddingTop: 10, fontSize: 12, color: '#444444' }}>
            <span>From TechCentral · checked <T s={checkedFor(isFix ? 'fix' : id)} /></span>
            <span>Printed {now} · Nothing about you is stored.</span>
          </div>
        </div>
      </div>
      <style>{'@page{size:letter;margin:0}'}</style>
    </>
  );
}

/** 5.5 × 8.5 in card that sits at the release station. */
export function Card() {
  const steps = FIXES.releaseCard.map((c) => [c.h, c.t] as const);
  return (
    <>
      <Toolbar title="Release-station card (5.5 × 8.5 in)" />
      <div className="pr-desk">
        <div className="pr-sheet" style={{ width: 528, height: 816, boxSizing: 'border-box', padding: '44px 44px 40px', background: '#FBFAF6', color: '#002A5C', fontSize: 16, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 20, borderTop: '16px solid #0057B7', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#0057B7' }}>TechCentral · Release station</span>
          <h1 style={{ margin: 0, fontSize: 50, lineHeight: 1.02, fontWeight: 700, letterSpacing: '-.02em' }}>Print didn’t come out?</h1>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: 14, background: '#FFFFFF', border: '2px solid #002A5C', borderRadius: 6 }}>
            <Qr path={pathOf(FIXES.allFixesUrl)} label={'QR code for ' + FIXES.allFixesUrl} style={{ flex: 'none', width: 112, height: 112 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, color: '#505A69' }}>All the fixes, on your phone:</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{FIXES.allFixesUrl}</span>
              <T s={SITE.shortUrlNote} />
            </div>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map(([h, t], i) => (
              <li key={i} style={{ display: 'flex', gap: 12 }}>
                <b style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', background: '#E9E186', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</b>
                <span><b>{h}</b> <T s={t} /></span>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 16px', background: '#002A5C', color: '#F7F4ED', borderRadius: 6 }}>
            <b style={{ fontSize: 18 }}>Staff can sort this out.</b>
            <span style={{ fontSize: 15 }}>They’re at the TechCentral desk <T s={SITE.staffFromRelease} />. <T s={SITE.hours} /></span>
          </div>
          <span style={{ fontSize: 12, color: '#505A69' }}>From TechCentral · checked <T s={FIXES.checkedDate} /></span>
        </div>
      </div>
      <style>{'@page{size:5.5in 8.5in;margin:0}'}</style>
    </>
  );
}
