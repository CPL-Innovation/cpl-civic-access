/**
 * Deployment flags. Edit DEFAULTS for the real device; any of them can be
 * overridden in the URL for testing, e.g. /?orient=landscape&printer=0&ph=tags
 */
const DEFAULTS = {
  /** Does this kiosk have a slip printer? false hides “Print it” on the takeaway screen. */
  hasPrinter: true,
  /** Portrait by default; a wide browser shows the portrait kiosk centered. 'auto' follows the screen's shape. */
  orientation: 'portrait' as 'auto' | 'portrait' | 'landscape',
  /** How unverified [[...]] facts render: 'mock' = sample value, lightly marked; 'tags' = [PLACEHOLDER: …]; 'clean' = sample value, unmarked. */
  placeholders: 'mock' as 'mock' | 'tags' | 'clean',
  idleSeconds: 50,
  countdownSeconds: 15,
};

const q = new URLSearchParams(window.location.search);
const pick = <T extends string>(v: string | null, ok: readonly T[], d: T): T => (v && (ok as readonly string[]).includes(v) ? (v as T) : d);

export const config = {
  hasPrinter: q.has('printer') ? q.get('printer') !== '0' : DEFAULTS.hasPrinter,
  orientation: pick(q.get('orient'), ['auto', 'portrait', 'landscape'] as const, DEFAULTS.orientation),
  placeholders: pick(q.get('ph'), ['mock', 'tags', 'clean'] as const, DEFAULTS.placeholders),
  idleMs: (Number(q.get('idle')) || DEFAULTS.idleSeconds) * 1000,
  countdown: Number(q.get('countdown')) || DEFAULTS.countdownSeconds,
  /** ?timers=off stops the idle timeout (handy while reviewing). */
  timers: q.get('timers') !== 'off',
  /** ?fit=0 renders at native 1080×1920 / 1920×1080 instead of scaling to the window. */
  fit: q.get('fit') !== '0',
};

/** Keep flags when linking between prototype pages. */
export const keepFlags = (path: string) => {
  const keep = new URLSearchParams();
  for (const k of ['ph']) { const v = q.get(k); if (v) keep.set(k, v); }
  const s = keep.toString();
  return s ? path + (path.includes('?') ? '&' : '?') + s : path;
};
