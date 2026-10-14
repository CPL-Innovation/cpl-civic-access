import { useEffect, useState } from 'react';
import { keepFlags } from '../config';
import { ASSIST, FAILS, FIX, FIXES, PLANS, SITE, THREED, checkedFor, pathOf, type FixId, type PlanId } from '../content';
import { T, plain } from '../lib/ph';
import { PhoneAsk } from './PhoneAsk';
import './phone.css';

function Shell({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = title + ' · TechCentral'; }, [title]);
  return (
    <div className="pp">
      <header className="p-hdr"><span><b>TechCentral</b> · Cleveland Public Library</span><span className="tag">{tag}</span></header>
      <main className="p-main">{children}</main>
    </div>
  );
}

function StaffBox() {
  return (
    <div className="pstaff">
      <b>Stuck? Staff can sort it out.</b>
      <span><T s={SITE.staff} /> <T s={SITE.hours} /></span>
    </div>
  );
}

function Foot({ k, url }: { k: string; url: string }) {
  return <p className="pfoot">From TechCentral · checked <T s={checkedFor(k)} /> · {url} <T s={SITE.shortUrlNote} /></p>;
}

export function PhonePlan({ id }: { id: PlanId }) {
  const plan = PLANS[id];
  const [open, setOpen] = useState(0);
  const [fail, setFail] = useState('');
  const failPick = FAILS.find((f) => f.id === fail);
  const is3d = id === 'A' || id === 'B';

  return (
    <Shell tag="Your plan" title={plan.title}>
      <div className="p-head">
        <span className="p-eye">{plan.eyebrow}</span>
        <h1 className="p-title">{plan.title}</h1>
        <p className="p-sub">From the TechCentral kiosk. Nothing about you is saved.</p>
      </div>
      <dl className="p-facts">
        {plan.facts.map((f) => <div key={f.k} style={{ display: 'contents' }}><dt>{f.k === 'Your job waits' ? 'Job waits' : f.k}</dt><dd><T s={f.v} /></dd></div>)}
      </dl>
      <ol className="p-steps">
        {plan.steps.map((st, i) => (
          <li key={i} id={'step-' + i}>
            <button className="pst" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
              <span className="psn">{i + 1}</span>
              <span className="pbody"><span className="ptext"><T s={st.text} /></span></span>
            </button>
            <div className="pacc" data-open={open === i} inert={open !== i} aria-hidden={open !== i}>
              <div className="pdet">
                <span><T s={st.detail} /></span>
                {st.alt && <span className="pslot" role="img" aria-label={plain(st.alt)}>Image slot · alt: “{plain(st.alt)}”</span>}
                {st.ref && <a className="pbtn p" href={keepFlags(pathOf(THREED.refUrl))}>Open reference mode</a>}
                {st.rules && <span>The rules: {THREED.rules.slice(1, 4).map((r) => r.k + ' — ' + plain(r.v)).join(' · ')}</span>}
                {st.fail && (
                  <>
                    {FAILS.map((f) => <button key={f.id} className="ropt" aria-pressed={fail === f.id} onClick={() => setFail(f.id)}>{f.label}<span aria-hidden="true">›</span></button>)}
                    {failPick?.safety && <div className="psafety" role="alert"><b>{ASSIST.safety}</b><span style={{ fontSize: 14 }}><T s={SITE.staff} /></span></div>}
                    {failPick && !failPick.safety && <p style={{ color: '#002A5C' }}><T s={failPick.fix} /> Still stuck? Staff can sort this out.</p>}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <PhoneAsk ctx={plan.ctx} chip={plan.chip} onJump={(a) => {
        if (a.step === undefined) return;
        const idx = typeof a.step === 'string' ? plan.idx?.[a.step] ?? 0 : a.step;
        setOpen(idx);
        requestAnimationFrame(() => document.getElementById('step-' + idx)?.scrollIntoView({ block: 'center' }));
      }} />
      <StaffBox />
      <Foot k={is3d ? id : 'print'} url={plan.url} />
    </Shell>
  );
}

export function PhoneFix({ id }: { id: FixId }) {
  const fix = FIX[id];
  return (
    <Shell tag="Print trouble" title={fix.label}>
      <div className="p-head">
        <span className="p-eye">{fix.label}</span>
        <h1 className="p-title">{fix.title}</h1>
        <p className="p-sub"><b>Likely cause:</b> <T s={fix.cause} /></p>
      </div>
      <ol className="p-steps">
        {fix.steps.map((t, i) => <li key={i}><div className="pst static"><span className="psn">{i + 1}</span><span className="pbody"><span className="ptext"><T s={t} /></span></span></div></li>)}
      </ol>
      <PhoneAsk ctx="fix" chip={'Print trouble · ' + fix.label} title="Ask about this" />
      <a className="pbtn" href={keepFlags(pathOf(FIXES.allFixesUrl))}>Something else? See all fixes</a>
      <StaffBox />
      <Foot k="fix" url={fix.url} />
    </Shell>
  );
}

export function PhoneFixes() {
  return (
    <Shell tag="Print trouble" title="Print didn’t come out?">
      <div className="p-head">
        <span className="p-eye">TechCentral · Release station</span>
        <h1 className="p-title">Print didn’t come out?</h1>
        <p className="p-sub">That happens. Pick the closest match.</p>
      </div>
      <nav className="pfixlist" aria-label="Fixes">
        {(Object.keys(FIX) as FixId[]).map((k) => <a key={k} href={keepFlags(pathOf(FIX[k].url))}>{FIX[k].label}<span aria-hidden="true">›</span></a>)}
      </nav>
      <StaffBox />
      <Foot k="fix" url={FIXES.allFixesUrl} />
    </Shell>
  );
}

export function PhoneRef() {
  const steps = THREED.refSteps as { text: string; alt: string; safety?: string }[];
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [wrong, setWrong] = useState(false);
  const [fail, setFail] = useState('');
  const st = steps[i];
  const last = i === steps.length - 1;
  const f = FAILS.find((x) => x.id === fail);
  const progress = `Step ${i + 1} of ${steps.length}`;
  useEffect(() => { document.title = 'Reference mode · 3D printer'; }, []);

  return (
    <div className="pp">
      <header className="p-hdr"><span><b>Reference mode</b> · 3D printer</span><span className="tag">{wrong ? 'Something’s wrong' : progress}</span></header>
      <main className="p-main" style={{ gap: 14 }}>
        {!wrong && (
          <>
            <div role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={progress} style={{ display: 'flex', gap: 4 }}>
              {steps.map((_, k) => <span key={k} style={{ flex: 1, height: 6, borderRadius: 3, background: k <= i ? '#0057B7' : '#CBC4BC' }} />)}
            </div>
            <div className={'rstep ' + dir} key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h1 className="p-title" style={{ fontSize: 30 }}><T s={st.text} /></h1>
            <div role="img" aria-label={plain(st.alt)} className="pslot" style={{ aspectRatio: '4/3', fontSize: 13 }}>Photo slot · alt: “{plain(st.alt)}”</div>
            {st.safety && (
              <div className="psafety" style={{ flexDirection: 'row', gap: 10, borderWidth: 2, fontSize: 15 }}>
                <span aria-hidden="true" style={{ fontWeight: 700 }}>⚠</span><p><b style={{ fontSize: 'inherit' }}>Safety:</b> <T s={st.safety} /></p>
              </div>
            )}
            </div>
            <button className="ropt" onClick={() => { setWrong(true); setFail(''); }}>Something’s wrong<span aria-hidden="true">›</span></button>
          </>
        )}
        {wrong && (
          <>
            <h1 className="p-title" style={{ fontSize: 26 }}>What do you see?</h1>
            {FAILS.map((x) => <button key={x.id} className="ropt" aria-pressed={fail === x.id} onClick={() => setFail(x.id)}>{x.label}<span aria-hidden="true">›</span></button>)}
            {f?.safety && <div className="psafety fadeup" role="alert"><b>{ASSIST.safety}</b><span style={{ fontSize: 14 }}><T s={SITE.staff} /></span></div>}
            {f && !f.safety && (
              <div className="pask fadeup" style={{ borderColor: '#CBC4BC' }} role="status" key={f.id}><p><T s={f.fix} /></p><p className="pai" style={{ fontSize: 14 }}>Still stuck? Staff can sort this out.</p></div>
            )}
            <button className="pbtn" onClick={() => { setWrong(false); setFail(''); }}>Back to the steps</button>
          </>
        )}
        <p className="pfoot" style={{ marginTop: 'auto' }}>From TechCentral · checked <T s={THREED.checkedDate} /></p>
      </main>
      {!wrong && (
        <nav className="rnav" aria-label="Steps">
          <button style={{ background: '#fff', color: '#0057B7' }} onClick={() => { setDir('back'); setI(Math.max(0, i - 1)); }} disabled={i === 0}>Back</button>
          <button style={{ background: '#0057B7', color: '#fff' }} onClick={() => { setDir(last ? 'back' : 'fwd'); setI(last ? 0 : i + 1); window.scrollTo(0, 0); }}>{last ? 'Done' : 'Next step'}</button>
        </nav>
      )}
    </div>
  );
}
