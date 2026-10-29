export interface V {
  x: number;
  y: number;
}

export const v = (x = 0, y = 0): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const perp = (a: V): V => ({ x: -a.y, y: a.x });
export const angleOf = (a: V) => Math.atan2(a.y, a.x);
export const fromAngle = (r: number, l = 1): V => ({ x: Math.cos(r) * l, y: Math.sin(r) * l });
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function norm(a: V): V {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function closestOnSeg(p: V, a: V, b: V): V {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return a;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return add(a, mul(ab, t));
}

export const distPointSeg = (p: V, a: V, b: V) => dist(p, closestOnSeg(p, a, b));

/** Minimum distance between segments p1-p2 and q1-q2 (0 if they cross). */
export function distSegSeg(p1: V, p2: V, q1: V, q2: V): number {
  if (segCross(p1, p2, q1, q2)) return 0;
  return Math.min(distPointSeg(p1, q1, q2), distPointSeg(p2, q1, q2), distPointSeg(q1, p1, p2), distPointSeg(q2, p1, p2));
}

function segCross(a: V, b: V, c: V, d: V) {
  const o = (p: V, q: V, r: V) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Parameter t in [0,1] along p1->p2 where it first comes within r of segment q1-q2, or -1. */
export function sweepHit(p1: V, p2: V, q1: V, q2: V, r: number): number {
  if (distSegSeg(p1, p2, q1, q2) > r) return -1;
  // coarse march is fine at 60Hz step lengths (<0.5m)
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (distPointSeg(lerp(p1, p2, t), q1, q2) <= r) return t;
  }
  return 1;
}

/** Deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  chance(p: number) {
    return this.next() < p;
  }
}
