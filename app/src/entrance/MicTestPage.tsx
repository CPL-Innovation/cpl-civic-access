import { useEffect } from 'react';
import { MicTest } from './MicTest';
import '../kiosk/kiosk.css';
import './entrance.css';

/** /mictest — a setup page for checking a kiosk's microphone. Not linked from anything patrons see. */
export default function MicTestPage() {
  useEffect(() => { document.title = 'Microphone test · Main Library kiosk'; }, []);
  return (
    <div className="kiosk portrait mictest-page" data-mode="service" style={{ position: 'static', width: '100%', minHeight: '100vh', fontSize: 20 }}>
      <div className="scr" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="info">
          <span className="eyebrow">Kiosk setup</span>
          <h1 className="title">Microphone test</h1>
          <p className="lead">Tap Record, talk for five seconds at the distance a patron would stand, then listen. If it plays back clearly, the microphone works and any voice-input problem is the device’s speech service.</p>
        </div>
        <MicTest />
        <p className="src"><a href="/libraryentrance">Back to the kiosk</a></p>
      </div>
    </div>
  );
}
