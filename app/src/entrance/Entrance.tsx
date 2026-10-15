/**
 * Main Library entrance kiosk — Cut 1 (Walkable).
 * Spec: vault build/entrance-kiosk/BUILD-entrance-kiosk.md, mockup-spec §13, §5 Phase 1, §2, §7, §12.
 *
 * Same app, components, tokens, motion layer and session lifecycle as the
 * TechCentral kiosk. Every fact is a visible placeholder tag (forced on for
 * this route). "Ask a library assistant" is answered by a person through the
 * relay (/staff); ?ask=scripted plays the scripted version for sign-off demos.
 */
import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ENT from '../content/entrance.json';
import { config } from '../config';
import { Choice, Slot, useViewport } from '../kiosk/Kiosk';
import { CplMark } from '../lib/CplMark';
import { Icon } from '../lib/Icon';
import { T, plain } from '../lib/ph';
import { speech } from '../lib/speech';
import { API } from '../lib/api';
import { useVoice, voiceSupported } from './useVoice';
import '../kiosk/kiosk.css';
import './entrance.css';

/* ---------- flags ---------- */
const q = new URLSearchParams(window.location.search);
const KIOSK_ID = (q.get('kiosk') || 'main-entrance').slice(0, 40);
/** live = a person answers through /staff · scripted = canned replies (Cut 1 demo) · off = Ask hidden */
const ASK_MODE = (['live', 'scripted', 'off'] as const).find((v) => v === q.get('ask')) ?? 'live';
const SCRIPT_DELAY_MS = (Number(q.get('replyDelay')) || 7) * 1000;
const SCRIPT_NO_REPLY = q.get('noreply') === '1';
const SCRIPT_OFF_HOURS = q.get('hours') === 'off';
const REPLY_TIMEOUT_OVERRIDE_S = Number(q.get('replyTimeout')) || 0;
/** Scripted demos: ?cards=chat behaves as if the console's “Place cards start a chat” setting were on. */
const SCRIPT_CARDS_CHAT = q.get('cards') === 'chat';

/* ---------- types ---------- */
type Screen = 'attract' | 'home' | 'entry' | 'techcentral';
type Ov = '' | 'ask' | 'a11y' | 'staff' | 'idle';
type Dir = 'fwd' | 'back' | 'none';
interface Snap { screen: Screen; entry: string }
interface AskMsg {
  id: string;
  from: 'patron' | 'staff' | 'emergency';
  text: string;
  source?: { kind: string; detail?: string };
  locked?: string;
  vote?: '' | 'up' | 'down';
}
interface S extends Snap {
  ov: Ov; prevOv: Ov; dir: Dir; hist: Snap[]; count: number;
  lg: boolean; hc: boolean; read: boolean;
  session: string | null;
  noticeSeen: boolean; kb: boolean; typed: string;
  msgs: AskMsg[]; waiting: boolean; timedOut: boolean; askContext: string;
  /** “End this conversation?” is showing over the chat. */
  confirmEnd: boolean;
}

const fresh = (): S => ({
  screen: 'attract', entry: '', ov: '', prevOv: '', dir: 'none', hist: [], count: config.countdown,
  lg: config.largerText, hc: false, read: false,
  session: null, noticeSeen: false, kb: false, typed: '', msgs: [], waiting: false, timedOut: false, askContext: 'Main Library · Home', confirmEnd: false,
});

const DIR_BY_ID = Object.fromEntries(ENT.directory.map((d) => [d.id, d]));
const PLACE_NAME = (id?: string) => (id === 'techcentral' ? 'TechCentral' : id ? DIR_BY_ID[id]?.name : undefined);
const KEYROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM?'];
const rid = () => Math.random().toString(36).slice(2, 10);
const norm = (s: string) => ' ' + s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const hasAny = (text: string, words: string[]) => words.some((w) => norm(text).includes(norm(w)));

const TC_LINK = (start: 'p0' | 'm0') => {
  const p = new URLSearchParams({ start, ph: 'tags', return: '/libraryentrance' });
  for (const k of ['orient', 'timers', 'fit', 'idle', 'countdown']) { const v = q.get(k); if (v) p.set(k, v); }
  return '/techcentral?' + p.toString();
};

function post(url: string, data: unknown) {
  return fetch(API + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

/* ---------- the kiosk ---------- */
export default function Entrance() {
  const vp = useViewport();
  const land = config.orientation === 'auto' ? vp.w > vp.h : config.orientation === 'landscape';
  const W = land ? 1920 : 1080, H = land ? 1080 : 1920;
  const scale = config.fit ? Math.min(vp.w / W, vp.h / H) : 1;

  const [s, setS] = useState<S>(fresh);
  useEffect(() => { document.title = 'Main Library · Find your way'; }, []);
  const [avail, setAvail] = useState(ASK_MODE === 'scripted' ? !SCRIPT_OFF_HOURS : false);
  const [replyTimeoutS, setReplyTimeoutS] = useState(REPLY_TIMEOUT_OVERRIDE_S || 120);
  /** Console setting: place cards open the chat with their question (only while Ask is available). */
  const [cardsChat, setCardsChat] = useState(ASK_MODE === 'scripted' && SCRIPT_CARDS_CHAT);
  const last = useRef(Date.now());
  const waitingRef = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const scriptTimers = useRef<number[]>([]);
  const voiceCancel = useRef<() => void>(() => {});

  const set = useCallback((p: Partial<S> | ((s: S) => Partial<S>)) => {
    last.current = Date.now();
    setS((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }));
  }, []);
  const go = (p: Partial<S>) => set((prev) => ({ hist: [...prev.hist, { screen: prev.screen, entry: prev.entry }], ov: '', dir: 'fwd', ...p }));
  const back = () => set((prev) => {
    if (prev.ov === 'ask' && prev.msgs.length) return { confirmEnd: true };
    if (prev.ov) return { ov: '' };
    const h = prev.hist.slice();
    const p = h.pop();
    return p ? { ...p, hist: h, dir: 'back' } : { screen: 'home', hist: [], dir: 'back' };
  });

  const reset = useCallback(() => {
    setS((prev) => {
      if (prev.session && ASK_MODE === 'live' && prev.msgs.length) {
        navigator.sendBeacon?.(API + '/api/kiosk/end', JSON.stringify({ session: prev.session, reason: 'reset' }));
      }
      return fresh();
    });
    scriptTimers.current.forEach(clearTimeout);
    scriptTimers.current = [];
    voiceCancel.current();
    speech.stop();
    trigger.current = null;
    last.current = Date.now();
  }, []);

  /* Voice input: the transcript lands in the message field, unsent. */
  const voice = useVoice();
  waitingRef.current = s.waiting || voice.state === 'listening' || voice.state === 'review';
  voiceCancel.current = voice.cancel;
  useEffect(() => { if (s.ov !== 'ask') voice.cancel(); }, [s.ov, voice.cancel]);

  /* Leaving the page (reload, the TechCentral doorway, power-off) ends the session for the console too. */
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = s.msgs.length ? s.session : null;
  useEffect(() => {
    if (ASK_MODE !== 'live') return;
    const bye = () => { if (sessionRef.current) navigator.sendBeacon?.(API + '/api/kiosk/end', JSON.stringify({ session: sessionRef.current, reason: 'left the page' })); };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  /* Idle → “Still there?” → reset. While waiting for a reply the idle timer pauses (until the reply timeout). */
  useEffect(() => {
    if (!config.timers) return;
    const t = setInterval(() => {
      if (waitingRef.current) { last.current = Date.now(); return; }
      setS((prev) => {
        if (prev.screen === 'attract') { last.current = Date.now(); return prev; }
        if (prev.ov === 'idle') {
          const c = prev.count - 1;
          if (c <= 0) {
            if (prev.session && ASK_MODE === 'live' && prev.msgs.length) navigator.sendBeacon?.(API + '/api/kiosk/end', JSON.stringify({ session: prev.session, reason: 'timeout' }));
            last.current = Date.now();
            return fresh();
          }
          return { ...prev, count: c };
        }
        if (Date.now() - last.current > config.idleMs) return { ...prev, ov: 'idle', prevOv: prev.ov, count: config.countdown };
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* The live relay: one stream per kiosk session. */
  useEffect(() => {
    if (ASK_MODE !== 'live' || !s.session) { if (ASK_MODE === 'live') setAvail(false); return; }
    const es = new EventSource(API + `/api/kiosk/stream?kiosk=${encodeURIComponent(KIOSK_ID)}&session=${encodeURIComponent(s.session)}`);
    es.addEventListener('status', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setAvail(!!d.available);
      if (d.replyTimeoutS && !REPLY_TIMEOUT_OVERRIDE_S) setReplyTimeoutS(d.replyTimeoutS);
      if (d.features) setCardsChat(!!d.features.cardsOpenChat);
    });
    es.addEventListener('reply', (e) => receive(JSON.parse((e as MessageEvent).data)));
    es.onerror = () => setAvail(false);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.session]);

  const receive = (m: { id: string; text: string; source?: AskMsg['source']; locked?: string }) => {
    setS((prev) => ({
      ...prev,
      msgs: [...prev.msgs, { id: m.id, from: 'staff', text: m.text, source: m.source, locked: m.locked, vote: '' }],
      waiting: false, timedOut: false,
      // The patron is standing there waiting: bring the answer to them.
      ov: prev.ov === '' ? 'ask' : prev.ov,
    }));
    last.current = Date.now();
  };

  /* Reply timeout: say so plainly and point to staff. Never a dead end. */
  useEffect(() => {
    if (!s.waiting) return;
    const t = setTimeout(() => {
      set({ waiting: false, timedOut: true });
      if (ASK_MODE === 'live' && s.session) post('/api/kiosk/timeout', { session: s.session });
    }, replyTimeoutS * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.waiting, s.msgs.length]);

  /* ---------- asking ---------- */
  const contextFor = (st: S) => st.screen === 'entry' ? 'Directory · ' + (DIR_BY_ID[st.entry]?.name || '') : st.screen === 'techcentral' ? 'TechCentral' : 'Main Library · Home';
  const openAsk = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && !el.closest('[role=dialog]')) trigger.current = el;
    set((prev) => ({ ov: 'ask', askContext: contextFor(prev), kb: false }));
  };

  /* Closing the chat ends the conversation (when there is one), so it asks first. */
  const closeAsk = () => set((prev) => (prev.msgs.length ? { confirmEnd: true } : { ov: '', kb: false }));
  const endConversation = () => {
    if (ASK_MODE === 'live' && s.session) post('/api/kiosk/end', { session: s.session, reason: 'patron closed the chat' });
    scriptTimers.current.forEach(clearTimeout);
    scriptTimers.current = [];
    voice.cancel();
    set({ ov: '', confirmEnd: false, msgs: [], waiting: false, timedOut: false, typed: '', kb: false });
  };

  const openCard = (id: string) => {
    if (!(avail && cardsChat)) { go(id === 'techcentral' ? { screen: 'techcentral' } : { screen: 'entry', entry: id }); return; }
    const place = id === 'techcentral' ? { name: 'TechCentral', ask: ENT.techcentral.ask } : DIR_BY_ID[id];
    const context = 'Directory · ' + place.name;
    const el = document.activeElement as HTMLElement | null;
    if (el && !el.closest('[role=dialog]')) trigger.current = el;
    set({ ov: 'ask', askContext: context, kb: false });
    send(place.ask, 'card:' + id, context);
  };

  const send = async (text: string, chipId?: string, context?: string) => {
    const t = text.trim();
    if (!t) return;
    const emergency = hasAny(t, ENT.emergencyWords);
    set((prev) => ({
      msgs: [...prev.msgs, { id: rid(), from: 'patron', text: t },
        // Locked emergency copy shows instantly. It never waits on a person.
        ...(emergency ? [{ id: rid(), from: 'emergency' as const, text: ENT.locked.emergency.text, locked: 'emergency' }] : [])],
      waiting: true, timedOut: false, kb: false, typed: '', noticeSeen: true,
    }));
    if (ASK_MODE === 'live') {
      try {
        const r = await post('/api/kiosk/ask', { kiosk: KIOSK_ID, session: s.session, context: context || s.askContext, text: t, chipId });
        if (r.status === 409) { setAvail(false); set({ waiting: false }); }
        else if (!r.ok) throw new Error('send failed');
      } catch {
        setAvail(false);
        set({ waiting: false, timedOut: true });
      }
      return;
    }
    // Scripted (Cut 1): canned replies at a person's pace.
    if (SCRIPT_NO_REPLY) return;
    const chip = ENT.ask.chips.find((c) => c.id === chipId);
    const card = chipId?.startsWith('card:') ? chipId.slice(5) : '';
    const place = DIR_BY_ID[card];
    const reply = hasAny(t, ENT.botWords) ? { text: ENT.locked.bot.text, locked: 'bot' }
      : chip ? { text: chip.script.text, source: { kind: chip.script.source, detail: chip.script.based } }
      : place ? { text: `${place.name}: ${place.floor}, near ${place.desk}. Hours: ${place.hours}.`, source: { kind: 'catalog', detail: place.id } }
      : card === 'techcentral' ? { text: `TechCentral is ${ENT.techcentral.where}. ${ENT.techcentral.lead}`, source: { kind: 'catalog', detail: 'techcentral' } }
      : hasAny(t, ENT.offTopicWords) ? { text: ENT.saved.find((x) => x.id === 'off-topic')!.text, source: { kind: 'none' } }
      : { text: ENT.saved.find((x) => x.id === 'not-in-guide')!.text, source: { kind: 'none' } };
    scriptTimers.current.push(window.setTimeout(() => receive({ id: rid(), ...reply }), SCRIPT_DELAY_MS));
  };

  const vote = (m: AskMsg, v: 'up' | 'down') => {
    const next = m.vote === v ? '' : v;
    set((prev) => ({ msgs: prev.msgs.map((x) => (x.id === m.id ? { ...x, vote: next } : x)) }));
    if (ASK_MODE === 'live' && s.session) post('/api/kiosk/vote', { session: s.session, messageId: m.id, vote: next || null });
  };

  /* Physical keyboard works while the on-screen one is open (testing convenience). */
  useEffect(() => {
    if (!(s.ov === 'ask' && s.kb)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') set((p) => ({ typed: p.typed.slice(0, -1) }));
      else if (e.key === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON') send(s.typed); }
      else if (e.key.length === 1 && /[\w ?'’,.-]/.test(e.key)) { e.preventDefault(); set((p) => ({ typed: (p.typed + e.key).slice(0, 200) })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- focus + scroll ---------- */
  useEffect(() => {
    if (s.ov) {
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(s.ov === 'idle' ? '.idle .btn-p' : '[role=dialog] .xbtn')?.focus());
    } else if (trigger.current) {
      const t = trigger.current; trigger.current = null;
      if (document.contains(t)) t.focus();
    }
  }, [s.ov]);
  useEffect(() => {
    if (s.confirmEnd) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('.end-confirm .btn-s')?.focus());
  }, [s.confirmEnd]);
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (!s.ov && s.screen !== 'attract') rootRef.current?.querySelector<HTMLElement>('.main .title')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.entry]);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [s.msgs.length, s.waiting, s.timedOut, s.ov]);

  /* ---------- read aloud ---------- */
  const entry = DIR_BY_ID[s.entry];
  const lastStaff = [...s.msgs].reverse().find((m) => m.from === 'staff' || m.from === 'emergency');
  const readText = s.ov === 'ask'
    ? (s.waiting ? ENT.ask.waiting : s.timedOut ? plain(ENT.ask.timeout) : lastStaff ? plain(lastStaff.text) : ENT.ask.label + '. Tap a question.')
    : s.ov === 'a11y' ? 'Accessibility options. Larger text. High contrast. Read aloud.'
    : s.ov === 'staff' ? plain(ENT.staff)
    : s.ov === 'idle' ? `Still there? We’ll start over for the next person in ${config.countdown} seconds.`
    : s.screen === 'home' ? 'Welcome to the Main Library. What brings you in today? ' + (avail ? 'Ask a library assistant, or choose a place: ' : 'Choose a place: ') + ENT.directory.map((d) => d.name).join('. ') + '. TechCentral.'
    : s.screen === 'entry' && entry ? `${entry.name}. Floor: ${plain(entry.floor)}. Nearest desk: ${plain(entry.desk)}. Hours: ${plain(entry.hours)}.`
    : s.screen === 'techcentral' ? `TechCentral. ${ENT.techcentral.lead} Where: ${plain(ENT.techcentral.where)}. Hours: ${plain(ENT.techcentral.hours)}.`
    : '';
  useEffect(() => { if (s.read) speech.say(readText); }, [s.read, readText]);
  useEffect(() => { if (!s.read) speech.stop(); }, [s.read]);

  /* ---------- screens ---------- */
  const askTile = avail && (
    <Choice big icon="chat" label={ENT.ask.label} sub={ENT.ask.homeSub} onClick={openAsk} />
  );
  const src = <p className="src">From the Main Library guide · checked <T s={ENT.checkedDate} /></p>;

  const scr = (() => {
    switch (s.screen) {
      case 'home': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">Welcome to the Main Library</span>
            <h1 className="title" tabIndex={-1}>What brings you in today?</h1>
            <p className="lead">{avail ? 'Ask a library assistant anything, or tap a place to find it.' : 'Tap a place to find it. Staff are always one tap away.'}</p>
          </div>
          <div className="act">
            {askTile && <div className="ask-tile">{askTile}</div>}
            <span className="hint">{avail && cardsChat ? 'Tap a topic to ask about it' : 'In the building'}</span>
            <div className="choices dir-grid">
              {ENT.directory.map((d) => <Choice key={d.id} icon={avail && cardsChat ? 'chat' : 'pin'} label={d.name} onClick={() => openCard(d.id)} />)}
            </div>
            <Choice big icon="printer" label="TechCentral" sub={ENT.techcentral.lead} onClick={() => openCard('techcentral')} />
          </div>
        </section>
      );

      case 'entry': return entry ? (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">Main Library</span>
            <h1 className="title" tabIndex={-1}>{entry.name}</h1>
          </div>
          <div className="act">
            <div className="facts">
              <div className="fact"><span className="fk">Floor</span><span className="fv"><T s={entry.floor} /></span></div>
              <div className="fact"><span className="fk">Nearest desk</span><span className="fv"><T s={entry.desk} /></span></div>
              <div className="fact"><span className="fk">Hours</span><span className="fv"><T s={entry.hours} /></span></div>
            </div>
            <Slot kind="Photo slot" alt={entry.alt} />
            {avail && <button className="btn btn-s" onClick={openAsk}><Icon n="chat" />Ask about this</button>}
            <div className="cta row2">
              <button className="btn btn-s" onClick={back}><Icon n="left" />Back to the list</button>
              <button className="btn btn-p" onClick={reset}><Icon n="check" />Done</button>
            </div>
            {src}
          </div>
        </section>
      ) : null;

      case 'techcentral': return (
        <section className="scr">
          <div className="info">
            <span className="eyebrow">In the building</span>
            <h1 className="title" tabIndex={-1}>TechCentral</h1>
            <p className="lead">{ENT.techcentral.lead}</p>
          </div>
          <div className="act">
            <div className="facts two">
              <div className="fact"><span className="fk">Where</span><span className="fv"><T s={ENT.techcentral.where} /></span></div>
              <div className="fact"><span className="fk">Hours</span><span className="fv"><T s={ENT.techcentral.hours} /></span></div>
            </div>
            <span className="hint">Make a plan before you go</span>
            <div className="choices">
              <Choice big icon="printer" label="Print something" sub="Documents, forms, and photos." onClick={() => window.location.assign(TC_LINK('p0'))} />
              <Choice big icon="cube" label="3D print something" sub="What’s possible, the rules, and your options." onClick={() => window.location.assign(TC_LINK('m0'))} />
            </div>
            <p className="hint">Opens the TechCentral guide on this screen. Start over brings you back here.</p>
            {avail && <button className="btn btn-s" onClick={openAsk}><Icon n="chat" />Ask about TechCentral</button>}
            <div className="cta row2">
              <button className="btn btn-s" onClick={back}><Icon n="left" />Back to the list</button>
              <button className="btn btn-p" onClick={reset}><Icon n="check" />Done</button>
            </div>
            {src}
          </div>
        </section>
      );
      default: return null;
    }
  })();

  /* ---------- the Ask panel (Phase 1: human-answered) ---------- */
  const sourceLine = (m: AskMsg) => {
    if (m.locked) return null;
    if (m.source?.kind === 'catalog') return <T s={ENT.ask.sourceGuide} />;
    if (m.source?.kind === 'named' && m.source.detail) return <>{ENT.ask.sourceNamed} {m.source.detail}</>;
    return ENT.ask.sourceNone;
  };
  const ask = (
    <section className="sheet ask-sheet" role="dialog" aria-modal="true" aria-labelledby="ask-t">
      <div className="sh-h chat-h">
        <span className="chat-avatar" aria-hidden="true"><Icon n="user" /></span>
        <span className="chat-h-text">
          <span className="sh-t" id="ask-t">{ENT.ask.label}</span>
          <span className="chat-ctx">{s.askContext}</span>
        </span>
        <button className="xbtn" onClick={closeAsk}><Icon n="x" />Close</button>
      </div>
      {s.confirmEnd && (
        <div className="end-confirm" role="alertdialog" aria-modal="true" aria-labelledby="end-t" aria-describedby="end-d">
          <div className="end-card">
            <p className="th big" id="end-t">End this chat?</p>
            <p className="tb" id="end-d">Closing the chat ends it. The library assistant won’t be able to reply, and the conversation is erased from this screen.</p>
            <div className="cta row2">
              <button className="btn btn-s" onClick={() => set({ confirmEnd: false })}>Keep chatting</button>
              <button className="btn btn-p" onClick={endConversation}><Icon n="x" />End chat</button>
            </div>
          </div>
        </div>
      )}

      {voice.state !== 'idle' ? (
        <div className="voice" role="group" aria-label="Speak your question">
          <div className={'voice-bars' + (voice.state === 'listening' ? ' on' : '') + (voice.heard ? ' heard' : '') + (voice.hasLevel ? ' live' : '')} ref={voice.barsRef} aria-hidden="true"><i /><i /><i /><i /></div>
          <p className={'voice-text' + (voice.state === 'review' ? ' review' : '')} aria-live="polite">
            {voice.state === 'error' ? <span className="voice-err">{voice.error}</span>
              : voice.state === 'review' ? <span>“{voice.finalText}”</span>
              : voice.finalText || voice.interim ? <>{voice.finalText}<span className="interim">{voice.finalText && voice.interim ? ' ' : ''}{voice.interim}</span></>
              : <span className="voice-wait">Listening…</span>}
          </p>
          <p className="voice-hint">{voice.state === 'error' ? 'Nothing was sent.'
            : voice.state === 'review' ? 'Is that right? Send it, or tap Retry to say it again.'
            : 'Speak your question. Don’t say anything personal — this screen is public.'}</p>
          <div className="cta row2 voice-cta">
            {voice.state === 'review' ? (
              <>
                <button className="btn btn-s" onClick={voice.start}><Icon n="mic" />Retry</button>
                <button className="btn btn-p" onClick={() => { const t = voice.finalText; voice.clear(); send(t); }}><Icon n="right" />Send it</button>
              </>
            ) : (
              <>
                <button className="btn btn-s" onClick={voice.cancel}><Icon n="x" />Cancel</button>
                {voice.state === 'error'
                  ? <button className="btn btn-p" onClick={voice.start}><Icon n="mic" />Try again</button>
                  : <button className="btn btn-p" onClick={voice.finish}><Icon n="check" />Done</button>}
              </>
            )}
          </div>
        </div>
      ) : (<>
      <div className="chat-log" aria-live="polite">
        {s.msgs.length === 0 && (
          <div className="chat-empty">
            <p className="th">Ask anything about the {ENT.place}.</p>
            {avail && voiceSupported ? (
              <>
                <p className="tb">The easiest way: tap the microphone and ask out loud. You can also pick a question below or type your own.</p>
                {/* Voice first: it's easier than a touchscreen keyboard. */}
                <button className="mic-hero" onClick={() => { set({ kb: false }); voice.start(); }}>
                  <span className="mic-hero-btn" aria-hidden="true"><Icon n="mic" /></span>
                  <span className="mic-hero-label">Tap and ask out loud</span>
                </button>
              </>
            ) : (
              <p className="tb">{avail ? 'Pick a question below, or type your own.' : ''}</p>
            )}
            {avail && !s.kb && (
              <div className="empty-qs" role="group" aria-labelledby="empty-qs-h">
                <span className="hint" id="empty-qs-h">Or pick a question</span>
                {ENT.ask.chips.map((c) => <button className="qchip" key={c.id} onClick={() => send(c.q, c.id)}><span>{c.q}</span><Icon n="chev" /></button>)}
              </div>
            )}
          </div>
        )}
        {s.msgs.map((m) => m.from === 'patron' ? (
          <div key={m.id} className="msg me fadeup"><div className="bubble">{m.text}</div></div>
        ) : m.from === 'emergency' ? (
          <div key={m.id} className="msg them fadeup" role="alert">
            <span className="chat-avatar urgent" aria-hidden="true"><Icon n="warn" /></span>
            <div className="bubble urgent">
              <span className="who">Emergency</span>
              <p><T s={m.text} /></p>
              <p className="meta"><T s={ENT.staff} /></p>
            </div>
          </div>
        ) : (
          <div key={m.id} className="msg them fadeup">
            <span className="chat-avatar" aria-hidden="true"><Icon n="user" /></span>
            <div className="bubble">
              <span className="who">Library assistant</span>
              <p><T s={m.text} /></p>
              {m.source?.kind === 'catalog' && PLACE_NAME(m.source.detail) && (
                <button className="based" onClick={() => go(m.source!.detail === 'techcentral' ? { screen: 'techcentral' } : { screen: 'entry', entry: m.source!.detail! })}>
                  <Icon n="pin" />Based on: {PLACE_NAME(m.source.detail)}
                </button>
              )}
              {sourceLine(m) && <p className="meta">{sourceLine(m)}</p>}
              {!m.locked && (
                <div className="tools">
                  <button className={'tbtn' + (m.vote === 'up' ? ' on' : '')} aria-pressed={m.vote === 'up'} onClick={() => vote(m, 'up')}><Icon n="up" />Helpful</button>
                  <button className={'tbtn' + (m.vote === 'down' ? ' on' : '')} aria-pressed={m.vote === 'down'} onClick={() => vote(m, 'down')}><Icon n="down" />Not helpful</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {s.waiting && (
          <div className="msg them" role="status">
            <span className="chat-avatar" aria-hidden="true"><Icon n="user" /></span>
            <div className="bubble typing"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{ENT.ask.waiting}</div>
          </div>
        )}
        {s.timedOut && (
          <div className="msg them fadeup" role="status">
            <span className="chat-avatar" aria-hidden="true"><Icon n="user" /></span>
            <div className="bubble note"><span className="who">Staff can help now</span><p><T s={ENT.ask.timeout} /></p></div>
          </div>
        )}
        <div ref={transcriptEnd} />
      </div>

      <div className="chat-foot">
        {!avail ? (
          !s.waiting && <p className="chat-off"><T s={ENT.ask.unavailable} /></p>
        ) : (
          <>
            <div className="chat-input">
              <button className={'chat-field' + (s.kb ? ' on' : '')} onClick={() => set({ kb: true, noticeSeen: true })} aria-label={s.typed ? 'Your message: ' + s.typed : 'Type a question'}>
                {/* The caret sits where the next letter goes: at the start when empty (placeholder after it),
                    at the end of the text otherwise. Re-keyed on each change so it holds solid while typing. */}
                {s.typed
                  ? <span className="chat-text">{s.typed}{s.kb && <span className="caret" key={s.typed.length} aria-hidden="true" />}</span>
                  : <>{s.kb && <span className="caret" aria-hidden="true" />}<span className="ph-hint">Type a question…</span></>}
              </button>
              {voiceSupported && (
                <button className="chat-mic" onClick={() => { set({ kb: false, noticeSeen: true }); voice.start(); }} aria-label="Speak your question"><Icon n="mic" /></button>
              )}
              <button className="chat-send" onClick={() => send(s.typed)} disabled={!s.typed.trim()} aria-label="Send"><Icon n="right" /><span>Send</span></button>
            </div>
            {s.kb && (
              <div className="kb" role="group" aria-label="On-screen keyboard">
                {KEYROWS.map((row) => (
                  <div className="krow" key={row}>
                    {row.split('').map((k) => <button className="key" key={k} onClick={() => set((p) => ({ typed: (p.typed + (p.typed ? k.toLowerCase() : k)).slice(0, 200) }))}>{k}</button>)}
                  </div>
                ))}
                <div className="krow">
                  <button className="key wide" onClick={() => set((p) => ({ typed: p.typed + ' ' }))}>Space</button>
                  <button className="key wide del" onClick={() => set((p) => ({ typed: p.typed.slice(0, -1) }))} aria-label="Delete last letter">Delete</button>
                  <button className="key wide hide" onClick={() => set({ kb: false })}>Hide keyboard</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </>)}
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
      <div className="sh-h"><span className="aa" aria-hidden="true">Aa</span><span className="sh-t" id="a11y-t">Accessibility options</span><button className="xbtn" onClick={() => set({ ov: '' })}><Icon n="x" />Close</button></div>
      <div className="sh-b">
        {toggle('lg', 'Larger text', 'Makes everything on screen bigger.')}
        {toggle('hc', 'High contrast', 'White and yellow on black.')}
        {toggle('read', 'Read aloud', <>Reads each screen through the speaker or headphone jack. <T s="[[confirm audio hardware]]" />{!speech.available && ' (Not available in this browser.)'}</>)}
        <p className="hint">These go back to the defaults when you finish.</p>
      </div>
    </section>
  );
  const staff = (
    <section className="sheet short" role="dialog" aria-modal="true" aria-labelledby="staff-t">
      <div className="sh-h"><Icon n="user" className="sh-ic" /><span className="sh-t" id="staff-t">Staff can help</span><button className="xbtn" onClick={() => set({ ov: '' })}><Icon n="x" />Close</button></div>
      <div className="sh-b">
        <p className="th big"><T s={ENT.staff} /></p>
        <Slot kind="Photo slot" alt="The nearest staffed desk, seen from this kiosk." wide />
        <p className="lead"><T s={ENT.hours} /></p>
        <p className="lead">Walk over, or show them this screen. No need to explain everything — they’ll ask.</p>
      </div>
    </section>
  );

  /* ---------- overlays: keep the last one mounted briefly so it can animate out ---------- */
  const shown: Ov = s.ov === 'idle' ? s.prevOv : s.ov;
  const lastShown = useRef<Ov>('');
  if (shown) lastShown.current = shown;
  const [leaving, setLeaving] = useState(false);
  const wasShown = useRef<Ov>(shown);
  useEffect(() => {
    const was = wasShown.current; wasShown.current = shown;
    if (was && !shown && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLeaving(true);
      const t = setTimeout(() => setLeaving(false), 220);
      return () => clearTimeout(t);
    }
    setLeaving(false);
  }, [shown]);
  const ovKind: Ov = shown || (leaving ? lastShown.current : '');
  const out = !shown && leaving ? ' out' : '';
  const withOut = (el: React.ReactElement<{ className?: string }>) => cloneElement(el, { className: (el.props.className || '') + out });

  const cls = 'kiosk entrance ' + (land ? 'landscape' : 'portrait') + (s.hc ? ' hc' : '') + (s.lg ? ' lg' : '');
  const left = config.fit ? (vp.w - W * scale) / 2 : 0;
  const top = config.fit ? (vp.h - H * scale) / 2 : 0;
  const viewKey = s.screen + s.entry;

  return (
    <div className={'kv' + (config.fit ? '' : ' native')}>
      <div ref={rootRef} className={cls} lang="en" data-mode="service"
        style={{ width: W, height: H, transform: config.fit ? `scale(${scale})` : undefined, left, top }}
        onPointerDownCapture={() => { last.current = Date.now(); }}
        onKeyDownCapture={(e) => { last.current = Date.now(); if (e.key === 'Escape' && s.ov && s.ov !== 'idle') { if (s.confirmEnd) set({ confirmEnd: false }); else if (s.ov === 'ask') closeAsk(); else set({ ov: '' }); } }}>

        {s.screen === 'attract' && (
          <button className="attract" onClick={() => set({ screen: 'home', hist: [], dir: 'fwd', session: crypto.randomUUID() })}>
            <span className="att-bg" aria-hidden="true"><CplMark className="att-hero" /></span>
            <span className="att-top"><CplMark className="att-logo" /><span><b>{ENT.attract.eyebrow}</b><span>{ENT.place}</span></span></span>
            <span className="att-mid">
              <span className="att-ics" aria-hidden="true">
                <span><Icon n="pin" /></span><span><Icon n="door" /></span><span><Icon n="book" /></span><span><Icon n="user" /></span>
              </span>
              <span className="att-title">{ENT.attract.title} <em className="accent-phrase">{ENT.attract.titleAccent}</em></span>
              <span className="att-sub">{ENT.attract.lead}</span>
            </span>
            <span className="att-low">
              <span className="att-catalog"><Icon n="search" /><span><T s={ENT.attract.catalog} /></span></span>
              <span className="att-tap">{ENT.attract.cta}<Icon n="right" /></span>
              <span className="att-foot">{ENT.attract.foot}</span>
            </span>
          </button>
        )}

        {s.screen !== 'attract' && (
          <div className="session">
            <header className="hdr"><span><b>Main Library</b> · Cleveland Public Library</span><span>Find your way</span></header>
            <div className="stage">
              <main className="main" ref={mainRef} aria-hidden={shown ? true : undefined} inert={shown ? true : undefined}>
                <div className={'view ' + s.dir} key={viewKey}>{scr}</div>
              </main>
              {ovKind && <div className={'scrim' + out} onClick={out ? undefined : () => (s.ov === 'ask' ? closeAsk() : set({ ov: '' }))} />}
              {ovKind === 'ask' && withOut(ask)}
              {ovKind === 'a11y' && withOut(a11y)}
              {ovKind === 'staff' && withOut(staff)}
            </div>
            {s.read && (
              <div className="readbar" role="status">
                <Icon n="sound" />
                <p><b>Reading aloud:</b> “{readText.length > 140 ? readText.slice(0, 137) + '…' : readText}”</p>
                <button onClick={() => set({ read: false })}>Stop</button>
              </div>
            )}
            <nav className="bar" aria-label="Always available">
              {s.screen !== 'home' ? <button className="bbtn" onClick={back}><Icon n="left" />Back</button> : <span className="bslot" />}
              <button className="bbtn" onClick={() => { trigger.current = document.activeElement as HTMLElement; set({ ov: 'a11y' }); }} aria-pressed={s.ov === 'a11y'}><span className="aa" aria-hidden="true">Aa</span>Accessibility</button>
              <button className="bbtn" onClick={reset}><Icon n="reset" />Start over</button>
            </nav>
          </div>
        )}

        {s.ov === 'idle' && (
          <div className="idle" role="alertdialog" aria-modal="true" aria-labelledby="idle-t" aria-describedby="idle-d">
            <div className="idle-card">
              <p className="title" id="idle-t">Still there?</p>
              <p className="lead" id="idle-d">We’ll start over for the next person in</p>
              <div className="ring">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="45" className="ring-bg" />
                  <circle cx="50" cy="50" r="45" className="ring-fg" style={{ strokeDashoffset: 283 * (1 - s.count / config.countdown) }} />
                </svg>
                <p className="count" aria-live="polite" key={s.count}>{s.count}</p>
              </div>
              <p className="lead">seconds. Everything you chose will be erased.</p>
              <button className="btn btn-p" onClick={() => set((p) => ({ ov: p.prevOv, count: config.countdown }))}>I’m still here</button>
              <button className="btn btn-s" onClick={reset}>Start over now</button>
            </div>
          </div>
        )}
      </div>
      {config.fit && <a className="devbadge" href="/links" title="Prototype index: all pages and flags">Prototype index</a>}
    </div>
  );
}
