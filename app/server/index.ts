/**
 * Library assistant relay — the human-answered assistant's back end.
 *
 * A patron at a kiosk asks a question; it lands in the staff console's queue;
 * the person answering replies; the reply goes back to that kiosk session in
 * real time. Server-sent events carry everything outward; plain POSTs carry
 * everything inward. No database, no accounts, no dependencies.
 *
 * Privacy: everything lives in memory. A restart wipes it. Nothing about the
 * patron is collected beyond the words they choose to type, and the log
 * export carries no identifiers. Retention is an open decision
 * (BUILD-entrance-kiosk §6, decision 2) — don't add persistence until it's made.
 *
 * Run: node server/index.ts   (Node ≥ 22.18 runs TypeScript directly)
 * Env: RELAY_PORT or PORT (default 5181), REPLY_TIMEOUT_S (default 120),
 *      STAFF_PASSCODE (optional: set it to require a passcode for /staff; unset = open, no sign-in),
 *      ALLOWED_ORIGINS (comma-separated sites allowed to call /api from a browser, e.g. the Vercel URL; default *)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.RELAY_PORT || process.env.PORT || 5181);
const PASSCODE = process.env.STAFF_PASSCODE || ''; // empty = the console is open
const REPLY_TIMEOUT_S = Number(process.env.REPLY_TIMEOUT_S || 120);
const DIST = path.resolve(here, '../dist');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);

interface Copy { id: string; label: string; text: string }
interface EntranceContent {
  locked: { bot: Copy; emergency: Copy };
  saved: Copy[];
  botWords: string[];
  emergencyWords: string[];
  directory: { id: string; name: string }[];
}
const content = JSON.parse(fs.readFileSync(path.resolve(here, '../src/content/entrance.json'), 'utf8')) as EntranceContent;
interface Hours { timezone: string; windows: { days: number[]; start: string; end: string }[]; endDate: string | null }
const hours = JSON.parse(fs.readFileSync(path.resolve(here, 'hours.json'), 'utf8')) as Hours;

/* ---------------- state (memory only) ---------------- */

type Who = 'patron' | 'staff' | 'system';
type SourceKind = 'catalog' | 'named' | 'none';
interface Msg {
  id: string; from: Who; text: string; at: number;
  locked?: string; chipId?: string;
  source?: { kind: SourceKind; detail?: string };
  vote?: 'up' | 'down' | null;
}
type Status = 'waiting' | 'answered' | 'timedout' | 'handed' | 'closed';
interface Thread {
  id: string; kiosk: string; session: string; context: string;
  startedAt: number; updatedAt: number;
  status: Status; closedReason?: string; open: boolean;
  urgent: boolean; bot: boolean;
  messages: Msg[];
}

/**
 * Patron-facing features the person at the console can switch.
 * Add new ones here; the kiosk receives them with every status update.
 */
interface Features {
  /** Tapping a place card on Home opens the Ask chat with that card's question as the first message (only while Ask is available). */
  cardsOpenChat: boolean;
}
const FEATURE_KEYS: (keyof Features)[] = ['cardsOpenChat'];

const state = {
  features: { cardsOpenChat: false } as Features,
  askOn: false,
  ignoreHours: false,
  threads: new Map<string, Thread>(),
  bySession: new Map<string, string>(),
  tokens: new Set<string>(),
};

const id = () => crypto.randomUUID().slice(0, 8);
const norm = (s: string) => ' ' + s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const hasAny = (text: string, words: string[]) => { const t = norm(text); return words.some((w) => t.includes(norm(w))); };

/* ---------------- posted hours + availability ---------------- */

function insideHours(now = new Date()): boolean {
  if (!hours.windows.length) return true; // none posted yet: the switch alone decides (the console says so)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: hours.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hm = get('hour') + ':' + get('minute');
  return hours.windows.some((w) => w.days.includes(day) && hm >= w.start && hm < w.end);
}

function availability() {
  const staffOnline = [...clients.values()].some((c) => c.kind === 'staff');
  const inHours = state.ignoreHours || insideHours();
  let reason = 'on';
  if (!state.askOn) reason = 'switched off';
  else if (!staffOnline) reason = 'no console connected';
  else if (!inHours) reason = 'outside posted hours';
  return { available: reason === 'on', reason };
}

/* ---------------- server-sent events ---------------- */

interface Client { kind: 'staff' | 'kiosk'; res: http.ServerResponse; session?: string; kiosk?: string }
const clients = new Map<number, Client>();
let clientSeq = 0;

function sse(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function toStaff(event: string, data: unknown) { for (const c of clients.values()) if (c.kind === 'staff') sse(c.res, event, data); }
function toSession(session: string, event: string, data: unknown) { for (const c of clients.values()) if (c.kind === 'kiosk' && c.session === session) sse(c.res, event, data); }

let lastAvail = '';
function pushAvailability() {
  const a = availability();
  const key = JSON.stringify(a);
  for (const c of clients.values()) if (c.kind === 'kiosk') sse(c.res, 'status', kioskStatus());
  toStaff('settings', settings());
  lastAvail = key;
}
// Posted-hours boundaries pass without anyone touching anything.
setInterval(() => { if (JSON.stringify(availability()) !== lastAvail) pushAvailability(); }, 20_000);
// Keep proxies from closing quiet streams.
setInterval(() => { for (const c of clients.values()) c.res.write(': ping\n\n'); }, 25_000);

function kioskStatus() { return { ...availability(), replyTimeoutS: REPLY_TIMEOUT_S, features: state.features }; }

function settings() {
  return {
    askOn: state.askOn, ignoreHours: state.ignoreHours,
    hoursSet: hours.windows.length > 0, insideHours: insideHours(), endDate: hours.endDate,
    passcodeRequired: !!PASSCODE,
    features: state.features,
    kiosksOnline: new Set([...clients.values()].filter((c) => c.kind === 'kiosk').map((c) => c.kiosk)).size,
    replyTimeoutS: REPLY_TIMEOUT_S,
    ...availability(),
  };
}

/* ---------------- the log (derived; no identifiers) ---------------- */

function logRows() {
  const rows: Record<string, string | number>[] = [];
  for (const t of state.threads.values()) {
    const msgs = t.messages;
    msgs.forEach((m, i) => {
      if (m.from !== 'patron') return;
      const reply = msgs.slice(i + 1).find((x) => x.from === 'staff');
      const nextQ = msgs.slice(i + 1).findIndex((x) => x.from === 'patron');
      const replied = reply && (nextQ < 0 || msgs.indexOf(reply) < i + 1 + nextQ);
      const outcome = replied ? (reply!.text === content.saved.find((s) => s.id === 'desk')?.text ? 'handed to staff' : 'answered')
        : t.status === 'timedout' ? 'timed out → staff' : t.status === 'handed' ? 'handed to staff' : t.open ? 'waiting' : t.closedReason === 'patron closed the chat' ? 'patron ended the chat' : 'abandoned';
      rows.push({
        time: new Date(m.at).toISOString(), kiosk: t.kiosk, context: t.context,
        question: m.text, answer: replied ? reply!.text : '',
        source: replied ? (reply!.source?.kind === 'named' ? 'named: ' + (reply!.source.detail || '') : reply!.source?.kind === 'catalog' ? 'catalog: ' + (reply!.source.detail || '') : reply!.locked ? 'locked: ' + reply!.locked : 'none (candidate catalog entry)') : '',
        response_s: replied ? Math.round((reply!.at - m.at) / 1000) : '',
        outcome, vote: replied ? reply!.vote || '' : '',
        urgent: t.urgent ? 'yes' : '',
      });
    });
  }
  return rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
}
function csv(rows: Record<string, string | number>[]) {
  const cols = ['time', 'kiosk', 'context', 'question', 'answer', 'source', 'response_s', 'outcome', 'vote', 'urgent'];
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

/* ---------------- helpers ---------------- */

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) break; }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
const str = (v: unknown, max = 280) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function authed(req: http.IncomingMessage, url: URL) {
  if (!PASSCODE) return true;
  const t = (req.headers['x-staff-token'] as string) || url.searchParams.get('token') || '';
  return state.tokens.has(t);
}
function threadView(t: Thread) { return t; }
function touch(t: Thread) { t.updatedAt = Date.now(); toStaff('thread', threadView(t)); }

/* ---------------- routes ---------------- */

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const p = url.pathname;

  /* --- kiosk side --- */
  if (p === '/api/kiosk/stream' && req.method === 'GET') {
    const session = str(url.searchParams.get('session'), 64);
    const kiosk = str(url.searchParams.get('kiosk'), 64) || 'main-entrance';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const key = ++clientSeq;
    clients.set(key, { kind: 'kiosk', res, session, kiosk });
    sse(res, 'status', kioskStatus());
    toStaff('settings', settings());
    req.on('close', () => { clients.delete(key); toStaff('settings', settings()); });
    return;
  }
  if (p === '/api/kiosk/ask' && req.method === 'POST') {
    const b = await body(req);
    const session = str(b.session, 64), text = str(b.text);
    if (!session || !text) return json(res, 400, { error: 'session and text required' });
    if (!availability().available) return json(res, 409, availability());
    let t = state.threads.get(state.bySession.get(session) || '');
    if (!t) {
      t = { id: id(), kiosk: str(b.kiosk, 64) || 'main-entrance', session, context: str(b.context, 120) || 'Main Library', startedAt: Date.now(), updatedAt: Date.now(), status: 'waiting', open: true, urgent: false, bot: false, messages: [] };
      state.threads.set(t.id, t);
      state.bySession.set(session, t.id);
    }
    t.context = str(b.context, 120) || t.context;
    const m: Msg = { id: id(), from: 'patron', text, at: Date.now(), chipId: str(b.chipId, 40) || undefined };
    t.messages.push(m);
    if (hasAny(text, content.emergencyWords)) {
      t.urgent = true;
      t.messages.push({ id: id(), from: 'system', text: 'The kiosk showed the locked emergency message right away.', at: Date.now() });
    }
    if (hasAny(text, content.botWords)) t.bot = true;
    t.status = 'waiting';
    touch(t);
    return json(res, 200, { ok: true, threadId: t.id, messageId: m.id });
  }
  if (p === '/api/kiosk/vote' && req.method === 'POST') {
    const b = await body(req);
    const t = state.threads.get(state.bySession.get(str(b.session, 64)) || '');
    const m = t?.messages.find((x) => x.id === b.messageId && x.from === 'staff');
    if (!t || !m) return json(res, 404, { error: 'not found' });
    m.vote = b.vote === 'up' || b.vote === 'down' ? b.vote : null;
    touch(t);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/kiosk/timeout' && req.method === 'POST') {
    const b = await body(req);
    const t = state.threads.get(state.bySession.get(str(b.session, 64)) || '');
    if (t && t.status === 'waiting') {
      t.status = 'timedout';
      t.messages.push({ id: id(), from: 'system', text: 'No reply in time. The kiosk pointed the patron to staff.', at: Date.now() });
      touch(t);
    }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/kiosk/end' && req.method === 'POST') {
    const b = await body(req);
    const session = str(b.session, 64);
    const t = state.threads.get(state.bySession.get(session) || '');
    if (t && t.open) {
      t.open = false;
      t.closedReason = str(b.reason, 40) || 'reset';
      if (t.status === 'waiting') t.status = 'closed';
      t.messages.push({ id: id(), from: 'system', text: `Session ended (${t.closedReason}). The kiosk erased the conversation.`, at: Date.now() });
      state.bySession.delete(session);
      touch(t);
    }
    return json(res, 200, { ok: true });
  }

  /* --- staff side --- */
  if (p === '/api/staff/login' && req.method === 'POST') {
    const b = await body(req);
    const ok = !PASSCODE || (typeof b.passcode === 'string' && b.passcode.length === PASSCODE.length && crypto.timingSafeEqual(Buffer.from(b.passcode), Buffer.from(PASSCODE)));
    if (!ok) return json(res, 401, { error: 'wrong passcode' });
    const token = crypto.randomBytes(18).toString('base64url');
    state.tokens.add(token);
    return json(res, 200, { token });
  }
  if (!p.startsWith('/api/staff/')) return json(res, 404, { error: 'not found' });
  if (!authed(req, url)) return json(res, 401, { error: 'sign in again' });

  if (p === '/api/staff/stream' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const key = ++clientSeq;
    clients.set(key, { kind: 'staff', res });
    sse(res, 'snapshot', { threads: [...state.threads.values()], settings: settings(), content: { locked: content.locked, saved: content.saved, directory: content.directory } });
    pushAvailability();
    req.on('close', () => { clients.delete(key); pushAvailability(); });
    return;
  }
  if (p === '/api/staff/reply' && req.method === 'POST') {
    const b = await body(req);
    const t = state.threads.get(str(b.threadId, 20));
    if (!t) return json(res, 404, { error: 'not found' });
    if (!t.open) return json(res, 410, { error: 'The patron’s session has ended. They can’t see replies.' });
    const lockedId = str(b.lockedId, 20);
    const locked = lockedId ? Object.values(content.locked).find((c) => c.id === lockedId) : undefined;
    const text = locked ? locked.text : str(b.text, 600);
    if (!text) return json(res, 400, { error: 'empty reply' });
    const src = (b.source || {}) as { kind?: string; detail?: unknown };
    const kind: SourceKind = src.kind === 'catalog' || src.kind === 'named' ? src.kind : 'none';
    const m: Msg = { id: id(), from: 'staff', text, at: Date.now(), locked: locked?.id, source: locked ? undefined : { kind, detail: str(src.detail, 120) || undefined }, vote: null };
    t.messages.push(m);
    t.status = str(b.handoff, 5) === 'yes' ? 'handed' : 'answered';
    toSession(t.session, 'reply', m);
    touch(t);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/staff/settings' && req.method === 'POST') {
    const b = await body(req);
    if (typeof b.askOn === 'boolean') state.askOn = b.askOn;
    if (typeof b.ignoreHours === 'boolean') state.ignoreHours = b.ignoreHours;
    const f = (b.features || {}) as Record<string, unknown>;
    for (const k of FEATURE_KEYS) if (typeof f[k] === 'boolean') state.features = { ...state.features, [k]: f[k] as boolean };
    pushAvailability();
    return json(res, 200, settings());
  }
  if (p === '/api/staff/clear' && req.method === 'POST') {
    for (const [k, t] of state.threads) if (!t.open) state.threads.delete(k);
    toStaff('snapshot', { threads: [...state.threads.values()], settings: settings(), content: { locked: content.locked, saved: content.saved, directory: content.directory } });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/staff/delete' && req.method === 'POST') {
    const b = await body(req);
    const t = state.threads.get(str(b.threadId, 20));
    if (!t) return json(res, 404, { error: 'not found' });
    // Only finished conversations: a patron still at the kiosk can't have theirs pulled out from under them.
    if (t.open) return json(res, 409, { error: 'This conversation is still open on the kiosk.' });
    state.threads.delete(t.id);
    toStaff('removed', { id: t.id });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/staff/log.csv' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="assistant-log-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' });
    res.end(csv(logRows()));
    return;
  }
  return json(res, 404, { error: 'not found' });
}

/* ---------------- static (production) ---------------- */

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (!fs.existsSync(DIST)) { res.writeHead(404); res.end('Run `npm run build` first, or use `npm run dev`.'); return; }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

/** CORS: lets pages hosted elsewhere (Vercel) reach the relay. No cookies are used, so no credentials mode. */
function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = String(req.headers.origin || '');
  if (!origin) return;
  if (ALLOWED_ORIGINS.includes('*')) res.setHeader('access-control-allow-origin', '*');
  else if (ALLOWED_ORIGINS.includes(origin)) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'origin'); }
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-staff-token');
  res.setHeader('access-control-max-age', '600');
}

http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (url.pathname === '/api/health') { json(res, 200, { ok: true, uptime_s: Math.round(process.uptime()) }); return; }
    api(req, res, url).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server error' }); });
  } else serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`Library assistant relay on http://localhost:${PORT}`);
  console.log(PASSCODE ? '  Console: passcode required (STAFF_PASSCODE)' : '  Console: open at /staff, no passcode (set STAFF_PASSCODE to require one)');
  console.log(`  Posted hours: ${hours.windows.length ? hours.windows.length + ' window(s)' : 'none set — Ask follows the console switch'} · reply timeout ${REPLY_TIMEOUT_S}s`);
});
