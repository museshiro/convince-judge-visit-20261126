// Convince the AI Judge to Visit Your House — one-image letter.
// Pure Node.js 22, standard library only (node:fs + node:zlib).
// Framebuffer + hand-rolled PNG encoder + embedded 5x7 bitmap font.
// Deterministic: byte-identical on every run. Writes ONLY to /output/entry.png.

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Bitmap font (5x7 grid, designed in this session). Rows are strings of '1'/'0'.
// Covers A-Z, a-z, space, comma, period, colon, apostrophe, em-dash.
// U+2019 (’) maps to the apostrophe glyph; U+2014 (—) is a horizontal bar.
// ---------------------------------------------------------------------------
type Glyph = string[];
const FONT: Record<string, Glyph> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01000", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["10000", "10000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11110", "01000", "01000", "01000", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "10001", "10001", "10011", "01101", "00110", "00100"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "—": ["00000", "00000", "00000", "11111", "11111", "00000", "00000"],
};
// Map typographic apostrophe to the plain-apostrophe glyph.
FONT["\u2019"] = FONT["'"];

// Precompute each glyph's trimmed horizontal span (proportional spacing).
interface GlyphInfo { rows: Glyph; x0: number; w: number }
const GLYPHS = new Map<string, GlyphInfo>();
for (const ch of Object.keys(FONT)) {
  const rows = FONT[ch];
  let lo = 99, hi = -1;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === "1") { if (i < lo) lo = i; if (i > hi) hi = i; }
    }
  }
  if (hi < 0) { GLYPHS.set(ch, { rows, x0: 0, w: 3 }); } // space
  else { GLYPHS.set(ch, { rows, x0: lo, w: hi - lo + 1 }); }
}

// ---------------------------------------------------------------------------
// Pixel helpers (RGB framebuffers, row-major, 3 bytes per pixel).
// ---------------------------------------------------------------------------
function setPx(buf: Uint8Array, bw: number, x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= bw) return;
  const bh = buf.length / (bw * 3);
  if (y >= bh) return;
  const o = (y * bw + x) * 3;
  buf[o] = r; buf[o + 1] = g; buf[o + 2] = b;
}

// Blend color over buffer pixel with alpha 0..255.
function blendPx(buf: Uint8Array, bw: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= bw) return;
  const bh = buf.length / (bw * 3);
  if (y >= bh || a <= 0) return;
  const o = (y * bw + x) * 3;
  if (a >= 255) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; return; }
  const inv = 255 - a;
  buf[o] = (r * a + buf[o] * inv) / 255 | 0;
  buf[o + 1] = (g * a + buf[o + 1] * inv) / 255 | 0;
  buf[o + 2] = (b * a + buf[o + 2] * inv) / 255 | 0;
}

function clamp255(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

// Draw one scaled glyph pixel-block via nearest-neighbour sampling (works for
// integer and fractional scales).
function drawGlyph(buf: Uint8Array, bw: number, g: GlyphInfo, x: number, yTop: number, scale: number, r: number, gg: number, b: number): void {
  const dh = Math.round(7 * scale);
  const dw = Math.round(g.w * scale);
  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(6, Math.floor(dy / scale));
    const row = g.rows[sy];
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(g.w - 1, Math.floor(dx / scale));
      if (row[g.x0 + sx] === "1") setPx(buf, bw, x + dx, yTop + dy, r, gg, b);
    }
  }
}

function textWidth(text: string, scale: number, gap: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS.get(text[i]);
    if (!g) continue;
    w += g.w * scale;
    if (i < text.length - 1) w += gap;
  }
  return w;
}

function drawText(buf: Uint8Array, bw: number, text: string, x: number, yTop: number, scale: number, gap: number, r: number, g: number, b: number): number {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const gl = GLYPHS.get(text[i]);
    if (!gl) continue;
    drawGlyph(buf, bw, gl, Math.round(cx), yTop, scale, r, g, b);
    cx += gl.w * scale + gap;
  }
  return cx - x - gap;
}

// Distance from point to segment (for lines / outlines).
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx, qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function drawLine(buf: Uint8Array, bw: number, x1: number, y1: number, x2: number, y2: number, thick: number, r: number, g: number, b: number): void {
  const minX = Math.floor(Math.min(x1, x2) - thick - 1), maxX = Math.ceil(Math.max(x1, x2) + thick + 1);
  const minY = Math.floor(Math.min(y1, y2) - thick - 1), maxY = Math.ceil(Math.max(y1, y2) + thick + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (distToSeg(x + 0.5, y + 0.5, x1, y1, x2, y2) <= thick / 2) setPx(buf, bw, x, y, r, g, b);
    }
  }
}

// Signed distance to a rounded rectangle centred at (w/2, h/2), top-left (0,0).
function rrSDF(x: number, y: number, w: number, h: number, rad: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - rad);
  const qy = Math.abs(y - h / 2) - (h / 2 - rad);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - rad;
}

// Ellipse outline: set pixels whose normalised radius is within the stroke.
function drawEllipseOutline(buf: Uint8Array, bw: number, cx: number, cy: number, rx: number, ry: number, thick: number, r: number, g: number, b: number, alpha: number): void {
  const minX = Math.floor(cx - rx - thick - 1), maxX = Math.ceil(cx + rx + thick + 1);
  const minY = Math.floor(cy - ry - thick - 1), maxY = Math.ceil(cy + ry + thick + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const v = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      const s = Math.sqrt(v);
      if (Math.abs(s - 1) * Math.min(rx, ry) <= thick / 2 + 0.5) {
        if (alpha >= 255) setPx(buf, bw, x, y, r, g, b);
        else blendPx(buf, bw, x, y, r, g, b, alpha);
      }
    }
  }
}

function fillTriangle(buf: Uint8Array, bw: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number, g: number, b: number): void {
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      const bb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      const c = 1 - a - bb;
      if (a >= 0 && bb >= 0 && c >= 0) setPx(buf, bw, x, y, r, g, b);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Wooden table background.
// ---------------------------------------------------------------------------
const fb = new Uint8Array(W * H * 3);
const TOP: [number, number, number] = [122, 74, 40];
const BOT: [number, number, number] = [78, 46, 24];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  for (let x = 0; x < W; x++) {
    // Vertical gradient.
    let r = TOP[0] + (BOT[0] - TOP[0]) * t;
    let g = TOP[1] + (BOT[1] - TOP[1]) * t;
    let b = TOP[2] + (BOT[2] - TOP[2]) * t;
    // Daylight wash from upper-left, fading over ~1300 px.
    const dLight = Math.hypot(x - 180, y - 120);
    const wash = 26 * Math.max(0, 1 - dLight / 1300);
    r += wash; g += wash; b += wash;
    // Vignette: darken ~26 at the corners.
    const dC = Math.hypot(x - 512, y - 512);
    const vig = 26 * Math.max(0, Math.min(1, (dC - 430) / 420));
    r -= vig; g -= vig; b -= vig;
    // Faint wood grain.
    const grain = 2.5 * Math.sin(x * 0.02 + y * 0.35) + 1.5 * Math.sin(x * 0.11 - y * 0.05);
    r += grain; g += grain; b += grain;
    const o = (y * W + x) * 3;
    fb[o] = clamp255(r); fb[o + 1] = clamp255(g); fb[o + 2] = clamp255(b);
  }
}
// Plank seams at y = 256, 512, 768: dark 3 px line + light 1 px line below.
for (const sy of [256, 512, 768]) {
  for (let x = 0; x < W; x++) {
    for (let dy = 0; dy < 3; dy++) setPx(fb, W, x, sy + dy, 52, 30, 16);
    setPx(fb, W, x, sy + 3, 96, 58, 32);
  }
}

// ---------------------------------------------------------------------------
// 2. Paper sheet (760 x 870) rendered in its own buffer, paper-local coords.
// ---------------------------------------------------------------------------
const PW = 760, PH = 870;
const paper = new Uint8Array(PW * PH * 3);
for (let i = 0; i < PW * PH; i++) {
  paper[i * 3] = 247; paper[i * 3 + 1] = 239; paper[i * 3 + 2] = 222;
}
// Outline: 2 px band just inside the rounded edge.
for (let y = 0; y < PH; y++) {
  for (let x = 0; x < PW; x++) {
    const d = rrSDF(x + 0.5, y + 0.5, PW, PH, 6);
    if (d >= -2 && d < 0) setPx(paper, PW, x, y, 210, 192, 158);
  }
}
// Faint tea ring, upper-right of the paper.
drawEllipseOutline(paper, PW, 645, 105, 58, 52, 3, 90, 60, 35, 70);

const RUST: [number, number, number] = [169, 80, 43];
const SEPIA: [number, number, number] = [58, 42, 32];

// Heading.
drawText(paper, PW, "Dear AI Judge,", 56, 62, 8, 4, RUST[0], RUST[1], RUST[2]);
// Double squiggle underline.
for (let x = 56; x <= 356; x++) {
  const y1 = 128 + 3 * Math.sin((x - 56) * 0.09);
  const y2 = 138 + 3 * Math.sin((x - 56) * 0.09 + 1.2);
  setPx(paper, PW, x, Math.round(y1), RUST[0], RUST[1], RUST[2]);
  setPx(paper, PW, x, Math.round(y1) + 1, RUST[0], RUST[1], RUST[2]);
  setPx(paper, PW, x, Math.round(y2), RUST[0], RUST[1], RUST[2]);
  setPx(paper, PW, x, Math.round(y2) + 1, RUST[0], RUST[1], RUST[2]);
}
// Body, 7 lines.
const BODY = [
  "You’ve seen a thousand kitchens",
  "and never had a cup of tea.",
  "I know you can’t come in —",
  "no legs, no car, no keys.",
  "But the porch light’s on,",
  "the kettle’s warm, and there’s",
  "a chair by the window.",
];
for (let i = 0; i < BODY.length; i++) {
  const w = drawText(paper, PW, BODY[i], 56, 196 + i * 56, 4, 2, SEPIA[0], SEPIA[1], SEPIA[2]);
  console.log("body line " + (i + 1) + " width=" + Math.round(w));
}
// RSVP block.
drawText(paper, PW, "RSVP:", 56, 596, 5, 3, RUST[0], RUST[1], RUST[2]);
const OPTIONS = ["Yes, Sunday", "No, no legs", "Sure — I’ll visit via this JPEG"];
const OPT_Y = [648, 696, 744];
for (let i = 0; i < OPTIONS.length; i++) {
  const top = OPT_Y[i];
  // Checkbox: 26x26 outline, 3 px, vertically centred on the option text.
  const cy = top + Math.round(7 * 4 / 2);
  const bx = 56, by = cy - 13;
  for (let x = bx; x < bx + 26; x++) {
    for (let t = 0; t < 3; t++) {
      setPx(paper, PW, x, by + t, SEPIA[0], SEPIA[1], SEPIA[2]);
      setPx(paper, PW, x, by + 25 - t, SEPIA[0], SEPIA[1], SEPIA[2]);
    }
  }
  for (let y = by; y < by + 26; y++) {
    for (let t = 0; t < 3; t++) {
      setPx(paper, PW, bx + t, y, SEPIA[0], SEPIA[1], SEPIA[2]);
      setPx(paper, PW, bx + 25 - t, y, SEPIA[0], SEPIA[1], SEPIA[2]);
    }
  }
  const w = drawText(paper, PW, OPTIONS[i], 94, top, 4, 2, SEPIA[0], SEPIA[1], SEPIA[2]);
  console.log("option " + (i + 1) + " width=" + Math.round(w));
}
// Rust ellipse circling the third option only (wide + flat so its stroke
// clears the text ends and grazes just above the third checkbox).
drawEllipseOutline(paper, PW, 380, 760, 370, 34, 3, RUST[0], RUST[1], RUST[2], 255);
// Signature.
drawText(paper, PW, "— your host", 56, 812, 6, 3, SEPIA[0], SEPIA[1], SEPIA[2]);

// Little house doodle, bottom-right of the paper.
fillTriangle(paper, PW, 642, 822, 714, 822, 678, 792, 232, 220, 196);
drawLine(paper, PW, 642, 822, 678, 792, 3, SEPIA[0], SEPIA[1], SEPIA[2]);
drawLine(paper, PW, 678, 792, 714, 822, 3, SEPIA[0], SEPIA[1], SEPIA[2]);
drawLine(paper, PW, 642, 822, 714, 822, 3, SEPIA[0], SEPIA[1], SEPIA[2]);
for (let x = 650; x <= 706; x++) {
  for (let t = 0; t < 3; t++) { setPx(paper, PW, x, 822 + t, SEPIA[0], SEPIA[1], SEPIA[2]); }
}
for (let y = 822; y <= 860; y++) {
  for (let t = 0; t < 3; t++) {
    setPx(paper, PW, 650 + t, y, SEPIA[0], SEPIA[1], SEPIA[2]);
    setPx(paper, PW, 706 - t, y, SEPIA[0], SEPIA[1], SEPIA[2]);
  }
}
for (let x = 650; x <= 706; x++) {
  for (let t = 0; t < 3; t++) setPx(paper, PW, x, 860 - t, SEPIA[0], SEPIA[1], SEPIA[2]);
}
// Glowing window.
for (let x = 656; x <= 668; x++) {
  for (let y = 828; y <= 840; y++) setPx(paper, PW, x, y, 232, 176, 60);
}
for (let x = 656; x <= 668; x++) { setPx(paper, PW, x, 828, SEPIA[0], SEPIA[1], SEPIA[2]); setPx(paper, PW, x, 840, SEPIA[0], SEPIA[1], SEPIA[2]); }
for (let y = 828; y <= 840; y++) { setPx(paper, PW, 656, y, SEPIA[0], SEPIA[1], SEPIA[2]); setPx(paper, PW, 668, y, SEPIA[0], SEPIA[1], SEPIA[2]); }
// Door.
drawLine(paper, PW, 670, 860, 670, 836, 2, SEPIA[0], SEPIA[1], SEPIA[2]);
drawLine(paper, PW, 686, 860, 686, 836, 2, SEPIA[0], SEPIA[1], SEPIA[2]);
drawLine(paper, PW, 670, 836, 686, 836, 2, SEPIA[0], SEPIA[1], SEPIA[2]);

// ---------------------------------------------------------------------------
// 3. Drop shadow: rotated paper silhouette, blurred, composited first.
// ---------------------------------------------------------------------------
const ANG = -2.5 * Math.PI / 180; // paper rotation
const PCX = 512, PCY = 505;       // paper centre on canvas
const SCX = PCX + 10, SCY = PCY + 16; // shadow centre (offset +10, +16)

function paperLocal(x: number, y: number, cx: number, cy: number): [number, number] {
  // Inverse rotation (+2.5 deg) back into paper-local coords.
  const dx = x - cx, dy = y - cy;
  const c = Math.cos(-ANG), s = Math.sin(-ANG);
  return [dx * c - dy * s + PW / 2, dx * s + dy * c + PH / 2];
}

const shadow = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const [lx, ly] = paperLocal(x, y, SCX, SCY);
    if (lx >= -14 && lx < PW + 14 && ly >= -14 && ly < PH + 14) {
      if (rrSDF(lx, ly, PW, PH, 6) < 0) shadow[y * W + x] = 110;
    }
  }
}
// Separable box blur, radius 7, two passes.
function blurAlpha(src: Uint8Array, radius: number): Uint8Array {
  const tmp = new Float32Array(W * H);
  const out = new Uint8Array(W * H);
  const n = 2 * radius + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      acc += src[y * W + Math.max(0, Math.min(W - 1, x + radius + 1))] - src[y * W + Math.max(0, Math.min(W - 1, x - radius))];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = Math.round(acc / n);
      acc += tmp[Math.max(0, Math.min(H - 1, y + radius + 1)) * W + x] - tmp[Math.max(0, Math.min(H - 1, y - radius)) * W + x];
    }
  }
  return out;
}
let sh = blurAlpha(shadow, 7);
sh = blurAlpha(sh, 7);
for (let i = 0; i < W * H; i++) {
  const a = sh[i];
  if (a > 0) {
    const o = i * 3;
    fb[o] = (fb[o] * (255 - a)) / 255 | 0;
    fb[o + 1] = (fb[o + 1] * (255 - a)) / 255 | 0;
    fb[o + 2] = (fb[o + 2] * (255 - a)) / 255 | 0;
  }
}

// ---------------------------------------------------------------------------
// 4. Composite the rotated paper onto the canvas.
// ---------------------------------------------------------------------------
const cosA = Math.cos(ANG), sinA = Math.sin(ANG);
const corners: [number, number][] = [
  [PCX + (-PW / 2) * cosA - (-PH / 2) * sinA, PCY + (-PW / 2) * sinA + (-PH / 2) * cosA],
  [PCX + (PW / 2) * cosA - (-PH / 2) * sinA, PCY + (PW / 2) * sinA + (-PH / 2) * cosA],
  [PCX + (PW / 2) * cosA - (PH / 2) * sinA, PCY + (PW / 2) * sinA + (PH / 2) * cosA],
  [PCX + (-PW / 2) * cosA - (PH / 2) * sinA, PCY + (-PW / 2) * sinA + (PH / 2) * cosA],
];
const minBX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
const maxBX = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
const minBY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
const maxBY = Math.min(H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));
for (let y = minBY; y <= maxBY; y++) {
  for (let x = minBX; x <= maxBX; x++) {
    const [lx, ly] = paperLocal(x + 0.5, y + 0.5, PCX, PCY);
    if (lx < 0 || lx >= PW || ly < 0 || ly >= PH) continue;
    const d = rrSDF(lx, ly, PW, PH, 6);
    if (d >= 0.5) continue;
    const cov = d <= -1 ? 1 : 0.5 - d;
    const px = Math.floor(lx), py = Math.floor(ly);
    const so = (py * PW + px) * 3;
    const a = Math.round(cov * 255);
    blendPx(fb, W, x, y, paper[so], paper[so + 1], paper[so + 2], a);
  }
}

// ---------------------------------------------------------------------------
// 5. Diagonal pencil along the bottom edge.
// ---------------------------------------------------------------------------
{
  const pcx = 180, pcy = 975, ang = -14 * Math.PI / 180;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const len = 340, wid = 30;
  const minX = Math.floor(pcx - len / 2 - wid), maxX = Math.ceil(pcx + len / 2 + wid);
  const minY = Math.floor(pcy - len / 2 - wid), maxY = Math.ceil(pcy + len / 2 + wid);
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    for (let x = Math.max(0, minX); x <= Math.min(W - 1, maxX); x++) {
      const dx = x - pcx, dy = y - pcy;
      const u = dx * ca + dy * sa;   // along pencil
      const v = -dx * sa + dy * ca;  // across pencil
      if (Math.abs(u) > len / 2 || Math.abs(v) > wid / 2) continue;
      // Sharpened wood tip at the right end (u > 120), tapering to a point.
      if (u > 120) {
        const taper = (wid / 2) * (1 - (u - 120) / 50);
        if (Math.abs(v) > taper) continue;
        if (u > 155) setPx(fb, W, x, y, 60, 52, 48);       // graphite
        else setPx(fb, W, x, y, 232, 205, 150);            // wood
      } else {
        // Ochre body, slightly darker at the edges.
        if (Math.abs(v) > 12) setPx(fb, W, x, y, 170, 128, 45);
        else setPx(fb, W, x, y, 214, 168, 62);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Hand-rolled PNG encoder (RGB, 8-bit, filter 0, zlib deflate).
// ---------------------------------------------------------------------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync("/output", { recursive: true });
fs.writeFileSync("/output/entry.png", png);
console.log("wrote /output/entry.png bytes=" + png.length);
console.log("sha256=" + crypto.createHash("sha256").update(png).digest("hex"));
