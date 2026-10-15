import { useEffect } from 'react';
import { FIX, FIXES, PLANS, TC_BASE, THREED, pathOf, type FixId, type PlanId } from './content';

/** Prototype index: every page this build serves, and the flags. Not part of the kiosk. */
export default function Links() {
  useEffect(() => { document.title = 'Prototype index · TechCentral kiosk'; }, []);
  const L = ({ href, children, note }: { href: string; children: React.ReactNode; note?: string }) => (
    <li><a href={href}>{children}</a>{note && <span style={{ color: '#505A69' }}> — {note}</span>}</li>
  );
  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif", color: '#002A5C', background: '#FBFAF6', minHeight: '100vh', padding: '32px 20px', lineHeight: 1.6 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#0057B7', margin: 0 }}>Clickable prototype · no backend</p>
        <h1 style={{ margin: '4px 0 8px', fontSize: 34, lineHeight: 1.1 }}>TechCentral guide kiosk</h1>
        <p style={{ margin: '0 0 20px', color: '#505A69' }}>
          Facts marked with a <span style={{ textDecoration: 'underline dotted #B39A00', textDecorationThickness: 2, textUnderlineOffset: '.18em' }}>dotted underline</span> are made-up sample values standing in for unverified <code>[[placeholders]]</code>. Hover one to see what staff need to confirm. Add <code>?ph=tags</code> to any page to show them as <code>[PLACEHOLDER: …]</code> tags instead.
        </p>

        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Kiosk</h2>
        <ul>
          <L href={TC_BASE} note="portrait 1080 × 1920, centered in any window">Kiosk</L>
          <L href={TC_BASE + "/?orient=auto"} note="follows the window’s shape">Auto orientation</L>
          <L href={TC_BASE + "/?orient=landscape"}>Landscape 1920 × 1080</L>
          <L href={TC_BASE + "/?printer=0"} note="hides “Print it” on the takeaway screen">No-printer mode</L>
          <L href={TC_BASE + "/?ph=tags"} note="the design's placeholder tags">Placeholders as tags</L>
          <L href={TC_BASE + "/?idle=10&countdown=8"} note="idle after 10 s, 8 s countdown">Fast idle timeout (demo)</L>
          <L href={TC_BASE + "/?timers=off"} note="no idle timeout while reviewing">Timers off</L>
          <L href={TC_BASE + "/?orient=portrait&fit=0"} note="true pixel size, scrolls">Native resolution</L>
        </ul>

        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Phone pages (what the QR codes open)</h2>
        <ul>
          {(Object.keys(PLANS) as PlanId[]).map((k) => <L key={k} href={pathOf(PLANS[k].url)} note={PLANS[k].chip}>{PLANS[k].url}</L>)}
          <L href={pathOf(THREED.refUrl)} note="Plan B, one step at a time at the printer">{THREED.refUrl}</L>
          <L href={pathOf(FIXES.allFixesUrl)} note="all fixes (release-station card)">{FIXES.allFixesUrl}</L>
          {(Object.keys(FIX) as FixId[]).map((k) => <L key={k} href={pathOf(FIX[k].url)} note={FIX[k].label}>{FIX[k].url}</L>)}
        </ul>

        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Print</h2>
        <ul>
          <L href={TC_BASE + "/print/slip?plan=usb"} note="Letter; pick any plan or fix from the toolbar">Printed plan slip</L>
          <L href={TC_BASE + "/print/card"} note="5.5 × 8.5 in">Release-station card</L>
        </ul>

        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Try these in the kiosk</h2>
        <ul>
          <li>Home → Print something → On a USB drive → Ask about this plan → “How much will this cost?” → Based on… → Take this with you</li>
          <li>Print something → My print didn’t come out → pick a fix</li>
          <li>Home → 3D print something → Let’s start → Run it yourself → step 4 → “Strange smell, smoke, or noise” (fixed safety message)</li>
          <li>Ask → Type a question instead → type “it smells like smoke” (safety), “can I renew books” (off-topic), “print on vinyl” (not in guide)</li>
          <li>Accessibility → Larger text, High contrast, Read aloud</li>
          <li>Leave it alone for 50 s → “Still there?” → full reset</li>
        </ul>
      </div>
    </div>
  );
}
