import { useRef, useState } from 'react';
import { ASSIST, type Ctx } from '../content';
import { answerSource, type Answer } from '../lib/assistant';
import { T } from '../lib/ph';

/** “Ask about this plan” on the phone. Same stubbed source as the kiosk; nothing is stored. */
export function PhoneAsk({ ctx, chip, onJump, title = 'Ask about this plan' }: { ctx: Ctx; chip: string; onJump?: (a: Answer) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [a, setA] = useState<Answer | null>(null);
  const [typed, setTyped] = useState('');
  const tok = useRef(0);

  const ask = async (input: { id?: string; text?: string }, label: string) => {
    const t = ++tok.current;
    setAsking(label); setA(null);
    const res = await answerSource.ask(ctx, input);
    if (t === tok.current) { setAsking(null); setA(res); }
  };
  const clear = () => { tok.current++; setA(null); setAsking(null); setTyped(''); };

  if (!open) return <button className="pbtn" onClick={() => setOpen(true)}>{title}</button>;
  return (
    <section className="pask fadeup" aria-label={title}>
      <div className="pask-h"><b>{title}</b><button className="plink" style={{ textDecoration: 'none', minWidth: 44 }} onClick={() => { clear(); setOpen(false); }}>Close</button></div>
      <span className="pctx">{chip}</span>
      {!a && !asking && (
        <>
          {answerSource.suggestions(ctx).map((x) => <button key={x.id} className="pchip" onClick={() => ask({ id: x.id }, x.q)}>{x.q}<span aria-hidden="true">›</span></button>)}
          <form className="pinput" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) ask({ text: typed }, typed.trim()); }}>
            <label className="pasked" htmlFor="pq" style={{ position: 'absolute', left: -9999 }}>Or type a question</label>
            <input id="pq" type="text" placeholder="Or type a question" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <button type="submit">Ask</button>
          </form>
          <p className="pai">Don’t type personal information. Nothing you ask is saved.</p>
        </>
      )}
      {asking && <><p className="pasked">You asked: “{asking}”</p><p className="pthink" role="status">Checking TechCentral’s guide…</p></>}
      {a && (
        <div className="fadeup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="pasked">You asked: “{a.q}”</p>
          {a.kind === 'safety' ? (
            <div className="psafety" role="alert"><b>{ASSIST.safety}</b><span style={{ fontSize: 14 }}>Staff are at the TechCentral desk.</span><span className="pai" style={{ color: 'inherit' }}>{ASSIST.safetyFoot}</span></div>
          ) : (
            <>
              {a.kind !== 'answer' && <span className="prhead">{ASSIST.heads[a.kind]}</span>}
              <p role="status"><T s={a.text} /></p>
              {a.kind === 'answer' && a.based && onJump && <button className="pbased" onClick={() => { onJump(a); clear(); setOpen(false); }}>Based on: {a.based}</button>}
              <p className="pai">{a.kind === 'answer' ? <>AI answer · from TechCentral’s guide · checked <T s={ASSIST.checkedDate} /></> : ASSIST.foots[a.kind]}</p>
            </>
          )}
          <button className="plink" onClick={clear}>Ask another question</button>
        </div>
      )}
    </section>
  );
}
