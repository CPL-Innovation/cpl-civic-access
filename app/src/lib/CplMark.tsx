import raw from '../../CPL_TheCenter_icon.svg?raw';

/** The CPL mark, read from the source SVG and drawn in currentColor. */
const POINTS = [...raw.matchAll(/points="([^"]+)"/g)].map((m) => m[1]);

export function CplMark({ className, style, title }: { className?: string; style?: React.CSSProperties; title?: string }) {
  return (
    <svg viewBox="0 0 180 180" className={className} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {POINTS.map((p, i) => <polygon key={i} points={p} fill="currentColor" />)}
    </svg>
  );
}
