import { useEffect } from 'react';
import { TC_BASE } from './content';

/** Prototype index: every surface this build serves, and the demo flags. Not part of any kiosk. */
export default function Index() {
  useEffect(() => { document.title = 'Prototype index · Cleveland Civic Access'; }, []);
  const L = ({ href, children, note }: { href: string; children: React.ReactNode; note?: string }) => (
    <li><a href={href}>{children}</a>{note && <span style={{ color: '#505A69' }}> — {note}</span>}</li>
  );
  const h2 = { fontSize: 20, marginBottom: 4 } as const;
  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif", color: '#002A5C', background: '#FBFAF6', minHeight: '100vh', padding: '32px 20px', lineHeight: 1.6 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#0057B7', margin: 0 }}>Prototype · Cleveland Civic Access</p>
        <h1 style={{ margin: '4px 0 8px', fontSize: 34, lineHeight: 1.1 }}>Everything this build serves</h1>
        <p style={{ margin: '0 0 20px', color: '#505A69' }}>Facts are unverified. The entrance kiosk shows every fact as a <code>[PLACEHOLDER: …]</code> tag.</p>

        <h2 style={h2}>Main Library entrance kiosk (▶ current target, Cut 1)</h2>
        <ul>
          <L href="/libraryentrance" note="the default home; Ask is answered live from /staff">Entrance kiosk</L>
          <L href="/libraryentrance?ask=scripted" note="canned replies at a person’s pace — for sign-off demos with nobody at the console">Scripted assistant</L>
          <L href="/libraryentrance?ask=scripted&noreply=1&replyTimeout=15" note="no reply comes; after 15 s the panel points to staff">Reply timeout</L>
          <L href="/libraryentrance?ask=scripted&hours=off" note="Ask hidden, guide only">Off-hours</L>
          <L href="/libraryentrance?ask=scripted&cards=chat" note="place cards open the chat with their question, as if the console setting were on">Cards start a chat (demo)</L>
          <L href="/libraryentrance?ask=scripted&voice=demo" note="tap the mic in Ask: a simulated dictation, no microphone needed">Voice input (demo)</L>
          <L href="/libraryentrance?orient=landscape">Landscape</L>
          <L href="/libraryentrance?timers=off" note="no idle reset while reviewing">Timers off</L>
        </ul>

        <h2 style={h2}>Library assistant console</h2>
        <ul>
          <L href="/staff" note="open, no sign-in (set STAFF_PASSCODE on the relay to require one)">Console (/staff)</L>
          <L href="/mictest" note="record five seconds and play it back: checks a kiosk's microphone">Microphone test (/mictest)</L>
        </ul>

        <h2 style={h2}>TechCentral prototype (📌 pinned, unchanged)</h2>
        <ul>
          <L href={TC_BASE + '?ph=tags'} note="demo with placeholder tags on">TechCentral kiosk</L>
          <L href={TC_BASE + '/links'} note="its own index: phone pages, slip, card, flags">TechCentral index</L>
        </ul>

        <h2 style={h2}>Try the live assistant</h2>
        <ol>
          <li>Open <a href="/staff">/staff</a> in one window and switch <b>Ask on the kiosk</b> on.</li>
          <li>Open <a href="/libraryentrance">/libraryentrance</a> in another, tap to start, then <b>Ask a library assistant</b>.</li>
          <li>Tap a question. It appears in the console; answer it and tag the source. The reply lands on the kiosk.</li>
          <li>Try typing “are you a bot” (send the locked answer) or anything with “fire” (the kiosk shows the emergency message instantly).</li>
        </ol>
      </div>
    </div>
  );
}
