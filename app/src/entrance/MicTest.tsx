import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/Icon';

/**
 * Field test for a kiosk's microphone (?mictest=1 or ?voicedebug=1): record a few
 * seconds, then play it back, with the device details Chrome reports. It runs on
 * its own — never during speech recognition, which on Android needs the mic to itself.
 * Nothing leaves the device; the recording is dropped when the panel goes away.
 */
const SECONDS = 5;

export function MicTest() {
  const [state, setState] = useState<'idle' | 'recording' | 'ready' | 'error'>('idle');
  const [left, setLeft] = useState(SECONDS);
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const level = useRef<HTMLSpanElement>(null);
  const live = useRef<{ stream: MediaStream; rec: MediaRecorder; ctx: AudioContext; raf: number; timer: number } | null>(null);

  const cleanup = () => {
    const l = live.current;
    if (!l) return;
    cancelAnimationFrame(l.raf);
    clearInterval(l.timer);
    l.stream.getTracks().forEach((t) => t.stop());
    l.ctx.close().catch(() => {});
    live.current = null;
  };
  useEffect(() => () => { cleanup(); if (url) URL.revokeObjectURL(url); }, [url]);

  const record = async () => {
    setErr(''); setInfo([]);
    if (url) { URL.revokeObjectURL(url); setUrl(''); }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setErr('Couldn’t open the microphone: ' + ((e as Error).name || String(e)) + '. Check Chrome’s microphone permission for this site.');
      setState('error');
      return;
    }
    const track = stream.getAudioTracks()[0];
    const st = track?.getSettings?.() || {};
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
    setInfo([
      'Mic: ' + (track?.label || '(no label)'),
      `Sample rate: ${st.sampleRate ?? '?'} Hz · channels: ${st.channelCount ?? '?'}`,
      `Echo cancel: ${st.echoCancellation ?? '?'} · noise suppr.: ${st.noiseSuppression ?? '?'} · auto gain: ${st.autoGainControl ?? '?'}`,
      'Recording as: ' + (mimeType || 'browser default'),
    ]);

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || chunks[0]?.type || 'audio/webm' });
      setUrl(URL.createObjectURL(blob));
      setInfo((i) => [...i, `Captured: ${(blob.size / 1024).toFixed(1)} KB`]);
      setState(blob.size ? 'ready' : 'error');
      if (!blob.size) setErr('The recording came back empty: the microphone delivered no audio.');
      cleanup();
    };

    // Live level, so you can see the mic responding while you talk.
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let peak = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      peak = Math.max(peak, rms);
      if (level.current) level.current.style.width = Math.round(rms * 100) + '%';
      if (live.current) live.current.raf = requestAnimationFrame(tick);
    };

    setLeft(SECONDS);
    setState('recording');
    rec.start();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        setInfo((i) => [...i, `Peak level: ${Math.round(peak * 100)}%${peak < 0.08 ? ' (very quiet: the mic may be far or muted)' : ''}`]);
        if (rec.state !== 'inactive') rec.stop();
      }
    }, 250);
    live.current = { stream, rec, ctx, raf: requestAnimationFrame(tick), timer };
  };

  return (
    <div className="mictest" role="group" aria-label="Microphone test">
      <span className="hint">Microphone test (for setup, not shown to patrons)</span>
      <div className="mictest-row">
        <button className="btn btn-s" onClick={record} disabled={state === 'recording'}>
          <Icon n="mic" />{state === 'recording' ? `Recording… ${left}s` : state === 'ready' ? 'Record again' : `Record ${SECONDS} seconds`}
        </button>
        <span className="mictest-meter" aria-hidden="true"><span ref={level} /></span>
      </div>
      {url && <audio className="mictest-audio" controls src={url} autoPlay />}
      {err && <p className="mictest-err" role="alert">{err}</p>}
      {info.length > 0 && <pre className="voice-debug">{info.join('\n')}</pre>}
    </div>
  );
}
