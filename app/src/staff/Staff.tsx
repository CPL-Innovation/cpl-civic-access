/**
 * The library assistant console (/staff). One screen, one person.
 * Spec: BUILD-entrance-kiosk §2 Cut 2 (5) "The console", mockup-spec §5 Phase 1.
 *
 * Incoming questions with their context and wait time · type an answer or pick
 * a saved one · locked copy sends with one tap and can't be edited · tag the
 * source on every answer (catalog / named / none → candidate catalog entry) ·
 * an on/off switch for "Ask" on the kiosk · export the log.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CplMark } from '../lib/CplMark';
import { API } from '../lib/api';
import { Icon } from '../lib/Icon';
import './staff.css';

interface Msg { id: string; from: 'patron' | 'staff' | 'system'; text: string; at: number; locked?: string; draft?: 'as-is' | 'edited' | 'not used'; source?: { kind: string; detail?: string }; vote?: 'up' | 'down' | null }
interface DraftFact { ref: string; label: string; provenance: string; lastVerified?: string | null }
interface Draft { status: 'drafting' | 'ready' | 'error'; forMessage: string; model: string; kind?: 'answer' | 'locked' | 'no_fact'; text?: string; lockedId?: string; note?: string; facts?: DraftFact[]; unknownRefs?: string[]; placeholders?: number; ms?: number; error?: string }
interface Thread { id: string; kiosk: string; context: string; startedAt: number; updatedAt: number; status: 'waiting' | 'answered' | 'timedout' | 'handed' | 'closed'; open: boolean; closedReason?: string; urgent: boolean; bot: boolean; messages: Msg[]; draft?: Draft }
interface ModelChoice { id: string; label: string; note: string }
interface DraftSettings { on: boolean; model: string; available: boolean; models: ModelChoice[] }
interface Features { cardsOpenChat: boolean; showIndex?: boolean; showSources?: boolean; voiceEngine?: 'live' | 'server' | 'browser' }
interface Settings { drafts?: DraftSettings; passcodeRequired?: boolean; transcribe?: boolean; features?: Features; askOn: boolean; ignoreHours: boolean; hoursSet: boolean; insideHours: boolean; endDate: string | null; kiosksOnline: number; replyTimeoutS: number; available: boolean; reason: string }
interface Copy { id: string; label: string; text: string }
interface Content { locked: { bot: Copy; emergency: Copy }; saved: Copy[]; directory: { id: string; name: string }[] }

const TOKEN_KEY = 'cpl-staff-token';
const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setToken = (t: string) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

/** Placeholder tags in copy: show [[label]] as a readable tag in the console. */
const tagged = (s: string) => s.split(/(\[\[.+?\]\])/g).map((part, i) =>
  part.startsWith('[[') ? <span key={i} className="st-ph">[PLACEHOLDER: {part.slice(2, -2).split('|')[0]}]</span> : part);

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const STATUS: Record<Thread['status'], string> = { waiting: 'Waiting', answered: 'Answered', timedout: 'Timed out → staff', handed: 'Sent to the desk', closed: 'Ended' };

export default function Staff() {
  const [token, setTok] = useState(getToken);
  const [needsPass, setNeedsPass] = useState(false);
  useEffect(() => { document.title = 'Library assistant console · CPL'; }, []);
  // No passcode configured on the relay: sign in silently. Only show the form if the relay asks for one.
  useEffect(() => {
    if (token) return;
    fetch(API + '/api/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode: '' }) })
      .then(async (r) => { if (r.ok) { const t = (await r.json()).token; setToken(t); setTok(t); } else setNeedsPass(true); })
      .catch(() => setNeedsPass(true));
  }, [token]);
  if (!token && !needsPass) return <div className="st st-login" data-mode="service" aria-busy="true" />;
  if (!token) return <Login onToken={(t) => { setToken(t); setTok(t); }} />;
  return <Console token={token} onSignOut={() => { setToken(''); setTok(''); }} />;
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const r = await fetch(API + '/api/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode: pass }) }).catch(() => null);
    if (!r) return setErr('Can’t reach the relay. Is `npm run dev` running?');
    if (!r.ok) return setErr('That passcode didn’t work.');
    onToken((await r.json()).token);
  };
  return (
    <div className="st st-login" data-mode="service">
      <form className="st-login-card" onSubmit={submit}>
        <div className="st-brand"><CplMark className="st-mark" /><span><b>Library assistant console</b><small>Main Library entrance kiosk</small></span></div>
        <label htmlFor="pass">Passcode</label>
        <input id="pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        {err && <p className="st-err" role="alert">{err}</p>}
        <button className="st-btn p" type="submit">Sign in</button>
        <p className="st-fine">This relay asks for a passcode (STAFF_PASSCODE). Nothing about patrons is collected; conversations live in memory and are erased when the relay restarts.</p>
      </form>
    </div>
  );
}

function Console({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [threads, setThreads] = useState<Map<string, Thread>>(new Map());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [connected, setConnected] = useState(false);
  const [sel, setSel] = useState<string>('');
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [panel, setPanel] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = sound;

  const api = (path: string, data?: unknown) => fetch(API + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-staff-token': token },
    body: data === undefined ? undefined : JSON.stringify(data),
  }).then(async (r) => { if (r.status === 401) onSignOut(); return r; });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    // Check the token first: EventSource can't see a 401.
    api('/api/staff/settings', {}).then((r) => {
      if (cancelled || !r.ok) return;
      es = new EventSource(API + `/api/staff/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('snapshot', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        setThreads(new Map((d.threads as Thread[]).map((t) => [t.id, t])));
        setSettings(d.settings); setContent(d.content); setConnected(true);
      });
      es.addEventListener('thread', (e) => {
        const t = JSON.parse((e as MessageEvent).data) as Thread;
        setThreads((prev) => {
          const old = prev.get(t.id);
          const newQuestion = t.status === 'waiting' && (!old || old.messages.filter((m) => m.from === 'patron').length < t.messages.filter((m) => m.from === 'patron').length);
          if (newQuestion && soundRef.current) ping();
          return new Map(prev).set(t.id, t);
        });
      });
      es.addEventListener('removed', (e) => {
        const { id } = JSON.parse((e as MessageEvent).data);
        setThreads((prev) => { const next = new Map(prev); next.delete(id); return next; });
      });
      es.addEventListener('settings', (e) => setSettings(JSON.parse((e as MessageEvent).data)));
      es.onerror = () => setConnected(false);
      es.onopen = () => setConnected(true);
    });
    return () => { cancelled = true; es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const list = useMemo(() => {
    const rank = (t: Thread) => (t.status === 'waiting' ? 0 : t.status === 'timedout' && t.open ? 1 : t.open ? 2 : 3);
    return [...threads.values()].sort((a, b) => rank(a) - rank(b) || (rank(a) <= 1 ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt));
  }, [threads]);
  const waiting = list.filter((t) => t.status === 'waiting');
  useEffect(() => { document.title = (waiting.length ? `(${waiting.length}) ` : '') + 'Library assistant console · CPL'; }, [waiting.length]);
  // Keep something selected: the oldest waiting question first.
  useEffect(() => { if (!sel || !threads.has(sel)) setSel(waiting[0]?.id || list[0]?.id || ''); }, [threads, sel, waiting, list]);

  const thread = threads.get(sel);
  const lastPatronAt = (t: Thread) => [...t.messages].reverse().find((m) => m.from === 'patron')?.at || t.startedAt;

  const availText = !settings ? '' : settings.available ? 'Ask is showing on the kiosk.'
    : settings.reason === 'switched off' ? 'Ask is hidden on the kiosk. Switch it on when you’re ready to answer.'
    : settings.reason === 'outside posted hours' ? 'Ask is hidden: it’s outside the posted hours.'
    : 'Ask is hidden: ' + settings.reason + '.';

  return (
    <div className="st" data-mode="service">
      <header className="st-top">
        <div className="st-brand"><CplMark className="st-mark" /><span><b>Library assistant console</b><small>Main Library entrance kiosk</small></span></div>
        <div className="st-switch">
          <button className={'st-toggle' + (settings?.askOn ? ' on' : '')} role="switch" aria-checked={!!settings?.askOn} onClick={() => api('/api/staff/settings', { askOn: !settings?.askOn })}>
            <span className="st-sw" aria-hidden="true" /><span>Ask on the kiosk: <b>{settings?.askOn ? 'On' : 'Off'}</b></span>
          </button>
          <span className={'st-avail' + (settings?.available ? ' ok' : '')} role="status">{availText}</span>
        </div>
        <button className={'st-gear' + (panel ? ' on' : '')} onClick={() => setPanel((v) => !v)} aria-expanded={panel} aria-controls="st-settings"><Icon n="gear" />Settings</button>
        <div className="st-meta">
          <span className={'st-dot' + (connected ? ' ok' : '')} aria-hidden="true" />{connected ? 'Live' : 'Reconnecting…'}
          <span className="st-sep" />{settings?.kiosksOnline ?? 0} kiosk session{settings?.kiosksOnline === 1 ? '' : 's'} open
        </div>
      </header>
      <div className="st-sub">
        <span>{settings?.hoursSet ? (settings.insideHours ? 'Inside posted hours.' : 'Outside posted hours.') : 'No posted hours set yet — Ask follows the switch alone.'}</span>
        {settings?.hoursSet && (
          <label className="st-check"><input type="checkbox" checked={settings.ignoreHours} onChange={(e) => api('/api/staff/settings', { ignoreHours: e.target.checked })} /> Ignore posted hours (testing)</label>
        )}
        <span className="st-grow" />
        <label className="st-check"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); if (e.target.checked) ping(); }} /> Sound on new questions</label>
        <a className="st-link" href={API + `/api/staff/log.csv?token=${encodeURIComponent(token)}`}>Export log (CSV)</a>
        <button className="st-link" onClick={() => api('/api/staff/clear', {})}>Clear ended conversations</button>
        {settings?.passcodeRequired && <button className="st-link" onClick={onSignOut}>Sign out</button>}
      </div>

      {panel && settings && (
        <SettingsPanel features={settings.features || { cardsOpenChat: false }} askAvailable={settings.available} transcribe={!!settings.transcribe} drafts={settings.drafts}
          onChange={(f) => api('/api/staff/settings', { features: f })} onDrafts={(d) => api('/api/staff/settings', { drafts: d })} onClose={() => setPanel(false)} />
      )}
      <div className="st-body">
        <aside className="st-queue" aria-label="Questions">
          <h2>Questions <span className="st-count">{waiting.length} waiting</span></h2>
          {list.length === 0 && <p className="st-empty">No questions yet. They’ll show up here the moment a patron asks.</p>}
          <ul>
            {list.map((t) => {
              const q = [...t.messages].reverse().find((m) => m.from === 'patron');
              const wait = now - lastPatronAt(t);
              const late = settings && t.status === 'waiting' && wait > settings.replyTimeoutS * 750;
              return (
                <li key={t.id}>
                  <button className={'st-item' + (t.id === sel ? ' sel' : '') + (t.status === 'waiting' ? ' waiting' : '') + (t.open ? '' : ' ended')} onClick={() => setSel(t.id)} aria-current={t.id === sel}>
                    <span className="st-item-top">
                      <span className={'st-badge s-' + t.status}>{STATUS[t.status]}</span>
                      {t.urgent && <span className="st-badge urgent"><Icon n="warn" />Emergency words</span>}
                      {t.bot && <span className="st-badge bot">“Are you a bot?”</span>}
                      <span className="st-grow" />
                      {t.status === 'waiting' && <span className={'st-timer' + (late ? ' late' : '')}>{mmss(wait)}</span>}
                    </span>
                    <span className="st-q">{q?.text || '—'}</span>
                    <span className="st-ctx">{t.context}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="st-convo" aria-label="Conversation">
          {!thread || !content ? <div className="st-empty big">Pick a question on the left.</div> : (
            <Conversation key={thread.id} thread={thread} content={content} settings={settings} now={now} api={api} />
          )}
        </section>
      </div>
    </div>
  );
}

/** Settings: the kiosk's patron-facing switches, then the console's own (AI drafts). Each applies live. Add new ones as rows here. */
function SettingsPanel({ features, askAvailable, transcribe, drafts, onChange, onDrafts, onClose }: { features: Features; askAvailable: boolean; transcribe: boolean; drafts?: DraftSettings; onChange: (f: Partial<Features>) => void; onDrafts: (d: Partial<DraftSettings>) => void; onClose: () => void }) {
  const [customModel, setCustomModel] = useState('');
  const engine = features.voiceEngine || 'live';
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="st-scrim" onClick={onClose} />
      <aside className="st-panel" id="st-settings" role="dialog" aria-modal="true" aria-labelledby="st-settings-t">
        <div className="st-panel-h">
          <h2 id="st-settings-t">Settings</h2>
          <button className="st-btn" onClick={onClose} autoFocus>Close</button>
        </div>
        <p className="st-panel-lead">Changes apply right away. They reset when the relay restarts.</p>

        {drafts && (
          <section className="st-setting column">
            <div className="st-setting-head">
              <div className="st-setting-text">
                <h3 id="st-drafts-h">Suggested replies (AI)</h3>
                <p>When a patron asks something, Claude reads the conversation and the facts library and drafts a reply for you. You review it, edit it if needed, and send it. Nothing goes to the kiosk without you. Patrons aren’t told a draft was used.</p>
                <p className="st-hint">Off: no automatic drafts. “Draft a reply” in a conversation still asks for one.</p>
              </div>
              <button className={'st-toggle light' + (drafts.on ? ' on' : '')} role="switch" aria-checked={drafts.on} disabled={!drafts.available}
                aria-label="Suggested replies" onClick={() => onDrafts({ on: !drafts.on })}>
                <span className="st-sw" aria-hidden="true" /><b>{drafts.on ? 'On' : 'Off'}</b>
              </button>
            </div>
            <div className="st-choices" role="radiogroup" aria-label="Drafting model">
              {drafts.models.map((m) => (
                <label key={m.id} className={'st-choice' + (drafts.model === m.id ? ' on' : '')}>
                  <input type="radio" name="draft-model" checked={drafts.model === m.id} onChange={() => onDrafts({ model: m.id })} />
                  <span><b>{m.label}</b> · {m.note}<br /><code>{m.id}</code></span>
                </label>
              ))}
              {!drafts.models.some((m) => m.id === drafts.model) && (
                <label className="st-choice on"><input type="radio" name="draft-model" checked readOnly /><span><b>Custom</b><br /><code>{drafts.model}</code></span></label>
              )}
            </div>
            <form className="st-row" onSubmit={(e) => { e.preventDefault(); if (customModel.trim()) { onDrafts({ model: customModel.trim() }); setCustomModel(''); } }}>
              <input className="st-named" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="Other model id, e.g. claude-sonnet-5-5" aria-label="Other model id" />
              <button className="st-btn" disabled={!customModel.trim()}>Use this model</button>
            </form>
            {!drafts.available && <p className="st-warn" role="status">Drafts aren’t set up on this relay (no ANTHROPIC_API_KEY).</p>}
          </section>
        )}

        <h3 className="st-panel-sub">On the kiosk</h3>

        <section className="st-setting">
          <div className="st-setting-text">
            <h3>Place cards start a chat</h3>
            <p><b>Off:</b> tapping a place on Home (Restrooms, Get a library card, TechCentral…) opens its info screen.</p>
            <p><b>On:</b> tapping a place opens the Ask chat and sends that card’s question as the patron’s first message, so it lands in your queue.</p>
            <p className="st-hint">Only while Ask is showing on the kiosk. When it isn’t, cards open their info screen as usual.{!askAvailable && <b> Ask is hidden right now.</b>}</p>
          </div>
          <button className={'st-toggle light' + (features.cardsOpenChat ? ' on' : '')} role="switch" aria-checked={features.cardsOpenChat}
            aria-label="Place cards start a chat" onClick={() => onChange({ cardsOpenChat: !features.cardsOpenChat })}>
            <span className="st-sw" aria-hidden="true" /><b>{features.cardsOpenChat ? 'On' : 'Off'}</b>
          </button>
        </section>

        <section className="st-setting">
          <div className="st-setting-text">
            <h3>Source and checked date on replies</h3>
            <p>Under each reply on the kiosk: the line “From the Main Library guide · checked …” and the “Based on” chip that opens the place’s info screen. Hide them for a cleaner chat.</p>
            <p className="st-hint">You still tag a source on every answer here; it goes in the log either way.</p>
          </div>
          <button className={'st-toggle light' + (!!features.showSources ? ' on' : '')} role="switch" aria-checked={!!features.showSources}
            aria-label="Source and checked date on replies" onClick={() => onChange({ showSources: !features.showSources })}>
            <span className="st-sw" aria-hidden="true" /><b>{!!features.showSources ? 'Shown' : 'Hidden'}</b>
          </button>
        </section>

        <section className="st-setting">
          <div className="st-setting-text">
            <h3>Prototype index link</h3>
            <p>The small “Prototype index” link in the kiosk’s bottom corner, which opens the list of every page and demo flag. Show it for demos; hide it on a kiosk patrons use.</p>
          </div>
          <button className={'st-toggle light' + (!!features.showIndex ? ' on' : '')} role="switch" aria-checked={!!features.showIndex}
            aria-label="Prototype index link" onClick={() => onChange({ showIndex: !features.showIndex })}>
            <span className="st-sw" aria-hidden="true" /><b>{!!features.showIndex ? 'Shown' : 'Hidden'}</b>
          </button>
        </section>

        <section className="st-setting column">
          <div className="st-setting-text">
            <h3 id="st-voice-h">Voice transcription</h3>
            <p>How the kiosk turns a patron’s spoken question into text. Either way, the patron sees the words and taps Send it.</p>
          </div>
          <div className="st-choices" role="radiogroup" aria-labelledby="st-voice-h">
            <label className={'st-choice' + (engine === 'live' ? ' on' : '')}>
              <input type="radio" name="voice-engine" checked={engine === 'live'} onChange={() => onChange({ voiceEngine: 'live' })} />
              <span><b>OpenAI live, through the relay</b> (default)<br />Words appear while the patron is still talking (OpenAI Realtime). Same on every device. Falls back to “after speaking” if a live session can’t open.</span>
            </label>
            <label className={'st-choice' + (engine === 'server' ? ' on' : '')}>
              <input type="radio" name="voice-engine" checked={engine === 'server'} onChange={() => onChange({ voiceEngine: 'server' })} />
              <span><b>OpenAI after speaking, through the relay</b><br />Records the question, then the words appear a moment after the patron stops talking. Slightly more accurate on long questions.</span>
            </label>
            <label className={'st-choice' + (engine === 'browser' ? ' on' : '')}>
              <input type="radio" name="voice-engine" checked={engine === 'browser'} onChange={() => onChange({ voiceEngine: 'browser' })} />
              <span><b>Built-in (the device’s browser)</b><br />Words appear while the patron speaks, where the device supports it (desktop Chrome sends audio to Google). Falls back to OpenAI on Android or if it fails.</span>
            </label>
          </div>
          {!transcribe && <p className="st-warn" role="status">OpenAI transcription isn’t set up on this relay (no OPENAI_API_KEY), so the kiosk is using built-in recognition whichever you pick.</p>}
        </section>
      </aside>
    </>
  );
}

function Conversation({ thread, content, settings, now, api }: { thread: Thread; content: Content; settings: Settings | null; now: number; api: (p: string, d?: unknown) => Promise<Response> }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'catalog' | 'named' | 'none'>('none');
  const [detail, setDetail] = useState('');
  const [named, setNamed] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /** Set when the draft was put in the box, so the log can tell "edited" from "not used". */
  const [draftUsed, setDraftUsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.messages.length]);
  useEffect(() => { boxRef.current?.focus(); }, [thread.id]);

  const places = [...content.directory, { id: 'techcentral', name: 'TechCentral' }];
  const placeName = (id?: string) => places.find((p) => p.id === id)?.name || id;
  const waitingFor = [...thread.messages].reverse().find((m) => m.from === 'patron');

  const reply = async (body: Record<string, unknown>) => {
    setErr(''); setBusy(true);
    const r = await api('/api/staff/reply', { threadId: thread.id, ...body }).catch(() => null);
    setBusy(false);
    if (!r) return setErr('Couldn’t reach the relay.');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).error || 'Couldn’t send.');
    return true;
  };
  const sendTyped = async () => {
    if (!text.trim()) return;
    const source = kind === 'catalog' ? { kind, detail } : kind === 'named' ? { kind, detail: named } : { kind: 'none' };
    if (await reply({ text, source, draftUsed })) { setText(''); setDraftUsed(false); setKind('none'); }
  };
  const draft = thread.draft && thread.draft.forMessage === waitingFor?.id ? thread.draft : undefined;
  const draftSource = (d: Draft) => ({ kind: 'catalog', detail: (d.lockedId || (d.facts || []).map((f) => f.ref).join(', ')).slice(0, 120) });
  const useDraft = (d: Draft) => {
    setText(d.text || ''); setDraftUsed(true);
    if (d.facts?.length || d.lockedId) { setKind('catalog'); setDetail(draftSource(d).detail); }
    boxRef.current?.focus();
  };
  const sendDraft = async (d: Draft) => { if (await reply({ text: d.text, source: draftSource(d), draftUsed: true })) { setText(''); setDraftUsed(false); setKind('none'); } };
  const redraft = async () => { setErr(''); const r = await api('/api/staff/draft', { threadId: thread.id }).catch(() => null); if (r && !r.ok) setErr((await r.json().catch(() => ({}))).error || 'Couldn’t start a draft.'); };
  const modelName = (id: string) => settings?.drafts?.models.find((m) => m.id === id)?.label || id;

  return (
    <>
      <div className="st-convo-h">
        <div>
          <h2>{thread.context}</h2>
          <p>{thread.kiosk} · started {new Date(thread.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · <b>{STATUS[thread.status]}</b>
            {thread.status === 'waiting' && waitingFor && <> · waiting {mmss(now - waitingFor.at)}{settings && <> (kiosk points to staff at {mmss(settings.replyTimeoutS * 1000)})</>}</>}
          </p>
        </div>
        {!thread.open && (
          confirmDel ? (
            <div className="st-row" role="group" aria-label="Confirm delete">
              <span className="st-hint">Delete this conversation? It also leaves the log export.</span>
              <button className="st-btn" onClick={() => setConfirmDel(false)}>Keep it</button>
              <button className="st-btn danger" disabled={busy} onClick={async () => { setBusy(true); await api('/api/staff/delete', { threadId: thread.id }).catch(() => null); setBusy(false); }}>Delete</button>
            </div>
          ) : (
            <button className="st-btn" onClick={() => setConfirmDel(true)}><Icon n="x" />Delete conversation</button>
          )
        )}
      </div>

      <div className="st-msgs" aria-live="polite">
        {thread.messages.map((m) => (
          <div key={m.id} className={'st-msg ' + m.from}>
            {m.from === 'system' ? <p>{m.text}</p> : (
              <>
                <div className="st-bubble">{tagged(m.text)}</div>
                <div className="st-msg-meta">
                  {m.from === 'patron' ? 'Patron' : 'You'} · {new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                  {m.locked && <> · locked copy</>}
                  {m.from === 'staff' && !m.locked && <> · source: {m.source?.kind === 'catalog' ? 'catalog · ' + placeName(m.source.detail) : m.source?.kind === 'named' ? m.source.detail : 'none (candidate catalog entry)'}</>}
                  {m.draft && <> · draft {m.draft === 'as-is' ? 'sent as is' : m.draft}</>}
                  {m.vote && <> · patron said <b>{m.vote === 'up' ? 'Helpful' : 'Not helpful'}</b></>}
                </div>
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {!thread.open ? (
        <div className="st-closed">This patron’s session has ended. The kiosk erased the conversation, so they can’t see replies.</div>
      ) : (
        <div className="st-compose">
          {settings?.drafts?.available && waitingFor && thread.messages.filter((m) => m.from !== 'system').at(-1)?.from === 'patron' && (
            <DraftCard draft={draft} modelName={modelName} busy={busy} tagged={tagged}
              onUse={useDraft} onSend={sendDraft} onRedraft={redraft} />
          )}
          <div className="st-quick" role="toolbar" aria-label="Quick replies">
            <button className={'st-chip lock' + (thread.bot ? ' hot' : '')} disabled={busy} onClick={() => reply({ lockedId: content.locked.bot.id })}
              title={`Locked: sends “${content.locked.bot.text}” as is`}><Icon n="user" />I’m a person</button>
            <button className={'st-chip lock danger' + (thread.urgent ? ' hot' : '')} disabled={busy} onClick={() => reply({ lockedId: content.locked.emergency.id })}
              title="Locked: sends the emergency message as is"><Icon n="warn" />Emergency</button>
            <span className="st-quick-sep" aria-hidden="true" />
            {content.saved.map((c) => <button key={c.id} className="st-chip" title={c.text} onClick={() => { setText(c.text); boxRef.current?.focus(); }}>{c.label}</button>)}
            <button className="st-chip handoff" disabled={busy} onClick={() => reply({ text: content.saved.find((c) => c.id === 'desk')?.text, source: { kind: 'none' }, handoff: 'yes' })}>Send to the desk now</button>
          </div>
          <div className="st-input">
            <textarea id="reply" ref={boxRef} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} aria-label="Your answer"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped(); } }}
              placeholder="Type an answer (1–4 short sentences). Enter sends, Shift+Enter adds a line." />
            <button className="st-btn p" disabled={busy || !text.trim()} onClick={sendTyped}>Send<Icon n="right" /></button>
          </div>
          <div className="st-source" role="radiogroup" aria-label="Where this answer comes from">
            <span className="st-hint">Source</span>
            {(['catalog', 'named', 'none'] as const).map((k) => (
              <label key={k} className={'st-radio' + (kind === k ? ' on' : '')}>
                <input type="radio" name="src" checked={kind === k} onChange={() => setKind(k)} />
                {k === 'catalog' ? 'Catalog' : k === 'named' ? 'Named' : 'None'}
              </label>
            ))}
            {kind === 'catalog' && (
              <select value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="Which catalog entry">
                <option value="">Which entry?</option>
                {detail && !places.some((p) => p.id === detail) && <option value={detail}>From the draft: {detail}</option>}
                {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {kind === 'named' && <input className="st-named" value={named} onChange={(e) => setNamed(e.target.value)} placeholder="e.g. Circulation desk, cpl.org/hours" aria-label="Named source" />}
            {kind === 'none' && <span className="st-hint">· logged as a candidate catalog entry</span>}
          </div>
          {err && <p className="st-err" role="alert">{err}</p>}
        </div>
      )}
    </>
  );
}

/** The AI draft for the latest patron question: review it, then send as is, edit it in the box, or redraft. */
function DraftCard({ draft, modelName, busy, tagged, onUse, onSend, onRedraft }: {
  draft?: Draft; modelName: (id: string) => string; busy: boolean; tagged: (s: string) => React.ReactNode;
  onUse: (d: Draft) => void; onSend: (d: Draft) => void; onRedraft: () => void;
}) {
  if (!draft) return (
    <div className="st-draft idle"><span className="st-label">Suggested reply</span><button className="st-link" onClick={onRedraft}><Icon n="spark" />Draft a reply</button></div>
  );
  const head = (
    <div className="st-draft-h">
      <span className="st-label">Suggested reply</span>
      <span className="st-hint">{modelName(draft.model)}{draft.ms ? ` · ${(draft.ms / 1000).toFixed(1)} s` : ''}</span>
      {draft.status !== 'drafting' && <button className="st-link" onClick={onRedraft}>Redraft</button>}
    </div>
  );
  if (draft.status === 'drafting') return <div className="st-draft busy" aria-busy="true">{head}<p className="st-draft-wait"><span className="st-dots" aria-hidden="true"><i /><i /><i /></span>Drafting from the facts library…</p></div>;
  if (draft.status === 'error') return <div className="st-draft err">{head}<p className="st-hint">{draft.error || 'The draft didn’t work.'}</p></div>;
  if (draft.kind === 'no_fact') return (
    <div className="st-draft none">{head}
      <p className="st-hint"><b>No fact covers this.</b> {draft.note} Write it yourself; with no source it’s logged as a candidate catalog entry.</p>
    </div>
  );
  const n = draft.facts?.length || 0;
  return (
    <div className={'st-draft ready' + (draft.kind === 'locked' ? ' locked' : '')}>
      {head}
      <div className="st-draft-text">{tagged(draft.text || '')}</div>
      {!!draft.placeholders && <p className="st-warn sm">{draft.placeholders} placeholder{draft.placeholders > 1 ? 's' : ''} to fill in before sending.</p>}
      {!!draft.unknownRefs?.length && <p className="st-warn sm">Cites facts not in the library: {draft.unknownRefs.join(', ')}.</p>}
      <div className="st-draft-foot">
        <details className="st-draft-more">
          <summary>{draft.kind === 'locked' ? 'Locked copy · sends exactly as written' : n ? `Based on ${n} fact${n > 1 ? 's' : ''}` : 'Details'}</summary>
          {draft.note && <p className="st-draft-note">{draft.note}</p>}
          {n > 0 && (
            <ul className="st-facts" aria-label="Facts used">
              {draft.facts!.map((f) => <li key={f.ref} className={'st-fact ' + f.provenance} title={f.ref}>{f.label}<b>{f.provenance === 'verified' && f.lastVerified ? 'verified ' + f.lastVerified : f.provenance}</b></li>)}
            </ul>
          )}
        </details>
        <div className="st-row">
          {draft.kind !== 'locked' && <button className="st-btn sm" onClick={() => onUse(draft)}>Edit</button>}
          <button className="st-btn sm p" disabled={busy} onClick={() => onSend(draft)}>Send<Icon n="right" /></button>
        </div>
      </div>
    </div>
  );
}

/** A soft two-note chime for new questions (WebAudio; needs one user gesture first). */
let audio: AudioContext | null = null;
function ping() {
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    [660, 880].forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.4);
    });
  } catch { /* no audio */ }
}
