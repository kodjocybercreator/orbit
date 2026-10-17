#!/usr/bin/env node
/**
 * Orbit icon generator.
 *
 * Concept: "Eclipse Orbit" — a bold amber orbit sweep (tapering comet arc)
 * with an orbiting body in the gap and a warm-cream core at the centre,
 * set on warm-ink. No rockets, no caps, no purple.
 *
 * Produces:
 *   public/icon.svg
 *   public/icon-192.png, public/icon-512.png   (full-bleed, maskable-safe)
 *   android/.../drawable/ic_launcher_foreground.xml (+ drawable-v24 mirror)
 *   android/.../drawable/ic_launcher_background.xml
 *   android/.../values/ic_launcher_background.xml
 *   android/.../mipmap-anydpi-v26/ic_launcher.xml, ic_launcher_round.xml
 *   android/.../mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
 *       ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
 *
 * Uses only Node built-ins (zlib for PNG encoding). No dependencies.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(ROOT, "android", "app", "src", "main", "res");

/* ------------------------------------------------------------------ palette */
const INK = [0x0e, 0x10, 0x12];
const AMBER = [0xe3, 0xa5, 0x53];
const CREAM = [0xec, 0xe7, 0xdd];
const INK_HEX = "#0e1012";
const AMBER_HEX = "#E3A553";
const CREAM_HEX = "#ECE7DD";

/* ---------------------------------------------------------------- geometry
 * Base space: centred on (0,0), half-box = 64 (i.e. the 128px icon).
 * The mark's outer extent is 40 base units, which is 62.5% of the box —
 * comfortably inside the Android adaptive-icon 66% safe zone.
 */
const ARC_R = 33;
const W_HEAD = 7.0;
const W_TAIL = 2.4;
const TAPER = 1.3;
const HEAD_DEG = -60;
const SPAN_DEG = 290;
const TAIL_DEG = HEAD_DEG - SPAN_DEG;
const GAP_MID_DEG = HEAD_DEG + (360 - SPAN_DEG) / 2;
const ORB_R = 5.5;
const DOT_R = 8.5;
const MARK_EXTENT = ARC_R + W_HEAD; // 40

const RAD = Math.PI / 180;
const HEAD = HEAD_DEG * RAD;
const SPAN = SPAN_DEG * RAD;
const TAIL = TAIL_DEG * RAD;

// Adaptive-icon mapping: mark extent 40 -> 34dp in a 108dp viewport.
const ADAPTIVE_K = 34 / MARK_EXTENT; // 0.85

const wAt = (t) => W_TAIL + (W_HEAD - W_TAIL) * Math.pow(1 - t, TAPER);

const ORB_X = ARC_R * Math.cos(GAP_MID_DEG * RAD);
const ORB_Y = ARC_R * Math.sin(GAP_MID_DEG * RAD);

/* --------------------------------------------------------------- svg path */
const n2 = (v) => String(Math.round(v * 100) / 100);

function arcPathData(cx, cy, k) {
  const N = 96;
  const CAP = 32;
  const pts = [];
  const push = (x, y) => pts.push(`${n2(cx + k * x)},${n2(cy + k * y)}`);

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = HEAD - SPAN * t;
    const r = ARC_R + wAt(t);
    push(r * Math.cos(th), r * Math.sin(th));
  }
  for (let i = 1; i < CAP; i++) {
    const phi = TAIL - Math.PI * (i / CAP);
    push(ARC_R * Math.cos(TAIL) + W_TAIL * Math.cos(phi),
         ARC_R * Math.sin(TAIL) + W_TAIL * Math.sin(phi));
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const th = HEAD - SPAN * t;
    const r = ARC_R - wAt(t);
    push(r * Math.cos(th), r * Math.sin(th));
  }
  for (let i = 1; i < CAP; i++) {
    const phi = HEAD + Math.PI - Math.PI * (i / CAP);
    push(ARC_R * Math.cos(HEAD) + W_HEAD * Math.cos(phi),
         ARC_R * Math.sin(HEAD) + W_HEAD * Math.sin(phi));
  }
  return "M" + pts.join("L") + "Z";
}

function circlePathData(cx, cy, r) {
  return (
    `M${n2(cx)},${n2(cy)}m-${n2(r)},0` +
    `a${n2(r)},${n2(r)} 0 1,0 ${n2(r * 2)},0` +
    `a${n2(r)},${n2(r)} 0 1,0 ${n2(-r * 2)},0Z`
  );
}

/* ------------------------------------------------------------------- raster */
function inArc(x, y) {
  const r = Math.hypot(x, y);
  if (r > ARC_R + W_HEAD + 0.01) return false;
  if (r < ARC_R - W_HEAD - 0.01) return false;

  let a = Math.atan2(y, x) - TAIL;
  a -= Math.floor(a / (2 * Math.PI)) * (2 * Math.PI); // -> [0, 2pi)
  if (a <= SPAN) return Math.abs(r - ARC_R) <= wAt(1 - a / SPAN);

  const hx = ARC_R * Math.cos(HEAD);
  const hy = ARC_R * Math.sin(HEAD);
  if ((x - hx) ** 2 + (y - hy) ** 2 <= W_HEAD * W_HEAD) return true;
  const tx = ARC_R * Math.cos(TAIL);
  const ty = ARC_R * Math.sin(TAIL);
  if ((x - tx) ** 2 + (y - ty) ** 2 <= W_TAIL * W_TAIL) return true;
  return false;
}

/** Returns [r,g,b,a] 0-255 (a = 0 means fully transparent). */
function sampleMark(x, y) {
  if (x * x + y * y <= DOT_R * DOT_R) return [CREAM[0], CREAM[1], CREAM[2], 255];
  if ((x - ORB_X) ** 2 + (y - ORB_Y) ** 2 <= ORB_R * ORB_R)
    return [AMBER[0], AMBER[1], AMBER[2], 255];
  if (inArc(x, y)) return [AMBER[0], AMBER[1], AMBER[2], 255];
  return null;
}

function insideRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const dx = x < r ? r - x : x > w - r ? x - (w - r) : 0;
  const dy = y < r ? r - y : y > h - r ? y - (h - r) : 0;
  return dx * dx + dy * dy <= r * r;
}

/**
 * mode:
 *  "square"      rounded-ink square + mark  (Android pre-26 fallback)
 *  "circle"      circular ink tile + mark   (Android pre-26 round fallback)
 *  "full"        full-bleed ink square + mark (PWA maskable icon)
 *  "foreground"  transparent tile + mark only (adaptive foreground)
 */
function renderIcon(size, mode) {
  const SS = size >= 512 ? 3 : 4;
  const k = ADAPTIVE_K * (size / 108); // px per base unit
  const c = size / 2;
  const rx = (28 / 128) * size;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let iy = 0; iy < SS; iy++) {
        const sy = py + (iy + 0.5) / SS;
        for (let ix = 0; ix < SS; ix++) {
          const sx = px + (ix + 0.5) / SS;
          let base;
          if (mode === "full") base = true;
          else if (mode === "square") base = insideRoundRect(sx, sy, size, size, rx);
          else if (mode === "circle") base = (sx - c) ** 2 + (sy - c) ** 2 <= c * c;
          else base = true; // foreground: no tile

          if (!base) continue;

          const m = sampleMark((sx - c) / k, (sy - c) / k);
          const col = m ?? (mode === "foreground" ? null : INK);
          if (!col) continue;
          sr += col[0];
          sg += col[1];
          sb += col[2];
          sa += 255;
        }
      }
      const n = SS * SS;
      const o = (py * size + px) * 4;
      if (sa === 0) continue;
      rgba[o] = Math.round(sr / (sa / 255));
      rgba[o + 1] = Math.round(sg / (sa / 255));
      rgba[o + 2] = Math.round(sb / (sa / 255));
      rgba[o + 3] = Math.round(sa / n);
    }
  }
  return rgba;
}

/* -------------------------------------------------------------- png encoder */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- emit */
function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return path;
}

const written = [];
const mark128 = arcPathData(64, 64, 1);
const orb128 = { x: 64 + ORB_X, y: 64 + ORB_Y, r: ORB_R };

// --- public/icon.svg ---------------------------------------------------------
written.push(
  write(
    join(ROOT, "public", "icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="Orbit">
  <title>Orbit</title>
  <rect width="128" height="128" rx="28" fill="${INK_HEX}"/>
  <circle cx="64" cy="64" r="${n2(DOT_R)}" fill="${CREAM_HEX}"/>
  <path d="${mark128}" fill="${AMBER_HEX}"/>
  <circle cx="${n2(orb128.x)}" cy="${n2(orb128.y)}" r="${n2(orb128.r)}" fill="${AMBER_HEX}"/>
</svg>
`
  )
);

// --- public PWA PNGs (full-bleed, maskable safe) -----------------------------
for (const size of [192, 512]) {
  written.push(
    write(
      join(ROOT, "public", `icon-${size}.png`),
      encodePNG(size, size, renderIcon(size, "full"))
    )
  );
}

// --- Android vector drawable -------------------------------------------------
const mark108 = arcPathData(54, 54, ADAPTIVE_K);
const orb108 = { x: 54 + ORB_X * ADAPTIVE_K, y: 54 + ORB_Y * ADAPTIVE_K, r: ORB_R * ADAPTIVE_K };
const dot108 = DOT_R * ADAPTIVE_K;

const foregroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${CREAM_HEX}"
        android:pathData="${circlePathData(54, 54, dot108)}" />
    <path
        android:fillColor="${AMBER_HEX}"
        android:pathData="${mark108}" />
    <path
        android:fillColor="${AMBER_HEX}"
        android:pathData="${circlePathData(orb108.x, orb108.y, orb108.r)}" />
</vector>
`;
written.push(write(join(RES, "drawable", "ic_launcher_foreground.xml"), foregroundXml));
written.push(write(join(RES, "drawable-v24", "ic_launcher_foreground.xml"), foregroundXml));

written.push(
  write(
    join(RES, "drawable", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${INK_HEX}"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`
  )
);

written.push(
  write(
    join(RES, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${INK_HEX}</color>
</resources>
`
  )
);

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
written.push(write(join(RES, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveXml));
written.push(write(join(RES, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveXml));

// --- Android fallback mipmaps ------------------------------------------------
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${density}`);
  written.push(write(join(dir, "ic_launcher.png"), encodePNG(size, size, renderIcon(size, "square"))));
  written.push(write(join(dir, "ic_launcher_round.png"), encodePNG(size, size, renderIcon(size, "circle"))));
  written.push(
    write(join(dir, "ic_launcher_foreground.png"), encodePNG(size, size, renderIcon(size, "foreground")))
  );
}

/* ----------------------------------------------------------------- verify */
console.log("Orbit icons written:");
for (const p of written) {
  console.log("  " + p.slice(ROOT.length + 1).replace(/\\/g, "/"));
}
