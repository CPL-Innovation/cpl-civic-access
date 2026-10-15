import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';

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
  onnomatch?: (() => void) | null;
  onstart?: (() => void) | null; onaudiostart?: (() => void) | null; onsoundstart?: (() => void) | null;
  onspeechend?: (() => void) | null; onsoundend?: (() => void) | null; onaudioend?: (() => void) | null;
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

/**
 * The level meter opens the microphone a second time (getUserMedia). Desktop Chrome shares the mic,
 * but on Android, Chrome hands recognition to the system speech service, which needs the mic to
 * itself: with the meter running it hears nothing. So on Android the bars use their CSS animation
 * instead. ?meter=on|off overrides, for testing other devices.
 */
/**
 * Field diagnostics for devices we can't test here:
 *   ?voicedebug=1   show every recognizer event on screen
 *   ?vlang=en-GB    recognition language (default en-US)
 *   ?interim=0      ask for final results only
 *   ?continuous=1   keep listening across pauses (Done ends it)
 */
const QS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const VOICE_DEBUG = QS.get('voicedebug') === '1';
const V_LANG = QS.get('vlang') || 'en-US';
const V_INTERIM = QS.get('interim') !== '0';
const V_CONTINUOUS = QS.get('continuous') === '1';

/**
 * Server transcription (the relay → OpenAI) is the fallback: used when the relay has it switched on and
 * this device can't rely on its own speech service — Android (which hands recognition to a system service
 * many kiosks don't have), no built-in recognizer at all, or after the built-in one has failed once.
 * ?stt=live|server|browser forces one path, for testing.
 */
const STT_FLAG = QS.get('stt');
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const HAS_RECORDER = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
/** Remembered for this page: after one failure, the built-in recognizer isn't tried again. */
let browserFailed = false;

const METER_FLAG = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('meter') : null;
const USE_METER = METER_FLAG === 'on' ? true : METER_FLAG === 'off' ? false
  : !(typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));

/** idle → listening → (transcribing, server path) → review (Retry or Send it) · error */
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'review' | 'error';

const ERRORS: Record<string, string> = {
  'no-speech': 'I didn’t catch that. Try again, or type your question.',
  'audio-capture': 'The microphone isn’t working. You can type your question instead.',
  'not-allowed': 'The microphone isn’t available on this screen. You can type your question instead.',
  'service-not-allowed': 'Voice isn’t available on this screen. You can type your question instead.',
  network: 'Voice needs a network connection right now. You can type your question instead.',
};

export type VoiceEngine = 'live' | 'server' | 'browser';

export function useVoice(opts: { server: boolean; live?: boolean; session: string | null; engine?: VoiceEngine }) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [state, setState] = useState<VoiceState>('idle');
  const [finalText, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [heard, setHeard] = useState(false);
  const [hasLevel, setHasLevel] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const t0 = useRef(0);
  const log = (msg: string) => { if (VOICE_DEBUG) setDebugLog((l) => [...l.slice(-14), `${((performance.now() - t0.current) / 1000).toFixed(1)}s ${msg}`]); };
  const nomatchSeen = useRef(false);
  const rec = useRef<SR | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const cancelled = useRef(false);
  const errored = useRef(false);
  const barsRef = useRef<HTMLDivElement | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);
  /* Server path: the recording in progress, and the upload. */
  const media = useRef<{ stream: MediaStream; rec: MediaRecorder; ctx: AudioContext; raf: number; chunks: Blob[]; type: string; spoke: boolean } | null>(null);
  const upload = useRef<AbortController | null>(null);
  const [usingServer, setUsingServer] = useState(false);
  /* Live path: PCM capture, the relay session id, chunks waiting to go, and the words stream. */
  const liveRef = useRef<{ stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode; raf: number; id: string; pending: Int16Array[]; sending: boolean; stopped: boolean; spoke: boolean; ac: AbortController; text: string } | null>(null);

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

  const fail = (msg: string) => { errored.current = true; setError(msg); setState('error'); };
  const toReview = (text: string) => {
    const t = text.trim();
    if (!t) { fail(ERRORS['no-speech']); return; }
    setFinal(t.charAt(0).toUpperCase() + t.slice(1));
    setInterim('');
    setState('review');
  };

  const stopMedia = () => {
    const m = media.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    setHasLevel(false);
    barsRef.current?.style.setProperty('--lvl', '0');
  };

  /** Server path: record → stop on a pause after speech (or Done) → upload → words stream back. */
  const startServer = async () => {
    log('server path: recording');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { fail(ERRORS['not-allowed']); return; }
    if (cancelled.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const m = { stream, rec, ctx, raf: 0, chunks: [] as Blob[], type: mimeType || 'audio/webm', spoke: false };
    media.current = m;
    rec.ondataavailable = (e) => { if (e.data.size) m.chunks.push(e.data); };
    rec.onstop = () => { stopMedia(); if (!cancelled.current) send(m); };
    const started = performance.now();
    let lastLoud = 0, smooth = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      smooth = smooth * 0.7 + rms * 0.3;
      barsRef.current?.style.setProperty('--lvl', smooth.toFixed(3));
      const now = performance.now();
      if (rms > 0.09) { lastLoud = now; if (!m.spoke) { m.spoke = true; setHeard(true); log('speech detected'); } }
      // Stop after ~1.3 s of quiet following speech, 8 s with no speech at all, or 20 s total.
      if ((m.spoke && now - lastLoud > 1300) || (!m.spoke && now - started > 8000) || now - started > 20000) {
        if (rec.state !== 'inactive') rec.stop();
        return;
      }
      m.raf = requestAnimationFrame(tick);
    };
    rec.start(250);
    setHasLevel(true);
    m.raf = requestAnimationFrame(tick);
  };

  /**
   * Live path (OpenAI Realtime through the relay): 24 kHz PCM16 goes up in ~100 ms chunks while the patron
   * speaks, and words come back on the same stream as they're recognized. The relay commits the audio when
   * we detect the pause; the final transcript then goes to review. If the relay can't open a live session,
   * this falls back to recording and transcribing after (startServer).
   */
  const startLive = async () => {
    log('live path: streaming');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch { fail(ERRORS['not-allowed']); return; }
    if (cancelled.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    // Chrome resamples the mic to the context's rate, so asking for 24 kHz gives the format the API wants.
    let ctx: AudioContext;
    try { ctx = new AudioContext({ sampleRate: 24000 }); } catch { ctx = new AudioContext(); }
    ctx.resume().catch(() => {});
    const rate = ctx.sampleRate;
    log(`mic open · ${rate} Hz · ${ctx.state}`);
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const node = ctx.createScriptProcessor(2048, 1, 1);
    src.connect(node);
    node.connect(ctx.destination); // needed for onaudioprocess to fire; the output stays silent
    const ac = new AbortController();
    const l = { stream, ctx, node, raf: 0, id: '', pending: [] as Int16Array[], sending: false, stopped: false, spoke: false, ac, text: '' };
    liveRef.current = l;

    node.onaudioprocess = (e) => {
      if (l.stopped) return;
      const f = e.inputBuffer.getChannelData(0);
      // Resample (only if the browser ignored 24 kHz) and convert to 16-bit.
      const ratio = rate / 24000;
      const n = Math.floor(f.length / ratio);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, f[Math.floor(i * ratio)])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      e.outputBuffer.getChannelData(0).fill(0);
      l.pending.push(out);
      pump(l);
    };

    const buf = new Uint8Array(an.fftSize);
    const started = performance.now();
    let lastLoud = 0, smooth = 0;
    const tick = () => {
      if (l.stopped) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      smooth = smooth * 0.7 + rms * 0.3;
      barsRef.current?.style.setProperty('--lvl', smooth.toFixed(3));
      const now = performance.now();
      if (rms > 0.09) { lastLoud = now; if (!l.spoke) { l.spoke = true; setHeard(true); log('speech detected'); } }
      if ((l.spoke && now - lastLoud > 1300) || (!l.spoke && now - started > 8000) || now - started > 20000) { endLive(l); return; }
      l.raf = requestAnimationFrame(tick);
    };
    setHasLevel(true);
    l.raf = requestAnimationFrame(tick);

    // Open the session; the first line is its id, then {delta} lines, then {done} or {error}.
    try {
      const session = optsRef.current.session || '';
      const r = await fetch(API + '/api/live/start?session=' + encodeURIComponent(session), { method: 'POST', signal: ac.signal });
      if (!r.ok || !r.body) {
        log('live start http ' + r.status + ' · falling back');
        stopLive(l); liveRef.current = null;
        if (!cancelled.current) startServer();
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let rest = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = rest.indexOf('\n')) >= 0) {
          const line = rest.slice(0, nl).trim();
          rest = rest.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { id?: string; delta?: string; done?: string; error?: string };
          if (ev.id) { l.id = ev.id; log('live session open'); pump(l); }
          if (ev.delta) { l.text += ev.delta; log('delta "' + ev.delta + '"'); const t = l.text.trimStart(); setFinal(t.charAt(0).toUpperCase() + t.slice(1)); }
          if (typeof ev.done === 'string') { l.text = ev.done || l.text; log('done "' + l.text + '"'); }
          if (ev.error) {
            log('live error · ' + ev.error);
            stopLive(l); liveRef.current = null;
            if (!cancelled.current) fail('Voice didn’t work this time. You can type your question instead.');
            return;
          }
        }
      }
      stopLive(l); liveRef.current = null;
      if (cancelled.current) return;
      if (!l.spoke && !l.text.trim()) { fail(ERRORS['no-speech']); return; }
      toReview(l.text);
    } catch (e) {
      stopLive(l); liveRef.current = null;
      if ((e as Error).name === 'AbortError' || cancelled.current) return;
      log('live failed · ' + String(e));
      fail(ERRORS.network);
    }
  };

  /** Send waiting audio, one request at a time so chunks arrive in order. */
  const pump = async (l: NonNullable<typeof liveRef.current>) => {
    if (l.sending || !l.id) return;
    l.sending = true;
    try {
      while (l.pending.length) {
        const parts = l.pending.splice(0);
        const total = parts.reduce((a, p) => a + p.length, 0);
        const all = new Int16Array(total);
        let o = 0;
        for (const p of parts) { all.set(p, o); o += p.length; }
        await fetch(API + '/api/live/audio?id=' + l.id, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: all.buffer, signal: l.ac.signal });
      }
      if (l.stopped && !cancelled.current) {
        await fetch(API + '/api/live/commit?id=' + l.id, { method: 'POST', signal: l.ac.signal });
        log('committed');
      }
    } catch { /* the words stream reports failures */ }
    l.sending = false;
  };

  /** The pause after speech (or Done): stop the mic, send what's left, and ask for the final words. */
  const endLive = (l: NonNullable<typeof liveRef.current>) => {
    if (l.stopped) return;
    stopLive(l);
    if (!l.spoke && !l.text) { l.ac.abort(); if (l.id) fetch(API + '/api/live/cancel?id=' + l.id, { method: 'POST' }).catch(() => {}); liveRef.current = null; fail(ERRORS['no-speech']); return; }
    setState('transcribing');
    pump(l);
  };

  /** Release the microphone and audio graph (idempotent). */
  const stopLive = (l: NonNullable<typeof liveRef.current>) => {
    l.stopped = true;
    cancelAnimationFrame(l.raf);
    l.node.onaudioprocess = null;
    try { l.node.disconnect(); } catch { /* already */ }
    l.stream.getTracks().forEach((t) => t.stop());
    l.ctx.close().catch(() => {});
    setHasLevel(false);
    barsRef.current?.style.setProperty('--lvl', '0');
  };

  /** Upload the recording; words come back as NDJSON lines ({delta} … {done}). */
  const send = async (m: { chunks: Blob[]; type: string; spoke: boolean }) => {
    media.current = null;
    const blob = new Blob(m.chunks, { type: m.type });
    log(`recorded ${(blob.size / 1024).toFixed(1)} KB · spoke=${m.spoke}`);
    if (!m.spoke || blob.size < 2000) { fail(ERRORS['no-speech']); return; }
    setState('transcribing');
    finalRef.current = '';
    const ac = new AbortController();
    upload.current = ac;
    try {
      const session = optsRef.current.session || '';
      const r = await fetch(API + '/api/transcribe?session=' + encodeURIComponent(session), { method: 'POST', headers: { 'content-type': m.type }, body: blob, signal: ac.signal });
      if (!r.ok || !r.body) { log('transcribe http ' + r.status); fail('Voice didn’t work this time. You can type your question instead.'); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let rest = '', text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = rest.indexOf('\n')) >= 0) {
          const line = rest.slice(0, nl).trim();
          rest = rest.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { delta?: string; done?: string; error?: string };
          if (ev.error) { log('transcribe error · ' + ev.error); fail('Voice didn’t work this time. You can type your question instead.'); return; }
          if (ev.delta) { text += ev.delta; setFinal(text); }
          if (typeof ev.done === 'string') text = ev.done;
        }
      }
      if (cancelled.current) return;
      log(`transcript "${text}"`);
      toReview(text);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      log('transcribe failed · ' + String(e));
      fail(ERRORS.network);
    } finally {
      upload.current = null;
    }
  };

  const start = useCallback(() => {
    const server = optsRef.current.server && HAS_RECORDER && VOICE_FLAG !== 'demo';
    // The console's "Voice transcription" setting: OpenAI live (default), OpenAI after speaking, or built-in with OpenAI as the fallback.
    const engine = optsRef.current.engine || 'live';
    const useLive = STT_FLAG === 'live' ? HAS_RECORDER : STT_FLAG ? false
      : server && engine === 'live' && !!optsRef.current.live;
    const useServer = useLive || (STT_FLAG === 'server' ? HAS_RECORDER : STT_FLAG ? false
      : server && (engine !== 'browser' || IS_ANDROID || !SRCtor || browserFailed));
    setUsingServer(useServer);
    if (useServer) {
      rec.current?.abort(); rec.current = null;
      cancelled.current = false; errored.current = false;
      finalRef.current = ''; interimRef.current = '';
      setFinal(''); setInterim(''); setError(''); setHeard(false);
      t0.current = performance.now();
      setDebugLog([]);
      setState('listening');
      if (useLive) startLive(); else startServer();
      return;
    }
    startBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startBrowser = () => {
    if (!SRCtor) return;
    rec.current?.abort();
    cancelled.current = false; errored.current = false;
    finalRef.current = ''; interimRef.current = '';
    setFinal(''); setInterim(''); setError(''); setHeard(false);
    nomatchSeen.current = false;
    t0.current = performance.now();
    setDebugLog([]);
    const r = new SRCtor();
    r.lang = V_LANG;
    r.interimResults = V_INTERIM;
    r.continuous = V_CONTINUOUS; // default: ends on a natural pause, like a phone's voice input
    r.maxAlternatives = 1;
    log(`start · lang=${V_LANG} interim=${V_INTERIM} continuous=${V_CONTINUOUS} meter=${USE_METER && VOICE_FLAG !== 'demo'}`);
    r.onstart = () => log('onstart');
    r.onaudiostart = () => log('audiostart');
    r.onsoundstart = () => log('soundstart');
    r.onspeechstart = () => { log('speechstart'); setHeard(true); };
    r.onspeechend = () => log('speechend');
    r.onsoundend = () => log('soundend');
    r.onaudioend = () => log('audioend');
    // Android can report "no match" for a stretch and then keep going: note it, decide at the end.
    r.onnomatch = () => { log('nomatch'); nomatchSeen.current = true; };
    r.onresult = (e) => {
      let fin = '', mid = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript; else mid += res[0].transcript;
      }
      finalRef.current = fin; interimRef.current = mid;
      log(`result · final="${fin}" interim="${mid}"`);
      setFinal(fin); setInterim(mid); setHeard(true);
    };
    r.onerror = (e) => {
      log('error · ' + e.error);
      if (e.error === 'aborted') return;
      if (e.error !== 'not-allowed' && e.error !== 'audio-capture') browserFailed = true;
      errored.current = true;
      setError(ERRORS[e.error] || 'Voice didn’t work this time. You can type your question instead.');
      setState('error');
      stopLevel();
    };
    r.onend = () => {
      log('end');
      stopLevel();
      rec.current = null;
      if (cancelled.current || errored.current) return;
      // Some Android builds end without ever marking a result final: keep the last interim words.
      const text = (finalRef.current || interimRef.current).trim();
      if (text) {
        // Stay in the view and show what was heard; the patron chooses Retry or Send it.
        setFinal(text.charAt(0).toUpperCase() + text.slice(1));
        setInterim('');
        setState('review');
      } else {
        browserFailed = true; // Retry will use server transcription, if the relay offers it
        setError(nomatchSeen.current ? 'I heard you but couldn’t make out the words. Try again a little closer, or type your question.' : ERRORS['no-speech']);
        setState('error');
      }
    };
    rec.current = r;
    setState('listening');
    try { r.start(); } catch { setState('error'); setError(ERRORS['service-not-allowed']); return; }
    if (VOICE_FLAG !== 'demo' && USE_METER) startLevel(); // the demo never opens the microphone; Android leaves it to the recognizer
  };

  /** Done: stop listening and keep what was heard (onend hands it over). */
  const finish = useCallback(() => {
    if (liveRef.current) { endLive(liveRef.current); return; }
    const m = media.current;
    if (m) { if (m.rec.state !== 'inactive') m.rec.stop(); return; }
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
    if (media.current) { if (media.current.rec.state !== 'inactive') media.current.rec.stop(); stopMedia(); media.current = null; }
    upload.current?.abort();
    const l = liveRef.current;
    if (l) { stopLive(l); l.ac.abort(); if (l.id) fetch(API + '/api/live/cancel?id=' + l.id, { method: 'POST' }).catch(() => {}); liveRef.current = null; }
    setState('idle'); setFinal(''); setInterim(''); setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Leave review (after Send it): back to idle, transcript cleared. */
  const clear = useCallback(() => { setState('idle'); setFinal(''); setInterim(''); setError(''); }, []);

  useEffect(() => () => {
    cancelled.current = true; rec.current?.abort(); stopLevel(); stopMedia(); upload.current?.abort();
    const l = liveRef.current;
    if (l) { stopLive(l); l.ac.abort(); if (l.id) navigator.sendBeacon?.(API + '/api/live/cancel?id=' + l.id); }
  }, []);

  /** The mic button shows if this device has a built-in recognizer, or can record for the server path. */
  const available = !!SRCtor || (opts.server && HAS_RECORDER);
  return { state, finalText, interim, error, heard, hasLevel, debugLog, usingServer, available, start, finish, cancel, clear, barsRef };
}
