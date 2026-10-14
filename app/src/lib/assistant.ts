import { ASSIST, QAS, type Ctx, type Kind, type QA } from '../content';

/** What the assistant panel renders. Swap the source; keep this shape. */
export interface Answer {
  q: string;
  kind: Kind;
  text: string;
  based?: string;
  step?: string | number;
  to?: { screen: string; sym?: string };
  rules?: boolean;
}

export interface AnswerSource {
  suggestions(ctx: Ctx): QA[];
  ask(ctx: Ctx, input: { id?: string; text?: string }): Promise<Answer>;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ');
const has = (text: string, words: string[]) => words.some((w) => (' ' + text + ' ').includes(' ' + norm(w).trim() + ' ') || (w.includes(' ') && text.includes(norm(w))));

function toAnswer(qa: QA, asked?: string): Answer {
  const text = qa.kind === 'notin' ? ASSIST.notin : qa.kind === 'off' ? ASSIST.off : qa.kind === 'safety' ? ASSIST.safety : qa.a || '';
  return { q: asked ?? qa.q, kind: qa.kind, text, based: qa.based, step: qa.step, to: qa.to, rules: qa.rules };
}

/**
 * Stub: answers only from the QA table. Typed questions are matched by
 * keyword, with safety checked first and nothing ever generated.
 */
export const stubSource: AnswerSource = {
  suggestions: (ctx) => QAS[ctx] ?? QAS.print,
  async ask(ctx, { id, text }) {
    await new Promise((r) => setTimeout(r, 650));
    const list = QAS[ctx] ?? QAS.print;
    if (id) {
      const qa = list.find((x) => x.id === id);
      if (qa) return toAnswer(qa);
    }
    const asked = (text || '').trim();
    const t = norm(asked);
    if (has(t, ASSIST.safetyWords)) return { q: asked, kind: 'safety', text: ASSIST.safety };
    if (has(t, ASSIST.offWords)) return { q: asked, kind: 'off', text: ASSIST.off };
    let best: QA | undefined, score = 0;
    for (const qa of list) {
      const s = qa.keywords.filter((k) => has(t, [k])).length;
      if (s > score) { best = qa; score = s; }
    }
    if (best && score >= 1 && best.kind !== 'safety') return toAnswer(best, asked);
    if (has(t, ASSIST.judgeWords)) return { q: asked, kind: 'judge', text: ASSIST.judgeGeneric, rules: ctx === 'm1' || ctx === 'planA' || ctx === 'planB' };
    return { q: asked, kind: 'notin', text: ASSIST.notin };
  },
};

export const answerSource: AnswerSource = stubSource;
