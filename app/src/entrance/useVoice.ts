import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input for the Ask panel: live dictation with the browser's speech
 * recognition (Web Speech API), plus a microphone level for the bars.
 *
 * Privacy note: in Chrome, recognition is done by Google's speech service, so
 * the audio leaves the device. Nothing is stored here; the transcript only
 * goes into the message field, unsent.
 */

type SR = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
const RealSR: (new () => SR) | undefined =
  typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    || (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition) : undefined;

/**
 * ?voice=demo plays a scripted dictation through the same view: for demos on
 * machines without a microphone, and for testing. ?voice=off hides the mic.
 */
const VOICE_FLAG = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('voice') : null;
class DemoSR implements SR {
  lang = 'en-US'; interimResults = true; continuous = false; maxAlternatives = 1;
  onresult: SR['onresult'] = null; onerror: SR['onerror'] = null; onend: SR['onend'] = null; onspeechstart: SR['onspeechstart'] = null;
  private timers: number[] = [];
  start() {
    const words = 'Where can I print something today'.split(' ');
    const at = (ms: number, f: () => void) => this.timers.push(window.setTimeout(f, ms));
    at(700, () => this.onspeechstart?.());
    words.forEach((_, i) => at(900 + i * 380, () => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: words.slice(0, i + 1).join(' ').toLowerCase() } }] })));
    at(900 + words.length * 380 + 500, () => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: words.join(' ').toLowerCase() } }] }); this.end(); });
  }
  private end() { this.timers.forEach(clearTimeout); this.timers = []; this.onend?.(); }
  stop() { this.end(); }
  abort() { this.timers.forEach(clearTimeout); this.timers = []; this.onend?.(); }
}
const SRCtor: (new () => SR) | undefined = VOICE_FLAG === 'off' ? undefined : VOICE_FLAG === 'demo' ? DemoSR : RealSR;

export const voiceSupported = !!SRCtor;

/** idle → listening → review (show what was heard: Retry or Send it) · error */
export type VoiceState = 'idle' | 'listening' | 'review' | 'error';

const ERRORS: Record<string, string> = {
  'no-speech': 'I didn’t catch that. Try again, or type your question.',
  'audio-capture': 'The microphone isn’t working. You can type your question instead.',
  'not-allowed': 'The microphone isn’t available on this screen. You can type your question instead.',
  'service-not-allowed': 'Voice isn’t available on this screen. You can type your question instead.',
  network: 'Voice needs a network connection right now. You can type your question instead.',
};

export function useVoice() {
  const [state, setState] = useState<VoiceState>('idle');
  const [finalText, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [heard, setHeard] = useState(false);
  const [hasLevel, setHasLevel] = useState(false);
  const rec = useRef<SR | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const cancelled = useRef(false);
  const errored = useRef(false);
  const barsRef = useRef<HTMLDivElement | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);

  const stopLevel = () => {
    const a = audio.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close().catch(() => {});
    audio.current = null;
    setHasLevel(false);
    barsRef.current?.style.setProperty('--lvl', '0');
  };

  /** Microphone level → --lvl on the bars (no re-render). Optional: the bars idle-animate without it. */
  const startLevel = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled.current || !rec.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let smooth = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
        smooth = smooth * 0.7 + rms * 0.3;
        barsRef.current?.style.setProperty('--lvl', smooth.toFixed(3));
        audio.current!.raf = requestAnimationFrame(tick);
      };
      audio.current = { ctx, stream, raf: requestAnimationFrame(tick) };
      setHasLevel(true);
    } catch { /* no level meter; recognition may still work */ }
  };

  const start = useCallback(() => {
    if (!SRCtor) return;
    rec.current?.abort();
    cancelled.current = false; errored.current = false;
    finalRef.current = ''; interimRef.current = '';
    setFinal(''); setInterim(''); setError(''); setHeard(false);
    const r = new SRCtor();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = false; // ends on a natural pause, like a phone's voice input
    r.maxAlternatives = 1;
    r.onspeechstart = () => setHeard(true);
    r.onresult = (e) => {
      let fin = '', mid = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript; else mid += res[0].transcript;
      }
      finalRef.current = fin; interimRef.current = mid;
      setFinal(fin); setInterim(mid); setHeard(true);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      errored.current = true;
      setError(ERRORS[e.error] || 'Voice didn’t work this time. You can type your question instead.');
      setState('error');
      stopLevel();
    };
    r.onend = () => {
      stopLevel();
      rec.current = null;
      if (cancelled.current || errored.current) return;
      const text = finalRef.current.trim();
      if (text) {
        // Stay in the view and show what was heard; the patron chooses Retry or Send it.
        setFinal(text.charAt(0).toUpperCase() + text.slice(1));
        setInterim('');
        setState('review');
      } else {
        setError(ERRORS['no-speech']);
        setState('error');
      }
    };
    rec.current = r;
    setState('listening');
    try { r.start(); } catch { setState('error'); setError(ERRORS['service-not-allowed']); return; }
    if (VOICE_FLAG !== 'demo') startLevel(); // the demo never opens the microphone
  }, []);

  /** Done: stop listening and keep what was heard (onend hands it over). */
  const finish = useCallback(() => {
    if (rec.current) {
      // Keep interim words too: someone who taps Done mid-sentence meant what they said.
      if (interimRef.current) finalRef.current = (finalRef.current + ' ' + interimRef.current).trim();
      interimRef.current = '';
      rec.current.stop();
    }
  }, []);

  /** Cancel: discard everything. */
  const cancel = useCallback(() => {
    cancelled.current = true;
    rec.current?.abort();
    rec.current = null;
    stopLevel();
    setState('idle'); setFinal(''); setInterim(''); setError('');
  }, []);

  /** Leave review (after Send it): back to idle, transcript cleared. */
  const clear = useCallback(() => { setState('idle'); setFinal(''); setInterim(''); setError(''); }, []);

  useEffect(() => () => { cancelled.current = true; rec.current?.abort(); stopLevel(); }, []);

  return { state, finalText, interim, error, heard, hasLevel, start, finish, cancel, clear, barsRef };
}
