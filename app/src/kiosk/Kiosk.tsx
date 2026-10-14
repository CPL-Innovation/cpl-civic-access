import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { config } from '../config';
import {
  ASSIST, FAILS, FIX, FIXES, PLANS, PRINTING, SITE, THREED, checkedFor, pathOf,
  type Ctx, type FixId, type PlanId,
} from '../content';
import { answerSource, type Answer } from '../lib/assistant';
import { Icon, type IconName } from '../lib/Icon';
import { T, plain } from '../lib/ph';
import { Qr } from '../lib/Qr';
import { speech } from '../lib/speech';
import './kiosk.css';

type Screen = 'attract' | 'home' | 'other' | 'p0' | 'plan' | 'step' | 'take' | 'px' | 'fx' | 'fxother' | 'm0' | 'm1' | 'rules';
type Ov = '' | 'assistant' | 'a11y' | 'staff' | 'idle';
type YN = '' | 'y' | 'n';

interface Snap { screen: Screen; plan: PlanId; sym: FixId; step: number; takeFrom: 'plan' | 'fix' }
interface S extends Snap {
  ov: Ov; prevOv: Ov;
  // assistant
  actx: Ctx; kb: boolean; typed: string; noticeSeen: boolean; asking: string | null; answer: Answer | null; vote: '' | 'up' | 'down';
  // a11y
  lg: boolean; hc: boolean; read: boolean;
  added: string[]; took: boolean;
  sc: boolean; scAns: YN[]; fail: string; rulesOpen: boolean;
  hist: Snap[]; count: number;
}

const fresh = (): S => ({
  screen: 'attract', plan: 'usb', sym: 'lost', step: 0, takeFrom: 'plan',
  ov: '', prevOv: '',
  actx: 'print', kb: false, typed: '', noticeSeen: false, asking: null, answer: null, vote: '',
  lg: false, hc: false, read: false,
  added: [], took: false,
  sc: false, scAns: ['', '', ''], fail: '', rulesOpen: false,
  hist: [], count: config.countdown,
});
const snap = (s: S): Snap => ({ screen: s.screen, plan: s.plan, sym: s.sym, step: s.step, takeFrom: s.takeFrom });

const KEYROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM?'];

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return vp;
}

/* ---------- small pieces ---------- */

const Chev = () => <Icon n="chev" className="chev" />;

function Choice({ icon, label, sub, onClick, big, pressed, style }: { icon?: IconName; label: React.ReactNode; sub?: React.ReactNode; onClick: () => void; big?: boolean; pressed?: boolean; style?: React.CSSProperties }) {
  return (
    <button className={'choice' + (big ? ' big' : '')} onClick={onClick} aria-pressed={pressed} style={style}>
      {icon && <span className="cic"><Icon n={icon} w={1.75} /></span>}
      <span className="ctx"><span className="cl" style={big ? undefined : { fontSize: '.98em' }}>{label}</span>{sub && <span className="cs">{sub}</span>}</span>
      <Chev />
    </button>
  );
}

function Src({ k, policy }: { k: string; policy?: boolean }) {
  return <p className="src">From TechCentral{policy ? ' 3D printing policy' : ''} · checked <T s={checkedFor(k)} /></p>;
}

function Slot({ alt, kind = 'Screenshot or photo slot', style }: { alt: string; kind?: string; style?: React.CSSProperties }) {
  return (
    <div className="islot" role="img" aria-label={alt} style={style}>
      <Icon n="image" w={1.5} />
      <span>{kind} · alt: “{alt}”</span>
    </div>
  );
}

function Staff() { return <T s={SITE.staff} />; }

function SafetyBox() {
  return (
    <div className="ansbox safety" role="alert">
      <span className="rhead"><Icon n="warn" />Safety</span>
      <p className="ans">{ASSIST.safety}</p>
      <p className="tb" style={{ color: 'inherit' }}><Staff /></p>
      <p className="ailabel" style={{ color: 'inherit' }}>{ASSIST.safetyFoot}</p>
    </div>
  );
}

function ProtoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="proto" href={href} target="_blank" rel="noreferrer">{children}<Icon n="external" /></a>;
}

/* ---------- the kiosk ---------- */

export default function Kiosk() {
  const vp = useViewport();
  const land = config.orientation === 'auto' ? vp.w > vp.h : config.orientation === 'landscape';
  const W = land ? 1920 : 1080, H = land ? 1080 : 1920;
  const scale = config.fit ? Math.min(vp.w / W, vp.h / H) : 1;

  const [s, setS] = useState<S>(fresh);
  const last = useRef(Date.now());
  const askToken = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const set = useCallback((p: Partial<S> | ((s: S) => Partial<S>)) => {
    last.current = Date.now();
    setS((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }));
  }, []);
  const go = useCallback((p: Partial<S>) => set((prev) => ({ hist: [...prev.hist, snap(prev)], ov: '', fail: '', took: false, rulesOpen: false, ...p })), [set]);
  const back = () => set((prev) => {
    if (prev.ov) return { ov: '' };
    const h = prev.hist.slice();
    const p = h.pop();
    if (!p) return { screen: 'home', hist: [] };
    return { ...p, hist: h, fail: '', took: false };
  });
  const reset = useCallback(() => {
    askToken.current++;
    speech.stop();
    trigger.current = null;
    last.current = Date.now();
    setS(fresh());
  }, []);

  /* Idle: 50 s without a touch → “Still there?” with a 15 s countdown → full reset. */
  useEffect(() => {
    if (!config.timers) return;
    const id = setInterval(() => {
      setS((prev) => {
        if (prev.screen === 'attract') { last.current = Date.now(); return prev; }
        if (prev.ov === 'idle') {
          const c = prev.count - 1;
          if (c <= 0) { last.current = Date.now(); return fresh(); }
          return { ...prev, count: c };
        }
        if (Date.now() - last.current > config.idleMs) return { ...prev, ov: 'idle', prevOv: prev.ov, count: config.countdown };
        return prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Back on the welcome screen (Start over, Done, or timeout): drop anything still in flight.
  useEffect(() => {
    if (s.screen === 'attract') { askToken.current++; speech.stop(); }
  }, [s.screen]);

  // Remember what opened an overlay, unless it was a button inside another overlay.
  const remember = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && !el.closest('[role=dialog]')) trigger.current = el;
  };
  const openOv = (ov: Ov) => { remember(); set({ ov }); };
  const closeOv = () => set({ ov: '' });

  /* Focus moves into an overlay and back to its trigger on close. */
  useEffect(() => {
    if (s.ov) {
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector<HTMLElement>(s.ov === 'idle' ? '.idle .btn-p' : '[role=dialog] .xbtn');
        el?.focus();
      });
    } else if (trigger.current) {
      const t = trigger.current;
      trigger.current = null;
      if (document.contains(t)) t.focus();
      else rootRef.current?.querySelector<HTMLElement>('.main .title')?.focus();
    }
  }, [s.ov]);

  /* New screen: scroll to top and put focus on its heading. */
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (!s.ov && s.screen !== 'attract') rootRef.current?.querySelector<HTMLElement>('.main .title')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.plan, s.step, s.sym]);

  const plan = PLANS[s.plan];
  const fix = FIX[s.sym];
  const stepN = Math.max(0, Math.min(plan.steps.length - 1, s.step));
  const cur = plan.steps[stepN];

  /* ---------- assistant ---------- */
  const openAsk = (ctx: Ctx) => {
    remember();
    askToken.current++;
    set({ ov: 'assistant', actx: ctx, answer: null, asking: null, kb: false, typed: '', vote: '' });
  };
  const ask = async (input: { id?: string; text?: string }, label: string) => {
    const tok = ++askToken.current;
    const ctx = s.actx;
    set({ asking: label, answer: null, kb: false, noticeSeen: true, vote: '' });
    const a = await answerSource.ask(ctx, input);
    if (tok !== askToken.current) return;
    setS((prev) => ({ ...prev, asking: null, answer: a }));
  };
  const askTyped = () => {
    const t = s.typed.trim();
    if (!t) return;
    ask({ text: t }, t);
  };
  const jump = (a: Answer) => {
    if (a.to) { go(a.to as Partial<S>); return; }
    if (a.step === undefined) return;
    const idx = typeof a.step === 'string' ? plan.idx?.[a.step] ?? 0 : a.step;
    go({ screen: 'step', step: idx });
  };

  // A physical keyboard also works while the on-screen keyboard is open (handy for testing).
  useEffect(() => {
    if (!(s.ov === 'assistant' && s.kb)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') set((p) => ({ typed: p.typed.slice(0, -1) }));
      else if (e.key === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON') askTyped(); }
      else if (e.key.length === 1 && /[\w ?'’,.-]/.test(e.key)) { e.preventDefault(); set((p) => ({ typed: (p.typed + e.key).slice(0, 120) })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- read aloud ---------- */
  const readMap: Record<Screen, string> = {
    attract: '',
    home: 'What brings you in? Four choices: I need to print something. My print didn’t come out. I want to 3D print something. Something else.',
    other: 'Staff can help with that. ' + plain(SITE.staff) + ' ' + plain(SITE.hours),
    p0: 'Where’s your file? Four choices: On my phone. On a USB drive. In my email. I need to type or make it here.',
    plan: plan.title + '. ' + plan.steps.map((st, i) => `Step ${i + 1}: ${plain(st.text)}`).join(' '),
    step: `Step ${stepN + 1} of ${plan.steps.length}. ${plain(cur.text)} ${plain(cur.detail)}`,
    take: 'How do you want to take your plan? Tell staff at the desk: ' + (s.takeFrom === 'fix' ? fix.say : plan.say),
    px: 'What happened? Six choices. ' + Object.values(FIX).map((f) => f.label).join('. ') + '. Something else.',
    fx: fix.title + ' ' + fix.steps.map((t, i) => `Step ${i + 1}: ${plain(t)}`).join(' '),
    fxother: 'Something else went wrong. Ask here, or ask a person.',
    m0: 'What you can make. ' + plain(THREED.intro.lead) + ' ' + plain(THREED.intro.cost),
    m1: 'Which way is right for you? Two choices: We print it for you, recommended for your first print. Or run it yourself.',
    rules: 'The rules, in plain words. ' + THREED.rules.map((r) => r.k + ': ' + plain(r.v)).join('. '),
  };
  const ovRead: Record<string, string> = {
    a11y: 'Accessibility options. Larger text. High contrast. Read aloud.',
    staff: 'Staff can help. ' + plain(SITE.staff),
    idle: `Still there? We’ll start over for the next person in ${config.countdown} seconds.`,
  };
  let readText = readMap[s.screen];
  if (s.ov === 'assistant') readText = s.answer ? (s.answer.kind === 'safety' ? 'Safety. ' : '') + plain(s.answer.text) : 'Ask about this. Tap a question.';
  else if (s.ov && ovRead[s.ov]) readText = ovRead[s.ov];
  useEffect(() => { if (s.read) speech.say(readText); }, [s.read, readText]);
  useEffect(() => { if (!s.read) speech.stop(); }, [s.read]);

  /* ---------- screens ---------- */

  const scr = (() => {
    switch (s.screen) {
      case 'home': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">Welcome to TechCentral</span>
            <h1 className="title" tabIndex={-1}>What brings you in?</h1>
            <p className="lead">Tap one. You can start over any time.</p>
          </div>
          <div className="act">
            <div className="choices c2">
              <Choice big icon="printer" label="I need to print something" sub="Paper, today. We’ll make you a short plan." onClick={() => go({ screen: 'p0' })} />
              <Choice big icon="info" label="My print didn’t come out" sub="That happens. Let’s find it." onClick={() => go({ screen: 'px' })} />
              <Choice big icon="cube" label="I want to 3D print something" sub="See what’s possible, the rules, and your options." onClick={() => go({ screen: 'm0' })} />
              <Choice big icon="user" label="Something else" sub="Where staff are, and today’s hours." onClick={() => go({ screen: 'other' })} />
            </div>
            <p className="src">This screen is public. Nothing you choose here is saved.</p>
          </div>
        </section>
      );

      case 'other': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">Something else</span>
            <h1 className="title" tabIndex={-1}>Staff can help with that.</h1>
            <p className="lead">This screen covers printing and 3D printing. For anything else, staff at the desk can point you the right way.</p>
          </div>
          <div className="act">
            <Slot kind="Image slot" alt="The TechCentral desk, seen from this kiosk." />
            <div className="card"><div className="cbody"><span className="th"><Staff /></span><span className="tb"><T s={SITE.hours} /></span></div></div>
            <div className="cta"><button className="btn btn-p" onClick={() => go({ screen: 'home' })}>Back to the start</button></div>
            <Src k="site" />
          </div>
        </section>
      );

      case 'p0': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">Printing</span>
            <h1 className="title" tabIndex={-1}>Where’s your file?</h1>
            <p className="lead">Pick the closest match. We’ll make a plan for it.</p>
          </div>
          <div className="act">
            <div className="choices c2">
              <Choice big icon="phone" label="On my phone" sub={<T s={PRINTING.sourceNote} />} onClick={() => go({ screen: 'plan', plan: 'phone' })} />
              <Choice big icon="usb" label="On a USB drive" sub="Plug it into any patron computer." onClick={() => go({ screen: 'plan', plan: 'usb' })} />
              <Choice big icon="mail" label="In my email" sub="Open it on a patron computer." onClick={() => go({ screen: 'plan', plan: 'email' })} />
              <Choice big icon="monitor" label="I need to type or make it here" sub="Use a computer here to make it, then print." onClick={() => go({ screen: 'plan', plan: 'make' })} />
            </div>
          </div>
        </section>
      );

      case 'plan': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">{plan.eyebrow}</span>
            <h1 className="title" tabIndex={-1}>{plan.title}</h1>
            <div className="facts">
              {plan.facts.map((f) => <div className="fact" key={f.k}><span className="fk">{f.k}</span><span className="fv"><T s={f.v} /></span></div>)}
            </div>
          </div>
          <div className="act">
            <span className="hint">{plan.steps.length} steps · tap any step for details</span>
            <ol className="steps">
              {plan.steps.map((st, i) => (
                <li key={i}>
                  <button className="step" onClick={() => go({ screen: 'step', step: i })}>
                    <span className="sn" aria-label={`Step ${i + 1}`}>{i + 1}</span>
                    <span className="st"><T s={st.text} /></span>
                    {st.fail
                      ? <span className="simg" aria-hidden="true"><Icon n="warn" w={1.75} /></span>
                      : <span className="simg" role="img" aria-label={'Image slot: ' + plain(st.alt || st.text)}><Icon n="image" w={1.75} /></span>}
                    <Chev />
                  </button>
                </li>
              ))}
            </ol>
            <div className="cta">
              <button className="btn btn-p" onClick={() => go({ screen: 'take', takeFrom: 'plan' })}>Take this with you</button>
              <button className="btn btn-s" onClick={() => openAsk(plan.ctx)}><Icon n="chat" />Ask about this plan</button>
            </div>
            <Src k={s.plan} />
          </div>
        </section>
      );

      case 'step': {
        const failPick = FAILS.find((f) => f.id === s.fail);
        const last = stepN === plan.steps.length - 1;
        return (
          <section className="scr">
            <div className="info">
              <span className="eyebrow">Step {stepN + 1} of {plan.steps.length} · {plan.title}</span>
              <h1 className="title" style={{ fontSize: '1.6em' }} tabIndex={-1}><T s={cur.text} /></h1>
              <p className="lead"><T s={cur.detail} /></p>
            </div>
            <div className="act">
              {!cur.fail && <Slot alt={plain(cur.alt)} />}
              {cur.ref && (
                <div className="card">
                  <Qr className="qr sm" path={pathOf(THREED.refUrl)} label={'QR code: reference mode on your phone, ' + THREED.refUrl} />
                  <div className="cbody">
                    <span className="th">Reference mode on your phone</span>
                    <span className="url">{THREED.refUrl} <T s={SITE.shortUrlNote} /></span>
                    <span className="tb">No phone? The same steps are on the card beside each printer.</span>
                    <ProtoLink href={pathOf(THREED.refUrl)}>Prototype: open reference mode</ProtoLink>
                  </div>
                </div>
              )}
              {cur.fail && (
                <>
                  <div className="choices">
                    {FAILS.map((f) => (
                      <Choice key={f.id} label={<span style={{ fontSize: '.95em' }}>{f.label}</span>} pressed={s.fail === f.id}
                        style={s.fail === f.id ? { borderColor: 'var(--brand)', borderWidth: 3 } : undefined}
                        onClick={() => set({ fail: f.id })} />
                    ))}
                  </div>
                  {failPick?.safety && <SafetyBox />}
                  {failPick && !failPick.safety && (
                    <div className="ansbox" role="status"><p className="ans"><T s={failPick.fix} /></p><p className="tb">Still stuck? Staff can sort this out.</p></div>
                  )}
                </>
              )}
              {cur.rules && <button className="link" onClick={() => go({ screen: 'rules' })}>See the rules</button>}
              <span className="hint">Step {stepN + 1} of {plan.steps.length}</span>
              <div className="cta">
                <div className="row2">
                  <button className="btn btn-s" onClick={back}><Icon n="left" />Back to plan</button>
                  {!last && <button className="btn btn-p" onClick={() => set({ step: stepN + 1, fail: '' })}>Next step<Icon n="right" /></button>}
                  {last && <button className="btn btn-p" onClick={() => go({ screen: 'take', takeFrom: 'plan' })}>Take this with you</button>}
                </div>
              </div>
              <Src k={s.plan} />
            </div>
          </section>
        );
      }

      case 'take': {
        const fromFix = s.takeFrom === 'fix';
        const t = fromFix ? { name: 'Fix · ' + fix.label, url: fix.url, say: fix.say } : { name: plan.chip, url: plan.url, say: plan.say };
        const slipHref = '/print/slip?' + (fromFix ? 'fix=' + s.sym : 'plan=' + s.plan) + (config.placeholders !== 'mock' ? '&ph=' + config.placeholders : '');
        return (
          <section className="scr">
            <div className="info">
              <span className="eyebrow">Take this with you</span>
              <h1 className="title" tabIndex={-1}>How do you want to take your plan?</h1>
              <span className="ctxchip">{t.name}</span>
              <p className="lead">Pick any. Nothing about you is saved.</p>
            </div>
            <div className="act">
              <div className="takes">
                {config.hasPrinter && (
                  <div className="card">
                    <span className="cic"><Icon n="printer" w={1.75} /></span>
                    <div className="cbody">
                      <span className="th">Print it</span>
                      <span className="tb">A slip with your plan, the short link, and where staff are. <T s={SITE.slipFree} /></span>
                      {!s.took
                        ? <button className="btn btn-s" onClick={() => set({ took: true })}>Print my plan</button>
                        : <span className="ok" role="status"><Icon n="check" w={2.5} /><span>Printing now. Take it <T s={SITE.slipWhere} />.</span></span>}
                      {s.took && <ProtoLink href={slipHref}>Prototype: see the slip</ProtoLink>}
                    </div>
                  </div>
                )}
                <div className="card">
                  <Qr className="qr" path={pathOf(t.url)} label={'QR code for ' + t.url} />
                  <div className="cbody">
                    <span className="th">Scan to your phone</span>
                    <span className="url"><a href={pathOf(t.url)} target="_blank" rel="noreferrer">{t.url}</a></span>
                    <T s={SITE.shortUrlNote} />
                    <span className="tb">Point your camera at the code, or type the link.</span>
                  </div>
                </div>
                <div className="card">
                  <span className="cic"><Icon n="user" w={1.75} /></span>
                  <div className="cbody">
                    <span className="th">Show staff</span>
                    <span className="tb">Tell staff at the desk:</span>
                    <span className="say">{t.say}</span>
                    <span className="tb"><Staff /></span>
                  </div>
                </div>
              </div>
              {s.added.length > 0 && (
                <div className="fact">
                  <span className="fk">Also on your plan</span>
                  <ul className="added-list">{s.added.map((q) => <li key={q} className="fv">{q}</li>)}</ul>
                </div>
              )}
              <div className="cta">
                <p className="th" style={{ textAlign: 'center' }}>You’re all set.</p>
                <div className="row2">
                  <button className="btn btn-s" onClick={() => set({ screen: 'home', hist: [], took: false, ov: '' })}>Something else</button>
                  <button className="btn btn-p" onClick={reset}><Icon n="check" w={2.5} />Done</button>
                </div>
              </div>
              <Src k={fromFix ? 'fix' : s.plan} />
            </div>
          </section>
        );
      }

      case 'px': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">My print didn’t come out</span>
            <h1 className="title" tabIndex={-1}>What happened?</h1>
            <p className="lead">That happens. Pick the closest match.</p>
          </div>
          <div className="act">
            <div className="choices">
              {(Object.keys(FIX) as FixId[]).map((k) => <Choice key={k} label={FIX[k].label} onClick={() => go({ screen: 'fx', sym: k })} />)}
              <Choice label="Something else" onClick={() => go({ screen: 'fxother' })} />
            </div>
          </div>
        </section>
      );

      case 'fx': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">{fix.label}</span>
            <h1 className="title" style={{ fontSize: '1.65em' }} tabIndex={-1}>{fix.title}</h1>
            <p className="lead"><b>Likely cause:</b> <T s={fix.cause} /></p>
          </div>
          <div className="act">
            <ol className="steps">
              {fix.steps.map((t, i) => <li className="step" key={i}><span className="sn" aria-label={`Step ${i + 1}`}>{i + 1}</span><span className="st"><T s={t} /></span></li>)}
            </ol>
            <div className="card">
              <Qr className="qr sm" path={pathOf(fix.url)} label={'QR code for ' + fix.url} />
              <div className="cbody">
                <span className="th" style={{ fontSize: '.9em' }}>Scan to your phone</span>
                <span className="url" style={{ fontSize: '.9em' }}><a href={pathOf(fix.url)} target="_blank" rel="noreferrer">{fix.url}</a> <T s={SITE.shortUrlNote} /></span>
                <span className="tb">Take these steps back to the computer or printer.</span>
              </div>
            </div>
            <div className="card" style={{ alignItems: 'center' }}>
              <span className="cic"><Icon n="user" w={1.75} /></span>
              <div className="cbody"><span className="th" style={{ fontSize: '.9em' }}>Still stuck? Staff can sort this out.</span><span className="tb"><Staff /></span></div>
            </div>
            <div className="cta">
              <div className="row2">
                <button className="btn btn-s" onClick={() => openAsk('fix')}><Icon n="chat" />Ask about this</button>
                <button className="btn btn-p" onClick={() => go({ screen: 'take', takeFrom: 'fix' })}>Take this with you</button>
              </div>
            </div>
            <Src k="fix" />
          </div>
        </section>
      );

      case 'fxother': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">My print didn’t come out</span>
            <h1 className="title" tabIndex={-1}>Something else went wrong.</h1>
            <p className="lead">Ask here, or ask a person. Both work.</p>
          </div>
          <div className="act">
            <div className="ways">
              <button className="way" onClick={() => openAsk('fix')}><span className="wt">Ask about it here</span><span className="wb">Pick a common question or type your own. Answers come from TechCentral’s guide.</span><span className="wgo">Ask here<Icon n="right" /></span></button>
              <button className="way" onClick={() => openOv('staff')}><span className="wt">Ask staff</span><span className="wb"><Staff /></span><span className="wgo">Where staff are<Icon n="right" /></span></button>
            </div>
          </div>
        </section>
      );

      case 'm0': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">3D printing</span>
            <h1 className="title" tabIndex={-1}>What you can make</h1>
            <p className="lead"><T s={THREED.intro.lead} /></p>
            <p className="lead"><T s={THREED.intro.cost} /></p>
          </div>
          <div className="act">
            <div className="gal">
              {THREED.gallery.map((g) => (
                <div className="gslot" role="img" aria-label={'Photo slot: ' + plain(g)} key={g}><Icon n="image" w={1.5} /><span><T s={g} /></span></div>
              ))}
            </div>
            <div className="cta">
              <button className="btn btn-p" onClick={() => go({ screen: 'm1' })}>Let’s start</button>
              <button className="btn btn-s" onClick={() => go({ screen: 'rules' })}><Icon n="book" />See the rules first</button>
            </div>
            <Src k="m0" />
          </div>
        </section>
      );

      case 'm1': {
        const v = s.scAns;
        const sugg = v.some((x) => !x) ? 'Answer all three for a suggestion. You still decide.'
          : v.every((x) => x === 'y') ? 'Suggestion: Run it yourself could suit you. You decide.'
          : 'Suggestion: We print it for you is a good fit. You decide.';
        return (
          <section className="scr">
            <div className="info">
              <span className="eyebrow">3D printing</span>
              <h1 className="title" tabIndex={-1}>Which way is right for you?</h1>
              <p className="lead">Both get you a print. You choose.</p>
            </div>
            <div className="act">
              <div className="ways">
                <button className="way rec" onClick={() => go({ screen: 'plan', plan: 'A' })}>
                  <span className="tag">Recommended for your first print</span>
                  <span className="wt">We print it for you</span>
                  <span className="wb">You bring the file; staff set up and run the printer.</span>
                  <span className="wb">Most people start here, including people who’ve printed before. Our staff know these machines’ quirks.</span>
                  <span className="wgo">See this plan<Icon n="right" /></span>
                </button>
                <button className="way" onClick={() => go({ screen: 'plan', plan: 'B' })}>
                  <span className="wt">Run it yourself</span>
                  <span className="wb"><T s={THREED.wayB} /></span>
                  <span className="wgo">See this plan<Icon n="right" /></span>
                </button>
              </div>
              {!s.sc && <button className="link" onClick={() => set({ sc: true })} aria-expanded={false}>Help me choose: three quick questions</button>}
              {s.sc && (
                <div className="sc" role="group" aria-label="Help me choose">
                  {THREED.selfCheck.map((q, i) => (
                    <div className="scq" key={q}>
                      <span id={'scq' + i}>{q}</span>
                      <span className="seg" role="group" aria-labelledby={'scq' + i}>
                        {(['y', 'n'] as const).map((yn) => (
                          <button key={yn} className={'segb' + (v[i] === yn ? ' on' : '')} aria-pressed={v[i] === yn}
                            onClick={() => set((p) => { const a = p.scAns.slice(); a[i] = yn; return { scAns: a }; })}>
                            {yn === 'y' ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                  <p className="sugg" role="status">{sugg}</p>
                </div>
              )}
              <button className="link" onClick={() => openAsk('m1')}>Not sure which? Ask.</button>
              <Src k="m1" />
            </div>
          </section>
        );
      }

      case 'rules': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">3D printing</span>
            <h1 className="title" tabIndex={-1}>The rules, in plain words</h1>
            <p className="lead">Check these before you start. Staff make the final call.</p>
          </div>
          <div className="act">
            <dl className="rules">
              {THREED.rules.map((r) => <div className="rule" key={r.k}><dt className="rk">{r.k}</dt><dd style={{ margin: 0 }}><T s={r.v} /></dd></div>)}
            </dl>
            <button className="link" onClick={() => set({ rulesOpen: !s.rulesOpen })} aria-expanded={s.rulesOpen}>{s.rulesOpen ? 'Hide the official policy' : 'Read the official policy'}</button>
            {s.rulesOpen && <div className="policy">{THREED.policy.map((p, i) => <p key={i} style={{ marginBottom: '.6em' }}><T s={p} /></p>)}</div>}
            <div className="cta"><button className="btn btn-p" onClick={() => go({ screen: 'm1' })}>Let’s start</button></div>
            <Src k="rules" policy />
          </div>
        </section>
      );

      default: return null;
    }
  })();

  /* ---------- overlays ---------- */

  const shown: Ov = s.ov === 'idle' ? s.prevOv : s.ov;

  const ctxChip = s.actx === 'fix' ? 'Print trouble · ' + (s.screen === 'fxother' ? 'Something else' : fix.label)
    : s.actx === 'm1' ? '3D printing · Which way is right for you?' : plan.chip;

  const a = s.answer;
  const added = !!a && s.added.includes(a.q);
  const assistant = (
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="ask-t">
      <div className="sh-h">
        <Icon n="chat" style={{ width: '1.2em', height: '1.2em', color: 'var(--brand)' }} />
        <span className="sh-t" id="ask-t">Ask about this</span>
        <button className="xbtn" onClick={closeOv}><Icon n="x" w={2.5} />Close</button>
      </div>
      <div className="sh-b">
        <span className="ctxchip">{ctxChip}</span>
        {!s.noticeSeen && (
          <div className="notice" role="note"><p><b>This screen is public.</b> Don’t type personal information. Everything is erased when you finish.</p><button className="xbtn" onClick={() => set({ noticeSeen: true })}>OK</button></div>
        )}
        {!a && !s.asking && !s.kb && (
          <>
            <span className="hint" id="qhint">Tap a question</span>
            <div className="qlist" role="group" aria-labelledby="qhint">
              {answerSource.suggestions(s.actx).map((x) => (
                <button className="qchip" key={x.id} onClick={() => ask({ id: x.id }, x.q)}><span>{x.q}</span><Icon n="chev" /></button>
              ))}
            </div>
            <button className="link" onClick={() => set({ kb: true, noticeSeen: true })}>Type a question instead</button>
          </>
        )}
        {!a && !s.asking && s.kb && (
          <>
            <span className="hint" id="kq-l">Type your question</span>
            <div className="typed" role="textbox" aria-readonly="true" aria-labelledby="kq-l" aria-live="polite">
              {s.typed || <span className="ph-hint">Tap the letters below</span>}<span className="caret" />
            </div>
            <div className="kb" role="group" aria-label="On-screen keyboard">
              {KEYROWS.map((row) => (
                <div className="krow" key={row}>
                  {row.split('').map((k) => <button className="key" key={k} onClick={() => set((p) => ({ typed: (p.typed + (p.typed ? k.toLowerCase() : k)).slice(0, 120) }))}>{k}</button>)}
                </div>
              ))}
              <div className="krow">
                <button className="key wide" onClick={() => set((p) => ({ typed: p.typed + ' ' }))}>Space</button>
                <button className="key wide" style={{ flex: 1.4 }} onClick={() => set((p) => ({ typed: p.typed.slice(0, -1) }))} aria-label="Delete last letter">Delete</button>
                <button className="key go" onClick={askTyped} disabled={!s.typed.trim()}>Ask</button>
              </div>
            </div>
            <button className="link" onClick={() => set({ kb: false })}>Back to suggested questions</button>
          </>
        )}
        {s.asking && (
          <>
            <p className="asked">You asked: “{s.asking}”</p>
            <p className="thinking" role="status"><span className="dots" aria-hidden="true"><i /><i /><i /></span>Checking TechCentral’s guide…</p>
          </>
        )}
        {a && (
          <>
            <p className="asked">You asked: “{a.q}”</p>
            {a.kind === 'answer' && (
              <div className="ansbox" role="status">
                <p className="ans"><T s={a.text} /></p>
                {a.based && <button className="based" onClick={() => jump(a)}><Icon n="book" />Based on: {a.based}</button>}
                <p className="ailabel">AI answer · from TechCentral’s guide · checked <T s={ASSIST.checkedDate} /></p>
                <div className="tools">
                  <button className={'tbtn' + (s.vote === 'up' ? ' on' : '')} aria-pressed={s.vote === 'up'} aria-label="Helpful" onClick={() => set({ vote: s.vote === 'up' ? '' : 'up' })}><Icon n="up" /></button>
                  <button className={'tbtn' + (s.vote === 'down' ? ' on' : '')} aria-pressed={s.vote === 'down'} aria-label="Not helpful" onClick={() => set({ vote: s.vote === 'down' ? '' : 'down' })}><Icon n="down" /></button>
                  <button className={'tbtn' + (added ? ' on' : '')} aria-pressed={added}
                    onClick={() => set((p) => ({ added: p.added.includes(a.q) ? p.added.filter((x) => x !== a.q) : [...p.added, a.q] }))}>
                    {added ? <><Icon n="check" />Added to my plan</> : 'Add to my plan'}
                  </button>
                  {s.vote && <span className="ailabel" role="status">Thanks. Only the vote is counted, not your question.</span>}
                </div>
              </div>
            )}
            {(a.kind === 'notin' || a.kind === 'judge' || a.kind === 'off') && (
              <div className="ansbox" role="status">
                <span className="rhead"><Icon n="user" />{ASSIST.heads[a.kind]}</span>
                <p className="ans"><T s={a.text} /></p>
                <div className="tools">
                  <button className="btn btn-p" style={{ minHeight: '2.2em', fontSize: '.8em' }} onClick={() => openOv('staff')}>Where staff are</button>
                  {a.rules && <button className="btn btn-s" style={{ minHeight: '2.2em', fontSize: '.8em' }} onClick={() => go({ screen: 'rules' })}>See the rules</button>}
                </div>
                <p className="ailabel">{ASSIST.foots[a.kind]}</p>
              </div>
            )}
            {a.kind === 'safety' && <SafetyBox />}
            <button className="link" onClick={() => { askToken.current++; set({ answer: null, asking: null, vote: '', kb: false, typed: '' }); }}>Ask another question</button>
          </>
        )}
      </div>
    </section>
  );

  const toggle = (key: 'lg' | 'hc' | 'read', label: string, sub: React.ReactNode) => (
    <button className="toggle" aria-pressed={s[key]} onClick={() => set((p) => ({ [key]: !p[key] }))}>
      <span className="tl"><b>{label}</b><span>{sub}</span></span>
      <span className="tstate" aria-hidden="true">{s[key] ? 'On' : 'Off'}</span>
      <span className="sw" aria-hidden="true" />
    </button>
  );
  const a11y = (
    <section className="sheet short" role="dialog" aria-modal="true" aria-labelledby="a11y-t">
      <div className="sh-h"><span className="aa" aria-hidden="true">Aa</span><span className="sh-t" id="a11y-t">Accessibility options</span><button className="xbtn" onClick={closeOv}><Icon n="x" w={2.5} />Close</button></div>
      <div className="sh-b">
        {toggle('lg', 'Larger text', 'Makes everything on screen bigger.')}
        {toggle('hc', 'High contrast', 'White and yellow on black.')}
        {toggle('read', 'Read aloud', <>Reads each screen through the speaker or headphone jack. <T s="[[confirm audio hardware|]]" />{!speech.available && ' (Not available in this browser.)'}</>)}
        <p className="hint">These turn off when you finish.</p>
      </div>
    </section>
  );

  const staff = (
    <section className="sheet short" role="dialog" aria-modal="true" aria-labelledby="staff-t">
      <div className="sh-h"><Icon n="user" style={{ width: '1.2em', height: '1.2em', color: 'var(--brand)' }} /><span className="sh-t" id="staff-t">Staff can help</span><button className="xbtn" onClick={closeOv}><Icon n="x" w={2.5} />Close</button></div>
      <div className="sh-b">
        <p className="th" style={{ fontSize: '1.3em' }}><Staff /></p>
        <Slot kind="Image slot" alt="The TechCentral desk, seen from this kiosk." style={{ aspectRatio: '21/9' }} />
        <p className="lead"><T s={SITE.hours} /></p>
        <p className="lead">Walk over, or show them this screen. No need to explain everything — they’ll ask.</p>
      </div>
    </section>
  );

  // Keep Tab inside an open overlay; the bottom bar stays reachable.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    last.current = Date.now();
    if (e.key === 'Escape' && s.ov && s.ov !== 'idle') { e.preventDefault(); closeOv(); }
  };

  const cls = 'kiosk ' + (land ? 'landscape' : 'portrait') + (s.hc ? ' hc' : '') + (s.lg ? ' lg' : '');
  const left = config.fit ? (vp.w - W * scale) / 2 : 0;
  const top = config.fit ? (vp.h - H * scale) / 2 : 0;

  return (
    <div className={'kv' + (config.fit ? '' : ' native')}>
      <div ref={rootRef} className={cls} lang="en"
        style={{ width: W, height: H, transform: config.fit ? `scale(${scale})` : undefined, left, top }}
        onPointerDownCapture={() => { last.current = Date.now(); }} onKeyDownCapture={onKeyDownCapture}>

        {s.screen === 'attract' && (
          <button className="attract" onClick={() => set({ screen: 'home', hist: [] })}>
            <span className="att-top">TechCentral · Cleveland Public Library</span>
            <span className="att-mid">
              <span className="att-ics"><Icon n="printer" w={1.5} /><Icon n="cube" w={1.5} /></span>
              <span className="att-title">Printing &amp; 3D printing help</span>
              <span className="att-sub">A short plan for your visit, in under two minutes.</span>
            </span>
            <span className="att-low">
              <span className="att-tap">Tap anywhere to start<Icon n="right" /></span>
              <span className="att-foot">This screen is public. Nothing you choose is saved.</span>
            </span>
          </button>
        )}

        {s.screen !== 'attract' && (
          <div className="session">
            <header className="hdr"><span><b>TechCentral</b> · Cleveland Public Library</span><span>Printing &amp; 3D printing help</span></header>
            <div className="stage">
              <main className="main" ref={mainRef} aria-hidden={shown ? true : undefined} inert={shown ? true : undefined}>{scr}</main>
              {shown && <div className="scrim" onClick={closeOv} />}
              {shown === 'assistant' && assistant}
              {shown === 'a11y' && a11y}
              {shown === 'staff' && staff}
            </div>
            {s.read && (
              <div className="readbar" role="status">
                <Icon n="sound" />
                <p><b>Reading aloud:</b> “{readText.length > 140 ? readText.slice(0, 137) + '…' : readText}”</p>
                <button onClick={() => set({ read: false })}>Stop</button>
              </div>
            )}
            <nav className="bar" aria-label="Always available">
              {s.screen !== 'home'
                ? <button className="bbtn" onClick={back}><Icon n="left" />Back</button>
                : <span className="bslot" />}
              <button className="bbtn staff" onClick={() => openOv('staff')} aria-pressed={s.ov === 'staff'}>
                <Icon n="user" /><span>Staff help<small>Desk · <T s={SITE.staffShort} /></small></span>
              </button>
              <button className="bbtn" onClick={() => openOv('a11y')} aria-pressed={s.ov === 'a11y'}><span className="aa" aria-hidden="true">Aa</span>Accessibility</button>
              <button className="bbtn" onClick={reset}><Icon n="reset" />Start over</button>
            </nav>
          </div>
        )}

        {s.ov === 'idle' && (
          <div className="idle" role="alertdialog" aria-modal="true" aria-labelledby="idle-t" aria-describedby="idle-d">
            <div className="idle-card">
              <p className="title" style={{ fontSize: '1.8em' }} id="idle-t">Still there?</p>
              <p className="lead" id="idle-d">We’ll start over for the next person in</p>
              <p className="count" aria-live="polite">{s.count}</p>
              <p className="lead">seconds. Everything you chose will be erased.</p>
              <button className="btn btn-p" style={{ minHeight: '3.2em', fontSize: '1.15em' }} onClick={() => set((p) => ({ ov: p.prevOv, count: config.countdown }))}>I’m still here</button>
              <button className="btn btn-s" onClick={reset}>Start over now</button>
            </div>
          </div>
        )}
      </div>
      {config.fit && <a className="devbadge" href="/links" title="Prototype index: all pages and flags">Prototype index</a>}
    </div>
  );
}
