// Renders the app icons (CPL mark in butter on navy) from CPL_TheCenter_icon.svg.
// No dependencies: polygon fill with 4×4 supersampling, PNG via zlib.  Run: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const svg = fs.readFileSync(new URL('../CPL_TheCenter_icon.svg', import.meta.url), 'utf8');
const polys = [...svg.matchAll(/points="([^"]+)"/g)].map((m) => {
  const n = m[1].trim().split(/[\s,]+/).map(Number);
  const pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
});
const NAVY = [0x00, 0x57, 0xb7], BUTTER = [0xe9, 0xe1, 0x86];

function inside(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function render(size, markFrac) {
  const S = 4, m = size * markFrac, off = (size - m) / 2, k = 180 / m;
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S - off) * k, v = (y + (sy + 0.5) / S - off) * k;
      if (u >= 0 && v >= 0 && u <= 180 && v <= 180 && polys.some((p) => inside(u, v, p))) hit++;
    }
    const a = hit / (S * S), o = (y * size + x) * 3;
    for (let c = 0; c < 3; c++) px[o + c] = Math.round(NAVY[c] * (1 - a) + BUTTER[c] * a);
  }
  return png(size, px);
}

function png(size, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The mark stays inside the 80% maskable safe zone.
for (const [name, size, frac] of [['icon-512.png', 512, 0.58], ['icon-192.png', 192, 0.58], ['apple-touch-icon.png', 180, 0.62]]) {
  fs.writeFileSync(new URL('../public/' + name, import.meta.url), render(size, frac));
  console.log('wrote public/' + name);
}
