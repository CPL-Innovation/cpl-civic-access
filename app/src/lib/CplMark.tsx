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

/** A sparse, half-drop repeat of the mark for backgrounds. */
export function CplPattern({ tile = 260, size = 72, className }: { tile?: number; size?: number; className?: string }) {
  const s = size / 180;
  const a = (tile / 2 - size) / 2;
  const b = a + tile / 2;
  return (
    <svg className={className} aria-hidden="true" width="100%" height="100%">
      <defs>
        <pattern id="cpl-pattern" width={tile} height={tile} patternUnits="userSpaceOnUse">
          {[[a, a], [b, b]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              {POINTS.map((p, j) => <polygon key={j} points={p} fill="currentColor" />)}
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cpl-pattern)" />
    </svg>
  );
}
