import { CROWN_R, HANDOFF_R, KID_R, RING_R, SLED_NO_BUILD, SNOWMAN, WALL } from "./const";
import { inBounds } from "./hill";
import { add, angleOf, dist, distPointSeg, distSegSeg, fromAngle, sub, type V } from "./math";
import type { Kid, Team, WallSpot, World } from "./types";

export const inPlay = (k: Kid) => k.state === "play";
export const busy = (k: Kid) => k.carrying || k.planting > 0;
export const enemiesOf = (w: World, team: Team) => w.kids.filter((k) => k.team !== team && inPlay(k));
export const alliesOf = (w: World, k: Kid) => w.kids.filter((o) => o.team === k.team && o.id !== k.id);
export const kidById = (w: World, id: number) => w.kids[id];
export const human = (w: World) => w.kids[0];

export function carrier(w: World): Kid | null {
  return w.sled.carrier >= 0 ? w.kids[w.sled.carrier] : null;
}

export function carrierOnCrown(w: World): Kid | null {
  const c = carrier(w);
  return c && inPlay(c) && dist(c.pos, w.hill.crown) <= CROWN_R ? c : null;
}

export function nearest(from: V, kids: Kid[]): Kid | null {
  let best: Kid | null = null, bd = Infinity;
  for (const k of kids) {
    const d = dist(from, k.pos);
    if (d < bd) (bd = d), (best = k);
  }
  return best;
}

/** Wall at your feet, facing your aim. */
export function wallSpot(w: World, k: Kid, angle: number): WallSpot {
  const c = add(k.pos, fromAngle(angle, WALL.offset));
  const half = fromAngle(angle + Math.PI / 2, WALL.len / 2);
  const a = add(c, half), b = sub(c, half);
  return { a, b, c, angle, legal: wallLegal(w, a, b) };
}

export function wallLegal(w: World, a: V, b: V) {
  // nothing gets built on the crown (4m circle), nor within 2m of the sled
  const margin = WALL.thick / 2;
  if (distPointSeg(w.hill.crown, a, b) <= CROWN_R + margin) return false;
  if (distPointSeg(w.sled.pos, a, b) <= SLED_NO_BUILD) return false;
  if (!inBounds(w.hill, a) || !inBounds(w.hill, b)) return false;
  return true;
}

/** Your build button: a wall, or a snowman if you bought one. */
export function buildSpot(w: World, k: Kid, angle: number): WallSpot {
  if (!k.kit.snowman) return wallSpot(w, k, angle);
  const c = add(k.pos, fromAngle(angle, SNOWMAN.offset));
  return { a: c, b: c, c, angle, legal: snowmanLegal(w, c) };
}

export function snowmanLegal(w: World, c: V) {
  if (dist(c, w.hill.crown) <= CROWN_R + SNOWMAN.r) return false;
  if (dist(c, w.sled.pos) <= SLED_NO_BUILD) return false;
  return inBounds(w.hill, c, 0.3);
}

/** True if a flat throw from p to q would die on a wall or a snowman (a snowman never blocks its own shots). */
export function lineBlocked(w: World, p: V, q: V, ignoreSnowman = -1) {
  const r = WALL.thick / 2 + 0.1;
  return w.walls.some((wl) => distSegSeg(p, q, wl.a, wl.b) <= r) || w.snowmen.some((s) => s.id !== ignoreSnowman && distPointSeg(s.pos, p, q) <= SNOWMAN.r + 0.1);
}

/** An enemy ring is committed on this kid (they'd rather dodge than catch a sled). */
export function ringOn(w: World, k: Kid) {
  return w.balls.some((b) => b.team !== k.team && dist(b.to, k.pos) <= RING_R + KID_R);
}

/** Allies that may receive the sled: carrier types (never Brick), in range, no ring on them. */
export function handoffEligible(w: World, from: Kid): Kid[] {
  if (!from.carrying) return [];
  return alliesOf(w, from).filter(
    (o) =>
      !o.isHuman &&
      (o.role === "beanie" || o.role === "pockets") &&
      inPlay(o) &&
      o.planting <= 0 &&
      dist(o.pos, from.pos) <= HANDOFF_R &&
      !ringOn(w, o),
  );
}

/** The ONE ally the strip outlines: the eligible ally closest to where you're aiming. */
export function handoffTarget(w: World, from: Kid, aim: V): Kid | null {
  const el = handoffEligible(w, from);
  if (!el.length) return null;
  const aimA = angleOf(sub(aim, from.pos));
  let best: Kid | null = null, bs = Infinity;
  for (const o of el) {
    const da = Math.abs(Math.atan2(Math.sin(angleOf(sub(o.pos, from.pos)) - aimA), Math.cos(angleOf(sub(o.pos, from.pos)) - aimA)));
    const score = da * 3 + dist(o.pos, aim) * 0.2;
    if (score < bs) (bs = score), (best = o);
  }
  return best;
}

/** Steering around walls: head for the near end of a blocking wall. */
export function steer(w: World, from: V, to: V): V {
  const r = KID_R + WALL.thick / 2 + 0.05;
  let best: { wl: (typeof w.walls)[number]; d: number } | null = null;
  for (const wl of w.walls) {
    if (distSegSeg(from, to, wl.a, wl.b) > r) continue;
    const d = distPointSeg(from, wl.a, wl.b);
    if (!best || d < best.d) best = { wl, d };
  }
  if (!best) return sub(to, from);
  const { wl } = best;
  const along = sub(wl.b, wl.a);
  const L = Math.hypot(along.x, along.y);
  const ext = (p: V, s: number) => add(p, { x: (along.x / L) * s * 0.8, y: (along.y / L) * s * 0.8 });
  const candA = ext(wl.a, -1), candB = ext(wl.b, 1);
  const cand = dist(from, candA) + dist(candA, to) < dist(from, candB) + dist(candB, to) ? candA : candB;
  return sub(cand, from);
}
