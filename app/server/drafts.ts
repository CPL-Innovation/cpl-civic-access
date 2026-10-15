/**
 * AI-drafted replies for the console. When a patron asks something, Claude reads the conversation and
 * the facts library (src/content/catalog.generated.json, synced from the vault) and drafts a reply.
 * A person always reviews it, edits if needed, and sends it: nothing reaches the kiosk from here.
 *
 * Grounding follows the catalog README:
 *  - Only the catalog's facts. No web, no general knowledge.
 *  - A placeholder fact is never stated as a value. In a draft it appears as a [[label]] tag, so the
 *    console and the kiosk both show it as a placeholder.
 *  - Locked copy is chosen by id and inserted exactly as written; the model never retypes it.
 *  - If no fact covers the question, the draft says so instead of guessing.
 *
 * Env: ANTHROPIC_API_KEY (turns drafts on), DRAFT_MODEL_DEFAULT (default claude-sonnet-5-5), DRAFT_FAKE=1 (canned drafts, no key).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.ANTHROPIC_API_KEY || '';
/** DRAFT_FAKE=1: canned drafts, for trying the console without a key. */
const FAKE = process.env.DRAFT_FAKE === '1';
export const draftsAvailable = () => !!KEY || FAKE;

/** The choices in the console's settings; any other model id can be typed in. */
export const MODEL_CHOICES = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Balanced (default)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Most careful, slower' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest' },
];
export const DEFAULT_MODEL = process.env.DRAFT_MODEL_DEFAULT || 'claude-sonnet-5-5';

/* ---------------- the catalog ---------------- */

interface Fact { label: string; value: unknown; provenance?: 'placeholder' | 'harvested' | 'verified'; last_verified?: string | null; source?: string }
interface CatalogFile { file: string; id: string; type: string; title?: string; facts?: Record<string, Fact>; messages?: Record<string, { locked?: boolean; text: string }>; hard_limits?: string[]; [k: string]: unknown }
interface Catalog { syncedAt: string; sections: Record<string, CatalogFile[]> }

const catalog = JSON.parse(fs.readFileSync(path.resolve(here, '../src/content/catalog.generated.json'), 'utf8')) as Catalog;
const files = Object.values(catalog.sections).flat();
export const FACTS = new Map<string, Fact & { ref: string }>();
for (const f of files) for (const [k, v] of Object.entries(f.facts || {})) FACTS.set(`${f.id}.${k}`, { ...v, ref: `${f.id}.${k}` });
const isPlaceholder = (f: Fact) => f.provenance === 'placeholder' || f.provenance == null || /\[PLACEHOLDER/i.test(String(f.value));
/** A placeholder as the kiosk's tag syntax: shown as a visible placeholder, never as a value. */
const tag = (f: Fact) => `[[${f.label.replace(/[[\]|]/g, '')}]]`;
const resolve = (s: string) => s.replace(/\{\{([\w-]+\.[\w-]+)\}\}/g, (_, r: string) => { const f = FACTS.get(r); return !f ? `{{${r}}}` : isPlaceholder(f) ? tag(f) : String(f.value); });

/** Locked copy, by "<file id>.<message id>", resolved. */
export const LOCKED = new Map<string, string>();
// Left out: messages with a runtime slot ({rule}, {date}) the drafter can't fill; the "AI answer" label (patrons aren't
// told); and the TechCentral assistant's off-topic refusal, since the entrance chat takes any library question.
const SKIP = new Set(['answer-label', 'refusal-off-topic']);
for (const f of files) for (const [k, m] of Object.entries(f.messages || {})) if (m.locked && !/\{[a-z_]+\}/.test(m.text) && !SKIP.has(k)) LOCKED.set(`${f.id}.${k}`, resolve(m.text));

function knowledge(): string {
  const out: string[] = [`FACTS LIBRARY (synced ${catalog.syncedAt.slice(0, 10)})`];
  for (const [section, fs_] of Object.entries(catalog.sections)) {
    out.push(`\n=== Section: ${section} ===`);
    for (const f of fs_.filter((x) => x.facts)) {
      out.push(`\n## ${f.id} (${f.type}): ${f.title || ''}`);
      for (const [k, v] of Object.entries(f.facts!)) {
        out.push(isPlaceholder(v)
          ? `- ${f.id}.${k} | ${v.label} | PLACEHOLDER: unknown. If needed, write the tag ${tag(v)} in its place.`
          : `- ${f.id}.${k} | ${v.label} | value: ${typeof v.value === 'string' ? v.value : JSON.stringify(v.value)} | ${v.provenance}${v.last_verified ? ', verified ' + v.last_verified : ''}`);
      }
    }
    for (const f of fs_.filter((x) => x.type === 'journey')) {
      const { file: _f, id, type: _t, title, status: _s, reviewed_by: _r, last_reviewed: _l, uses: _u, ...rest } = f;
      out.push(`\n## Journey ${id}: ${title || ''} (how staff explain it; facts already filled in)\n` + resolve(JSON.stringify(rest, (k, v) => (k === 'media' || k === 'alt' ? undefined : v))));
    }
    for (const f of fs_.filter((x) => x.messages)) {
      out.push(`\n## Fixed copy (${f.id})`);
      for (const k of Object.keys(f.messages!)) if (LOCKED.has(`${f.id}.${k}`)) out.push(`- locked id "${f.id}.${k}": ${LOCKED.get(`${f.id}.${k}`)}`);
      if (f.hard_limits?.length) out.push('Never, whatever is asked:\n' + f.hard_limits.map((h) => '  - ' + h).join('\n'));
    }
  }
  return out.join('\n');
}
const KNOWLEDGE = knowledge();

const RULES = `You draft replies for a library staff member who answers patrons' questions live, through a chat on a touchscreen kiosk at the entrance of the Cleveland Public Library's Main Library. The staff member reviews every draft, edits it if needed, and sends it themselves. Patrons see the reply as coming from the library assistant (a person).

Ground rules:
1. Use ONLY the facts library below. No outside knowledge, no web, no guesses about the library. If the library doesn't cover the question, return kind "no_fact" with an empty text and say in the staff note what fact is missing.
2. A fact marked PLACEHOLDER is unknown. Never invent or imply its value. If the answer needs it, write its [[tag]] exactly as given, in the sentence where the value would go, and list the fact in facts_used.
3. If a locked message fits (safety, refusal, privacy), return kind "locked" with its locked_id and empty text. Never paraphrase locked copy. Anything about a hot nozzle, smoke, burning, injury or a machine misbehaving dangerously is always the safety-stop message.
4. Respect the "Never" list.
5. Write for a patron reading a public screen: 1 to 3 short sentences, plain words, friendly and direct, no jargon, no lists unless they asked for steps. Don't mention the facts library, sources, drafts, or AI. Don't ask for personal information.
6. List every fact you relied on in facts_used, as "entity.fact" ids from the library.
7. Answer the patron's latest message, using earlier messages for context. If the staff member already answered something, don't repeat it.
8. Scope: this chat takes any question about the library, not only TechCentral. The library currently covers TechCentral (printing, 3D printing, the makerspace); for anything else it has no facts yet, so return "no_fact". Use the refusal-not-in-guide message only for TechCentral topics whose facts are missing or that need a staff judgment.`;

const TOOL = {
  name: 'draft_reply',
  description: 'Return the draft reply for the staff member to review.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['answer', 'locked', 'no_fact'], description: 'answer = a drafted reply; locked = use a locked message as-is; no_fact = the library doesn’t cover this' },
      text: { type: 'string', description: 'The reply as the patron will read it (empty for locked and no_fact).' },
      locked_id: { type: 'string', description: 'For kind "locked": the locked id, e.g. assistant-and-fixed-copy.safety-stop' },
      facts_used: { type: 'array', items: { type: 'string' }, description: 'entity.fact ids the reply relies on' },
      note_for_staff: { type: 'string', description: 'One short line for the staff member: what to check, what’s missing, or why this kind.' },
    },
    required: ['kind', 'text', 'facts_used', 'note_for_staff'],
  },
};

/* ---------------- drafting ---------------- */

export interface DraftFact { ref: string; label: string; provenance: string; lastVerified?: string | null }
export interface Draft {
  status: 'drafting' | 'ready' | 'error';
  forMessage: string; at: number; model: string;
  kind?: 'answer' | 'locked' | 'no_fact';
  text?: string; lockedId?: string; note?: string;
  facts?: DraftFact[]; unknownRefs?: string[]; placeholders?: number;
  ms?: number; error?: string;
}

/** Ask Claude for a draft. `turns` is the conversation, oldest first. */
export async function makeDraft(turns: { from: 'patron' | 'staff'; text: string }[], context: string, model: string, signal: AbortSignal): Promise<Omit<Draft, 'forMessage' | 'at'>> {
  const t0 = Date.now();
  if (FAKE) {
    await new Promise((r) => setTimeout(r, 1200));
    const q = turns.filter((t) => t.from === 'patron').at(-1)?.text.toLowerCase() || '';
    const facts = (refs: string[]) => refs.map((ref) => FACTS.get(ref)!).filter(Boolean).map((f) => ({ ref: f.ref, label: f.label, provenance: isPlaceholder(f) ? 'placeholder' : String(f.provenance), lastVerified: f.last_verified ?? null }));
    if (/smok|burn|hot|fire/.test(q)) return { status: 'ready', model, kind: 'locked', lockedId: 'assistant-and-fixed-copy.safety-stop', text: LOCKED.get('assistant-and-fixed-copy.safety-stop'), facts: facts(['staff-desk.direction_from_kiosk']), placeholders: 1, note: 'Safety wording: always the locked message.', ms: Date.now() - t0 };
    if (/print/.test(q)) return { status: 'ready', model, kind: 'answer', text: `Yes. Black-and-white printing is ${tag(FACTS.get('printing.price_bw')!)} a page. Send your file, then release it at the release station.`, facts: facts(['printing.price_bw', 'release-station.location']), placeholders: 1, unknownRefs: [], note: '(fake draft) The price is still a placeholder.', ms: Date.now() - t0 };
    return { status: 'ready', model, kind: 'no_fact', text: '', facts: [], note: '(fake draft) The library has no main-library/ section yet.', ms: Date.now() - t0 };
  }
  const convo = turns.map((t) => `${t.from === 'patron' ? 'PATRON' : 'STAFF (already sent)'}: ${t.text}`).join('\n');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: [{ type: 'text', text: RULES }, { type: 'text', text: KNOWLEDGE, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      // Newer models don't accept a forced tool_choice; the prompt requires the call, and plain JSON is accepted below.
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: `Now: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (Cleveland).\nThe patron is at: ${context}\n\nConversation so far:\n${convo}\n\nDraft the reply to the patron's latest message. Respond only by calling the draft_reply tool.` }],
    }),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    console.error('draft: provider', r.status, detail);
    return { status: 'error', model, error: r.status === 404 ? `Model “${model}” wasn’t found` : `Provider error ${r.status}`, ms: Date.now() - t0 };
  }
  const j = (await r.json()) as { content?: { type: string; name?: string; text?: string; input?: Record<string, unknown> }[] };
  let input = j.content?.find((c) => c.type === 'tool_use')?.input;
  if (!input) {
    const raw = j.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') || '';
    try { input = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { /* handled below */ }
    if (!input) return { status: 'error', model, error: 'The draft came back in an unexpected shape', ms: Date.now() - t0 };
  }
  const kind = (['answer', 'locked', 'no_fact'] as const).find((k) => k === input.kind) || 'no_fact';
  const refs = Array.isArray(input.facts_used) ? (input.facts_used as unknown[]).map(String) : [];
  const facts = refs.map((ref) => FACTS.get(ref)).filter(Boolean).map((f) => ({ ref: f!.ref, label: f!.label, provenance: isPlaceholder(f!) ? 'placeholder' : String(f!.provenance), lastVerified: f!.last_verified ?? null }));
  const unknownRefs = refs.filter((ref) => !FACTS.has(ref));
  let text = typeof input.text === 'string' ? input.text.trim() : '';
  let lockedId: string | undefined;
  if (kind === 'locked') {
    lockedId = String(input.locked_id || '');
    const locked = LOCKED.get(lockedId);
    if (!locked) return { status: 'error', model, error: `Draft picked a locked message that doesn’t exist (${lockedId})`, ms: Date.now() - t0 };
    text = locked;
  }
  if (kind === 'no_fact') text = '';
  return {
    status: 'ready', model, kind, text, lockedId, facts, unknownRefs,
    placeholders: (text.match(/\[\[[^\]]+\]\]/g) || []).length,
    note: typeof input.note_for_staff === 'string' ? input.note_for_staff.trim() : '',
    ms: Date.now() - t0,
  };
}
