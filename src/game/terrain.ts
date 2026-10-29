import { CROWN_R } from "../sim/const";
import { heightAt, type Hill } from "../sim/hill";
import type { V } from "../sim/math";
import { A, H, OX, OY, W, ZS } from "./iso";

// Cosmetic only. The sim plays on hill.ts's heightAt; everything here is either equal to
// it inside the field (so kids, rings and balls sit exactly where they always did) or
// lives outside the field: snowbanks, the street, drifts, shading, shadows.

// ------------------------------------------------------------------ noise

function hash(i: number, j: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const bump = (d: number, c: number, w: number) => Math.exp(-(((d - c) / w) ** 2));

// ------------------------------------------------------------------ sun

// Low late-afternoon sun from the upper left of the screen: the camera-right slope of the
// hill falls into blue shade, which is what makes the mound read as a mound.
const EL = (30 * Math.PI) / 180;
const AZ = { x: -0.6, y: -0.8 };
export const SUN = { x: AZ.x * Math.cos(EL), y: AZ.y * Math.cos(EL), z: Math.sin(EL) };
/** Ground offset of a shadow per metre of height. */
export const SHADOW = { x: -SUN.x / SUN.z, y: -SUN.y / SUN.z };

// ------------------------------------------------------------------ the street (same on every hill)

export const HOUSE_SPOTS: V[] = [
  { x: -15.2, y: 0 }, // Chestnut
  { x: 15.2, y: 0 }, // the rival street
  { x: -9, y: -10.6 }, // neighbours
  { x: 9, y: 10.6 },
];
export const HOUSE_HX = 1.5;
export const HOUSE_HY = 2.1;
export const HOUSE_WALL = 2.4;
export const HOUSE_RISE = 1.15;
const ROAD = [18.4, 21.6]; // |x|: a plowed street behind each team's house

/** Pines only behind the field (they never cover play); bushes in front stay knee-high. */
export const TREES: { p: V; s: number }[] = [
  { p: { x: -13.6, y: -8.6 }, s: 1.0 },
  { p: { x: -4.6, y: -10.4 }, s: 1.15 },
  { p: { x: -2.2, y: -12.6 }, s: 0.95 },
  { p: { x: 1.4, y: -10.2 }, s: 1.05 },
  { p: { x: 5.6, y: -11.6 }, s: 1.2 },
  { p: { x: 9.6, y: -9.6 }, s: 0.95 },
  { p: { x: 13.8, y: -11.2 }, s: 1.1 },
  { p: { x: 15.6, y: -5.6 }, s: 1.0 },
  { p: { x: 17.0, y: -8.4 }, s: 0.9 },
  { p: { x: 16.6, y: 4.6 }, s: 0.85 },
  { p: { x: -16.4, y: -5.6 }, s: 0.9 },
  { p: { x: -7.8, y: -14.2 }, s: 1.1 },
];
export const BUSHES: { p: V; s: number }[] = [
  { p: { x: -13.9, y: -3.4 }, s: 1 },
  { p: { x: -13.7, y: 3.6 }, s: 0.9 },
  { p: { x: -6.5, y: 8.9 }, s: 1 },
  { p: { x: -4.9, y: 9.4 }, s: 0.75 },
  { p: { x: 4.2, y: 8.8 }, s: 0.95 },
  { p: { x: 13.9, y: 3.2 }, s: 0.85 },
  { p: { x: 13.8, y: -3.3 }, s: 0.9 },
];

function rectDist(c: V, hx: number, hy: number, x: number, y: number) {
  const dx = Math.max(Math.abs(x - c.x) - hx, 0), dy = Math.max(Math.abs(y - c.y) - hy, 0);
  return Math.hypot(dx, dy);
}

function outsideField(h: Hill, x: number, y: number) {
  const b = h.bounds;
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minY - y, 0, y - b.maxY));
}

/** Height of the decorative ground on top of the play hill: zero everywhere a kid can stand in play. */
function extra(h: Hill, x: number, y: number) {
  const d = outsideField(h, x, y);
  if (d <= 0) return 0;
  const b = h.bounds;
  const ax = Math.abs(x);
  // a shovelled snowbank around the yard, with gaps for both porch paths and the cocoa stand
  let gap = 1;
  if (ax > b.maxX - 0.5) gap = Math.min(gap, sstep(1.0, 1.9, Math.abs(y - h.porch[0].y)));
  if (y > b.maxY - 0.5) gap = Math.min(gap, sstep(1.4, 2.3, Math.abs(x - h.stand.x)));
  let e = 0.36 * bump(d, 0.8, 0.5) * (0.7 + 0.6 * noise(x * 0.55 + 7, y * 0.55)) * sstep(0, 0.4, d) * gap;
  // the street: sunk a touch, with plough banks on both kerbs
  const road = sstep(ROAD[0] - 0.2, ROAD[0] + 0.2, ax) * (1 - sstep(ROAD[1] - 0.2, ROAD[1] + 0.2, ax));
  e = e * (1 - road) - 0.05 * road;
  e += 0.42 * (bump(ax, ROAD[0] - 0.55, 0.4) + bump(ax, ROAD[1] + 0.55, 0.4)) * (0.65 + 0.7 * noise(x * 0.8, y * 0.7 + 3));
  // rolling drifts out on the lawns
  const lawn = sstep(2.2, 4.5, d) * (1 - road);
  e += lawn * 0.32 * Math.max(0, noise(x * 0.16 + 11, y * 0.16 - 5) * 1.3 - 0.45) * (1 - sstep(16.6, 18, ax));
  // flat where things stand
  let flat = sstep(1.4, 2.4, Math.hypot(x - h.stand.x, y - h.stand.y));
  for (const c of HOUSE_SPOTS) flat = Math.min(flat, sstep(0.25, 1.4, rectDist(c, HOUSE_HX, HOUSE_HY, x, y)));
  return e * flat;
}

/** Where to stand anything on the ground: the play hill inside the field, banks and drifts outside. */
export function groundZ(h: Hill, p: V) {
  return heightAt(h, p) + extra(h, p.x, p.y);
}

// ------------------------------------------------------------------ sled runs (where kids have been sledding all week)

function sledRuns(h: Hill): V[][] {
  const runs: V[][] = [];
  // only down the faces the camera sees; the back face folds behind the crown
  const spec: [number, number][] = [
    [0.05, 0.5], [0.3, -0.7], [0.52, 0.4], [0.68, -0.5], [0.83, 0.6], [0.98, -0.4], [1.14, 0.5],
  ];
  for (const [f, bend] of spec) {
    const th = f * Math.PI;
    const c = Math.cos(th), s = Math.sin(th);
    const R = 1 / Math.hypot(c / h.slope.rx, s / h.slope.ry);
    const pts: V[] = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const r = CROWN_R - 0.3 + (R + 1.8 - CROWN_R) * u;
      const off = Math.sin(u * Math.PI) * bend + u * u * bend * 0.8;
      pts.push({ x: h.crown.x + c * r - s * off, y: h.crown.y + s * r + c * off });
    }
    runs.push(pts);
  }
  return runs;
}

function segDist(px: number, py: number, a: V, b: V) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp01(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

// ------------------------------------------------------------------ the bake

const G = 0.1; // metres per cell
const G0 = -26;
const GN = 521;

interface Grid {
  z: Float32Array; // ground height (geometry)
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  lit: Float32Array; // 0 = shade, 1 = full sun (for sparkles)
}

const C_LIT = [255, 246, 226];
const C_SNOW = [236, 240, 250];
const C_SHADE = [158, 176, 222];
const C_DEEP = [122, 140, 200];
const C_PACKED = [219, 225, 238];
const C_ROAD = [126, 134, 156];
const C_SLUSH = [196, 203, 220];

function pointInPoly(pts: V[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function hull(pts: V[]): V[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: V, a: V, b: V) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: V[] = [], hi: V[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Shadow shapes on the ground (houses, pines, lamp posts), built from the same sun. */
function castShadows(h: Hill) {
  const polys: V[][] = [];
  for (const c of HOUSE_SPOTS) {
    const fp = [
      { x: c.x - HOUSE_HX - 0.2, y: c.y - HOUSE_HY - 0.2 },
      { x: c.x + HOUSE_HX + 0.2, y: c.y - HOUSE_HY - 0.2 },
      { x: c.x + HOUSE_HX + 0.2, y: c.y + HOUSE_HY + 0.2 },
      { x: c.x - HOUSE_HX - 0.2, y: c.y + HOUSE_HY + 0.2 },
    ];
    const top = HOUSE_WALL + HOUSE_RISE * 0.6;
    polys.push(hull([...fp, ...fp.map((p) => ({ x: p.x + SHADOW.x * top, y: p.y + SHADOW.y * top }))]));
  }
  const blobs: { c: V; r: number; len: number; cone: number }[] = [];
  for (const t of TREES) blobs.push({ c: t.p, r: 0.85 * t.s, len: 4.2 * t.s, cone: 1 });
  for (const t of BUSHES) blobs.push({ c: t.p, r: 0.5 * t.s, len: 0.7 * t.s, cone: 0 });
  blobs.push({ c: h.stand, r: 0.9, len: 1.6, cone: 0 });
  const posts = h.lamps.map((p) => ({ a: p, b: { x: p.x + SHADOW.x * 2.3, y: p.y + SHADOW.y * 2.3 } }));
  return { polys, blobs, posts };
}

const grids = new Map<string, Grid>();

function buildGrid(h: Hill): Grid {
  const n = GN * GN;
  const z = new Float32Array(n), m = new Float32Array(n);
  const kind = new Uint8Array(n); // 0 snow, 1 packed, 2 road
  const runs = sledRuns(h);
  const boxes = runs.map((r) => ({
    x0: Math.min(...r.map((p) => p.x)) - 0.4, x1: Math.max(...r.map((p) => p.x)) + 0.4,
    y0: Math.min(...r.map((p) => p.y)) - 0.4, y1: Math.max(...r.map((p) => p.y)) + 0.4,
  }));
  const b = h.bounds;

  for (let j = 0; j < GN; j++)
    for (let i = 0; i < GN; i++) {
      const x = G0 + i * G, y = G0 + j * G, k = j * GN + i;
      const zz = heightAt(h, { x, y }) + extra(h, x, y);
      z[k] = zz;
      // small-scale relief that only feeds the shading: lumps, wind ripples, trampled crown, sled troughs
      const wx = x * 0.94 + y * 0.34, wy = -x * 0.34 + y * 0.94;
      let mm = 0.045 * noise(x * 0.9 + 3.1, y * 0.9 - 1.7) + 0.012 * noise(x * 2.3, y * 2.3) + 0.01 * noise(wx * 0.8, wy * 4.2);
      const rc = Math.hypot(x - h.crown.x, y - h.crown.y);
      if (rc < CROWN_R + 0.6) mm += 0.016 * noise(x * 5.5, y * 5.5) * sstep(CROWN_R + 0.6, CROWN_R - 0.3, rc);
      // the path everyone has trodden round the edge of the crown
      const rim = Math.abs(rc - CROWN_R - 0.05);
      if (rim < 0.32) mm -= 0.025 * (1 - (rim / 0.32) ** 2);
      if (rc > CROWN_R - 0.6 && Math.abs(x) < 14 && Math.abs(y) < 10) {
        let dm = 9;
        runs.forEach((run, ri) => {
          const bx = boxes[ri];
          if (x < bx.x0 || x > bx.x1 || y < bx.y0 || y > bx.y1) return;
          for (let s = 1; s < run.length; s++) dm = Math.min(dm, segDist(x, y, run[s - 1], run[s]));
        });
        const fade = sstep(CROWN_R - 0.6, CROWN_R + 0.4, rc);
        mm -= 0.06 * Math.max(0, 1 - (dm / 0.3) ** 2) * fade;
        if (dm < 0.26) kind[k] = 1;
      }
      const ax = Math.abs(x);
      if (ax > ROAD[0] && ax < ROAD[1]) kind[k] = 2;
      // shovelled porch paths and the trampled patch round the cocoa stand
      if (ax > b.maxX - 0.2 && ax < 13.9 && Math.abs(y - h.porch[0].y) < 0.8) kind[k] = 1;
      if (Math.hypot(x - h.stand.x, y - h.stand.y) < 1.5 + 0.3 * noise(x * 2, y * 2)) kind[k] = 1;
      if (Math.abs(rc - CROWN_R - 0.05) < 0.2 + 0.06 * noise(x * 3, y * 3)) kind[k] = 1;
      m[k] = mm;
    }

  const at = (gz: Float32Array, x: number, y: number) => {
    const fi = (x - G0) / G, fj = (y - G0) / G;
    const i = Math.max(0, Math.min(GN - 2, Math.floor(fi))), j = Math.max(0, Math.min(GN - 2, Math.floor(fj)));
    const u = fi - i, w = fj - j, k = j * GN + i;
    return (gz[k] * (1 - u) + gz[k + 1] * u) * (1 - w) + (gz[k + GN] * (1 - u) + gz[k + GN + 1] * u) * w;
  };

  const { polys, blobs, posts } = castShadows(h);
  const sh = Math.hypot(SHADOW.x, SHADOW.y);
  const sd = { x: SHADOW.x / sh, y: SHADOW.y / sh };

  const r = new Float32Array(n), g = new Float32Array(n), bl = new Float32Array(n), lit = new Float32Array(n);
  const tanEl = SUN.z / Math.hypot(SUN.x, SUN.y);
  const ah = { x: AZ.x, y: AZ.y };
  for (let j = 1; j < GN - 1; j++)
    for (let i = 1; i < GN - 1; i++) {
      const k = j * GN + i, x = G0 + i * G, y = G0 + j * G;
      // normals a touch exaggerated: the camera flattens slopes, the shading gives them back
      const hx = (1.4 * (z[k + 1] + m[k + 1] - z[k - 1] - m[k - 1])) / (2 * G);
      const hy = (1.4 * (z[k + GN] + m[k + GN] - z[k - GN] - m[k - GN])) / (2 * G);
      const nl = Math.hypot(hx, hy, 1);
      let ndl = (-hx * SUN.x - hy * SUN.y + SUN.z) / nl;

      // cast shadows: the hill and banks on themselves, then houses, pines, posts
      let shade = 0;
      // only the hill casts a long shadow; out on the lawns, banks and drifts throw short ones
      const reach = Math.abs(x) < 16 && Math.abs(y) < 11 ? 34 : 8;
      for (let s = 1; s <= reach && !shade; s++) {
        const dd = s * 0.14;
        if (at(z, x + ah.x * dd, y + ah.y * dd) > z[k] + dd * tanEl + 0.02) shade = 1;
      }
      if (!shade && polys.some((p) => pointInPoly(p, x, y))) shade = 1;
      if (!shade)
        for (const o of blobs) {
          const dx = x - o.c.x, dy = y - o.c.y;
          const along = dx * sd.x + dy * sd.y, across = -dx * sd.y + dy * sd.x;
          if (along < -o.r || along > o.len) continue;
          // pines throw a pointed shadow; round things throw a round one
          const wdt = o.cone ? o.r * (1 - clamp01(along / o.len)) : o.r;
          const t = o.cone ? 0 : (along - o.len * 0.5) / (o.len * 0.5 + o.r);
          if (wdt > 0 && t * t + (across / wdt) ** 2 < 1) shade = o.cone ? 0.6 : 0.7;
        }
      if (!shade) for (const p of posts) if (segDist(x, y, p.a, p.b) < 0.07) shade = 0.6;
      if (shade) ndl = Math.min(ndl, SUN.z * (1 - shade) + 0.06 * shade);

      const t = ndl - SUN.z;
      let c: number[];
      if (t >= 0) c = mix(C_SNOW, C_LIT, clamp01(t / 0.3));
      else if (t > -0.5) c = mix(C_SNOW, C_SHADE, -t / 0.5);
      else c = mix(C_SHADE, C_DEEP, clamp01((-t - 0.5) / 0.3));
      // ambient occlusion in hollows and at the foot of banks
      const e3 = 3;
      const lap = (z[k + e3] + z[k - e3] + z[k + e3 * GN] + z[k - e3 * GN] - 4 * z[k]) / (e3 * G) ** 2;
      c = mix(c, C_SHADE, clamp01(lap * 0.35) * 0.55);
      // and a little extra sun on crests and high ground, so the hill stands up off the yard
      c = mix(c, C_LIT, clamp01(-lap * 0.5) * 0.5 * (shade ? 0 : 1));
      if (t > -0.1) c = mix(c, C_LIT, clamp01(z[k] / h.crownH) * 0.25 * (shade ? 0 : 1));
      // big soft patches so the snow isn't one flat colour
      const pf = 0.965 + 0.05 * noise(x * 0.14 + 40, y * 0.14);
      c = [c[0] * pf, c[1] * pf, Math.min(255, c[2] * (pf + 0.01))];

      if (kind[k]) {
        const light = [c[0] / C_SNOW[0], c[1] / C_SNOW[1], c[2] / C_SNOW[2]];
        let alb: number[];
        if (kind[k] === 1) alb = mix(C_SNOW, C_PACKED, 0.75);
        else {
          // ploughed street: slush streaks along the road, two packed tyre lanes
          const ax = Math.abs(x), mid = (ROAD[0] + ROAD[1]) / 2;
          const lane = Math.max(bump(ax, mid - 0.85, 0.28), bump(ax, mid + 0.85, 0.28));
          const streak = sstep(0.4, 0.8, noise(x * 5, y * 0.35)) * 0.6 + sstep(0.55, 0.85, noise(x * 1.5 + 9, y * 0.9)) * 0.5;
          alb = mix(mix(C_SLUSH, C_ROAD, lane), C_SLUSH, clamp01(streak) * (1 - lane * 0.7));
        }
        c = [alb[0] * light[0], alb[1] * light[1], alb[2] * light[2]];
      }
      r[k] = c[0];
      g[k] = c[1];
      bl[k] = c[2];
      lit[k] = shade || kind[k] ? 0 : clamp01((t + 0.05) / 0.2);
    }
  return { z, r, g, b: bl, lit };
}

const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function grid(h: Hill) {
  let gr = grids.get(h.id);
  if (!gr) grids.set(h.id, (gr = buildGrid(h)));
  return gr;
}

/** Heightfield -> screen, one column at a time, near to far, so the crown hides what's behind it. */
function rasterize(gr: Grid, k: number) {
  const cw = Math.round(W * k), ch = Math.round(H * k);
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const cx = cv.getContext("2d")!;
  const img = cx.createImageData(cw, ch);
  const px = img.data;
  const half = A * 0.5;
  const dw = 0.7 / (half * k);
  const wNear = (H - OY) / half + 2;
  for (let col = 0; col < cw; col++) {
    const u = ((col + 0.5) / k - OX) / A;
    let ymin = ch, hidden = 0;
    for (let w = wNear; w > -60 && ymin > 0; w -= dw) {
      const x = (u - w) / 2, y = (u + w) / 2;
      const fi = (x - G0) / G, fj = (y - G0) / G;
      const i = Math.max(0, Math.min(GN - 2, Math.floor(fi))), j = Math.max(0, Math.min(GN - 2, Math.floor(fj)));
      const a = fi - i, bb = fj - j, idx = j * GN + i;
      const w00 = (1 - a) * (1 - bb), w10 = a * (1 - bb), w01 = (1 - a) * bb, w11 = a * bb;
      const zz = gr.z[idx] * w00 + gr.z[idx + 1] * w10 + gr.z[idx + GN] * w01 + gr.z[idx + GN + 1] * w11;
      const top = Math.floor((OY + w * half - zz * ZS) * k);
      if (top >= ymin) {
        hidden++;
        continue;
      }
      // just over a crest (the ground behind it was hidden): a soft ink line, like the rest of the art
      const fold = hidden > 6 ? 1.6 * k : 0;
      hidden = 0;
      const R = gr.r[idx] * w00 + gr.r[idx + 1] * w10 + gr.r[idx + GN] * w01 + gr.r[idx + GN + 1] * w11;
      const Gc = gr.g[idx] * w00 + gr.g[idx + 1] * w10 + gr.g[idx + GN] * w01 + gr.g[idx + GN + 1] * w11;
      const B = gr.b[idx] * w00 + gr.b[idx + 1] * w10 + gr.b[idx + GN] * w01 + gr.b[idx + GN + 1] * w11;
      for (let yy = Math.max(0, top); yy < ymin; yy++) {
        const o = (yy * cw + col) * 4;
        const ink = fold && yy >= ymin - fold ? 0.45 : 0;
        px[o] = R + (110 - R) * ink;
        px[o + 1] = Gc + (126 - Gc) * ink;
        px[o + 2] = B + (172 - B) * ink;
        px[o + 3] = 255;
      }
      ymin = Math.max(0, top);
    }
  }
  cx.putImageData(img, 0, 0);
  return cv;
}

// ------------------------------------------------------------------ public: draw the ground

interface Baked {
  key: string;
  cv: HTMLCanvasElement;
}
let baked: Baked | null = null;
let pending = 0;
const sparkleCache = new Map<string, { p: V; z: number; ph: number; sp: number }[]>();

function sparkles(h: Hill) {
  let s = sparkleCache.get(h.id);
  if (s) return s;
  const gr = grid(h);
  s = [];
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let tries = 0; s.length < 260 && tries < 20000; tries++) {
    const x = -20 + rnd() * 40, y = -14 + rnd() * 28;
    const i = Math.round((x - G0) / G), j = Math.round((y - G0) / G), k = j * GN + i;
    if (gr.lit[k] < 0.6 || rnd() > gr.lit[k]) continue;
    s.push({ p: { x, y }, z: gr.z[k], ph: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 1.4 });
  }
  sparkleCache.set(h.id, s);
  return s;
}

/** The baked snow for this hill at the canvas's backing scale (rebaked after a resize settles). */
export function drawTerrain(ctx: CanvasRenderingContext2D, h: Hill, time: number, dusk: number) {
  const k = Math.min(2, Math.max(1, ctx.getTransform().a));
  const key = `${h.id}@${k.toFixed(2)}`;
  if (!baked || (baked.key !== key && !baked.key.startsWith(`${h.id}@`))) baked = { key, cv: rasterize(grid(h), k) };
  else if (baked.key !== key && !pending)
    pending = window.setTimeout(() => {
      pending = 0;
      baked = { key, cv: rasterize(grid(h), k) };
    }, 250);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(baked.cv, 0, 0, W, H);
  ctx.restore();

  // sun glints on the lit snow; they fade out as the sun goes
  const a0 = 1 - dusk;
  if (a0 <= 0.02) return;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (const s of sparkles(h)) {
    const tw = Math.sin(time * s.sp + s.ph);
    if (tw < 0.82) continue;
    const a = ((tw - 0.82) / 0.18) * a0;
    const p = { x: OX + (s.p.x + s.p.y) * A, y: OY + (s.p.y - s.p.x) * A * 0.5 - s.z * ZS };
    const r = 1.2 + a * 1.6;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y);
    ctx.lineTo(p.x, p.y - 0.35);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + 0.35);
    ctx.moveTo(p.x, p.y - r * 0.8);
    ctx.lineTo(p.x + 0.35, p.y);
    ctx.lineTo(p.x, p.y + r * 0.8);
    ctx.lineTo(p.x - 0.35, p.y);
    ctx.fill();
  }
  ctx.restore();
}

/** Warm the bake before the first frame needs it (the title card hides the cost). */
export function prebake(h: Hill) {
  grid(h);
  sparkles(h);
}
