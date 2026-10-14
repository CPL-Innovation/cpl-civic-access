import { Fragment } from 'react';
import { config } from '../config';

/**
 * Unverified facts are written [[what to verify|sample value]].
 * No "|" means there is no sample yet: it always shows as a tag.
 */
export interface Part { t: string; ph?: { label: string; mock: string | null } }

export function seg(s?: string | null): Part[] {
  s = s || '';
  const out: Part[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    const bar = m[1].indexOf('|');
    const label = bar < 0 ? m[1] : m[1].slice(0, bar);
    const mock = bar < 0 ? null : m[1].slice(bar + 1);
    out.push({ t: mock ?? label, ph: { label, mock } });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  return out;
}

/** Plain text for alt text, speech, and phone/print pages that need a string. */
export function plain(s?: string | null): string {
  return seg(s).map((p) => {
    if (!p.ph) return p.t;
    if (config.placeholders === 'tags' || p.ph.mock === null) return `[PLACEHOLDER: ${p.ph.label}]`;
    return p.ph.mock;
  }).join('').replace(/\s+/g, ' ').trim();
}

/** Render a content string, showing unverified facts per the placeholder mode. */
export function T({ s }: { s?: string | null }) {
  return (
    <>
      {seg(s).map((p, i) => {
        if (!p.ph) return <Fragment key={i}>{p.t}</Fragment>;
        const tag = config.placeholders === 'tags' || p.ph.mock === null;
        if (tag) return <span key={i} className="ph">[PLACEHOLDER: {p.ph.label}]</span>;
        if (!p.ph.mock) return null;
        if (config.placeholders === 'clean') return <Fragment key={i}>{p.ph.mock}</Fragment>;
        return <span key={i} className="mock" title={`Sample content — not yet verified: ${p.ph.label}`}>{p.ph.mock}</span>;
      })}
    </>
  );
}
