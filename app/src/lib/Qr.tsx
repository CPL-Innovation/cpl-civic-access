import QRCode from 'qrcode';
import { useMemo } from 'react';

/** A real QR code for this build's phone page. The printed short URL is still a placeholder. */
export function Qr({ path, label, className, style }: { path: string; label: string; className?: string; style?: React.CSSProperties }) {
  const d = useMemo(() => {
    const qr = QRCode.create(window.location.origin + path, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let p = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) p += `M${x} ${y}h1v1h-1z`;
    return { n, p };
  }, [path]);
  return (
    <div className={className} style={style}>
      <svg viewBox={`-1 -1 ${d.n + 2} ${d.n + 2}`} role="img" aria-label={label} style={{ width: '100%', height: '100%', display: 'block' }} shapeRendering="crispEdges">
        <rect x={-1} y={-1} width={d.n + 2} height={d.n + 2} fill="#FFFFFF" />
        <path d={d.p} fill="#000000" />
      </svg>
    </div>
  );
}
