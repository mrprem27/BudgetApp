// Pure-Node PNG generator for the BudgetSplit icon.
// Renders a donut "budget split" mark in the app palette, supersampled for AA.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');

// ---- palette ----
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const AMBER = hex('#F0A500');
const GREEN = hex('#3ECF8E');
const PURPLE = hex('#7C6AF7');
const RED = hex('#F06060');
const BG_TOP = hex('#1A1A22');
const BG_BOT = hex('#0C0C10');

// segments: [fraction, color]
const SEGMENTS = [
  [0.38, AMBER],
  [0.28, GREEN],
  [0.19, PURPLE],
  [0.15, RED],
];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Render at supersample SS, return Float RGBA buffer at final size.
function render({ size, transparent, ringScale }) {
  const SS = 4;
  const W = size * SS;
  const cx = W / 2, cy = W / 2;
  const outerR = W * ringScale;        // outer radius
  const innerR = outerR * 0.58;        // hole
  const gap = 0.012;                   // gap between segments (fraction of circle)
  const TWO_PI = Math.PI * 2;

  // cumulative boundaries
  const bounds = [];
  let acc = 0;
  for (const [frac, color] of SEGMENTS) {
    bounds.push({ start: acc, end: acc + frac, color });
    acc += frac;
  }

  const hi = new Uint8ClampedArray(W * W * 4);

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * W + x) * 4;

      // background
      let bg;
      if (transparent) {
        bg = [0, 0, 0, 0];
      } else {
        const t = y / W;
        const c = lerp(BG_TOP, BG_BOT, t);
        // subtle radial glow behind the donut
        const glow = Math.max(0, 1 - dist / (outerR * 1.6)) * 14;
        bg = [c[0] + glow, c[1] + glow * 0.8, c[2] + glow * 0.4, 255];
      }

      if (dist >= innerR && dist <= outerR) {
        let ang = Math.atan2(dx, -dy); // 0 at top, clockwise
        if (ang < 0) ang += TWO_PI;
        const f = ang / TWO_PI;

        let seg = null;
        for (const b of bounds) {
          if (f >= b.start + gap / 2 && f < b.end - gap / 2) { seg = b; break; }
        }
        if (seg) {
          // slight radial shading for depth: brighter on outer edge
          const rt = (dist - innerR) / (outerR - innerR);
          const shade = 0.88 + rt * 0.18;
          hi[idx] = Math.min(255, seg.color[0] * shade);
          hi[idx + 1] = Math.min(255, seg.color[1] * shade);
          hi[idx + 2] = Math.min(255, seg.color[2] * shade);
          hi[idx + 3] = 255;
          continue;
        }
      }
      hi[idx] = bg[0]; hi[idx + 1] = bg[1]; hi[idx + 2] = bg[2]; hi[idx + 3] = bg[3];
    }
  }

  // box downsample SSxSS -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const si = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          const af = hi[si + 3];
          r += hi[si] * af; g += hi[si + 1] * af; b += hi[si + 2] * af; a += af;
        }
      }
      const n = SS * SS;
      const oi = (y * size + x) * 4;
      if (a === 0) {
        out[oi] = 0; out[oi + 1] = 0; out[oi + 2] = 0; out[oi + 3] = 0;
      } else {
        out[oi] = Math.round(r / a);
        out[oi + 1] = Math.round(g / a);
        out[oi + 2] = Math.round(b / a);
        out[oi + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

// ---- PNG encode (RGBA, color type 6) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, size, opts) {
  const rgba = render({ size, ...opts });
  const png = encodePNG(rgba, size);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${(png.length / 1024).toFixed(0)}kb)`);
}

// iOS / main icon — opaque, donut fills ~0.72 of canvas
write('icon.png', 1024, { transparent: false, ringScale: 0.37 });
// Splash mark — transparent, slightly smaller
write('splash-icon.png', 1024, { transparent: true, ringScale: 0.34 });
// Android adaptive foreground — transparent, inside safe zone (~0.5)
write('android-icon-foreground.png', 1024, { transparent: true, ringScale: 0.26 });
// Favicon — opaque small
write('favicon.png', 96, { transparent: false, ringScale: 0.37 });
