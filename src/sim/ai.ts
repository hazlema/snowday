// Behaviour rules (Systems) — no state trees. Each bot is a short priority list.
import {
  BALL_R,
  BEANIE_THROW_AFTER,
  BLOWER,
  CARRIER_READ,
  CARRIER_WANDER,
  COPY_DELAY,
  DODGE_SLOP,
  CROWN_R,
  FALLBACK_AFTER,
  KID_R,
  PLAIN,
  RING_R,
  SIEGE,
  WALL,
} from "./const";
import { inBounds } from "./hill";
import { add, angleOf, clamp, dist, distPointSeg, dot, fromAngle, mul, norm, perp, sub, v, type V } from "./math";
import { buildSpot, busy, carrier, enemiesOf, human, inPlay, lineBlocked, nearest, steer, wallSpot } from "./query";
import type { Ball, BallKind, Kid, World } from "./types";

export interface Intent {
  move: V; // desired velocity as a fraction of full speed (|move| <= 1)
  face?: number;
  throwAt?: { p: V; kind: BallKind; target: number };
  plant?: number; // plant a wall facing this angle
  handoff?: boolean; // human: throw pressed while carrying
  pickup: boolean; // allowed to grab a free sled on touch
}

export const idle = (): Intent => ({ move: v(), pickup: false });

function moveTo(w: World, k: Kid, p: V, stopR = 0.25): V {
  const d = dist(k.pos, p);
  if (d < stopR) return v();
  return mul(norm(steer(w, k.pos, p)), clamp(d / 0.8, 0.3, 1));
}

/** Keep a desired move inside the field: slide along the edge instead of pushing into it. */
function keepIn(w: World, k: Kid, m: V): V {
  const ahead = add(k.pos, mul(m, 1.2));
  if (inBounds(w.hill, ahead, 0.4)) return m;
  const b = w.hill.bounds;
  const out = { x: m.x, y: m.y };
  if (ahead.x < b.minX + 0.4 || ahead.x > b.maxX - 0.4) out.x = 0;
  if (ahead.y < b.minY + 0.4 || ahead.y > b.maxY - 0.4) out.y = 0;
  if (Math.hypot(out.x, out.y) < 0.2) return mul(norm(sub(w.hill.crown, k.pos)), 0.6);
  return out;
}

/** Who goes for a free sled. Beanie always; Pockets, then Copycat, once every Beanie has been chilled 3s+. */
export function isSeeker(w: World, k: Kid): boolean {
  if (!inPlay(k) || k.role === "brick") return false;
  if (k.role === "beanie") return true;
  const team = w.kids.filter((o) => o.team === k.team && o.bot);
  const beanies = team.filter((o) => o.role === "beanie");
  const beanieOut = beanies.every((o) => !inPlay(o) && w.t - o.chillAt >= FALLBACK_AFTER);
  if (!beanieOut) return false;
  const order = [...team.filter((o) => o.role === "pockets"), ...team.filter((o) => o.role === "copycat")];
  const first = order.find(inPlay);
  return first?.id === k.id;
}

function threatened(k: Kid, b: Ball) {
  if (dist(k.pos, b.to) <= RING_R + 0.35) return true;
  return b.kind === "plain" && distPointSeg(k.pos, b.pos, b.to) <= KID_R + BALL_R + 0.25;
}

/** FAIR-BOT: react only to committed rings seen in the facing arc, after the reaction time, at human speed. */
function updateDodge(w: World, k: Kid) {
  const due = k.reacts.filter((r) => r.at <= w.t);
  if (due.length) k.reacts = k.reacts.filter((r) => r.at > w.t);
  if (busy(k)) {
    k.dodge = null; // carriers and builders don't dodge
    return;
  }
  for (const r of due) {
    const b = w.balls.find((x) => x.id === r.ballId);
    if (!b || !threatened(k, b)) continue;
    const line = norm(sub(b.to, b.from));
    const n = perp(line);
    let side = Math.sign(dot(sub(k.pos, b.to), n)) || (w.rng.chance(0.5) ? 1 : -1);
    if (!inBounds(w.hill, add(k.pos, mul(n, side * 1.5)), 0.3)) side = -side;
    k.dodge = { dir: mul(n, side), ballId: b.id, startAt: w.t + DODGE_SLOP };
  }
  if (k.dodge) {
    const b = w.balls.find((x) => x.id === k.dodge!.ballId);
    // one step: just clear of the ring (and the flat line), then stop — misses should look near
    const clear = !b || (dist(k.pos, b.to) > RING_R + 0.15 && (b.kind !== "plain" || distPointSeg(k.pos, b.pos, b.to) > KID_R + BALL_R + 0.1));
    if (clear) k.dodge = null;
  }
}

function plainTarget(w: World, k: Kid): Kid | null {
  // ice shatters and rock smashes through walls, so those throwers don't need a clear line
  const through = k.kit.ball !== "plain";
  const range = k.kit.launcher ? 9 : PLAIN.range;
  const foes = enemiesOf(w, k.team).filter((e) => dist(e.pos, k.pos) <= range && (through || !lineBlocked(w, k.pos, e.pos)));
  const c = foes.find((e) => e.carrying);
  return c ?? nearest(k.pos, foes);
}

/** Aim where the target will be at touchdown if it keeps going (no mind-reading, just lead). */
export function lead(k: Kid, t: Kid, kind: BallKind): V {
  const spec = kind === "plain" ? PLAIN : BLOWER;
  let p = t.pos;
  for (let i = 0; i < 2; i++) p = add(t.pos, mul(t.seenVel, spec.base + spec.perM * dist(k.pos, p)));
  return p;
}

function throwPlain(w: World, k: Kid, it: Intent) {
  if (k.throwCd > 0) return;
  const t = plainTarget(w, k);
  if (t) it.throwAt = { p: lead(k, t, "plain"), kind: "plain", target: t.id };
}

function grab(w: World, k: Kid, it: Intent) {
  it.move = moveTo(w, k, w.sled.pos, 0);
  it.pickup = true;
}

/** A seen ring (after the read time) that this carrier is in, or whose flat line it stands on. */
function seenThreats(w: World, k: Kid): Ball[] {
  return w.balls.filter((b) => b.team !== k.team && b.t >= CARRIER_READ && threatened(k, b));
}

/** The direction (full carry speed) that best clears every seen ring, preferring to stay on the crown. */
export function escape(w: World, k: Kid): V | null {
  const threats = seenThreats(w, k);
  if (!threats.length) return null;
  const seen = w.balls.filter((b) => b.team !== k.team && b.t >= CARRIER_READ);
  let best: V | null = null, bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const d = fromAngle((i / 12) * Math.PI * 2);
    const p = add(k.pos, mul(d, 1.2));
    let clear = Infinity;
    for (const b of seen) {
      clear = Math.min(clear, dist(p, b.to) - b.ringR - KID_R);
      if (b.kind !== "blower") clear = Math.min(clear, distPointSeg(p, b.pos, b.to) - KID_R - BALL_R);
    }
    const off = Math.max(0, dist(p, w.hill.crown) - (CROWN_R - 0.3)); // stepping off the crown stops the score
    const score = Math.min(clear, 1.5) - off * 2 - (inBounds(w.hill, p, 0.3) ? 0 : 5);
    if (score > bestScore) (bestScore = score), (best = d);
  }
  return best;
}

function carry(w: World, k: Kid, it: Intent): Intent {
  const crown = w.hill.crown;
  const ne = nearest(k.pos, enemiesOf(w, k.team));
  if (w.siege?.carrier === k.id && dist(k.pos, crown) <= CROWN_R) {
    // under siege: read the rings (every ring is visible from release) and walk out of them,
    // otherwise keep walking irregularly inside the crown. Never a standing target.
    const esc = escape(w, k);
    if (esc) {
      it.move = esc;
      k.wanderTo = null;
      return it;
    }
    if (!k.wanderTo || w.t >= k.wanderAt || dist(k.pos, k.wanderTo) < 0.35) {
      k.wanderTo = add(crown, fromAngle(w.rng.range(0, Math.PI * 2), w.rng.range(0.3, CROWN_R * 0.8)));
      k.wanderAt = w.t + w.rng.range(CARRIER_WANDER[0], CARRIER_WANDER[1]);
    }
    it.move = norm(sub(k.wanderTo, k.pos)); // full carry speed, never a standing target
  } else if (dist(k.pos, crown) > 0.6) it.move = moveTo(w, k, crown, 0.3);
  if (ne && dist(k.pos, crown) <= 0.6) it.face = angleOf(sub(ne.pos, k.pos));
  return it;
}

/** A spot at siege range from the enemy carrier with a clear throwing line: flank around walls. */
function siegeSpot(w: World, k: Kid, c: Kid): V {
  const base = angleOf(sub(k.pos, c.pos));
  const needLine = k.kit.ball === "plain";
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8]) {
    const p = add(c.pos, fromAngle(base + off, SIEGE.standoff));
    if (inBounds(w.hill, p, 0.5) && (!needLine || !lineBlocked(w, p, c.pos))) return p;
  }
  return add(c.pos, fromAngle(base, SIEGE.standoff));
}

function beanie(w: World, k: Kid, it: Intent) {
  const c = carrier(w);
  if (!c) {
    if (isSeeker(w, k)) grab(w, k, it);
    else it.move = moveTo(w, k, w.sled.pos, 2);
  } else if (c.team === k.team) {
    // escort beside the carrier (Brick is the shield; standing in the throwing line isn't Beanie's job)
    const threat = nearest(c.pos, enemiesOf(w, k.team));
    const p = threat ? add(c.pos, mul(perp(norm(sub(threat.pos, c.pos))), 2.5)) : add(c.pos, v(0, 1.5));
    it.move = moveTo(w, k, p, 0.4);
  } else {
    // ring the enemy carrier at siege range with a clear line, ready for the drop
    it.move = moveTo(w, k, siegeSpot(w, k, c), 0.4);
  }
  // Beanie throws only when the sled has been off the crown 5s+
  if (w.t - w.lastOnCrown >= BEANIE_THROW_AFTER) throwPlain(w, k, it);
}

function pockets(w: World, k: Kid, it: Intent) {
  if (!carrier(w) && isSeeker(w, k)) {
    grab(w, k, it);
    return;
  }
  const foes = enemiesOf(w, k.team);
  const ec = foes.find((e) => e.carrying) ?? null;
  const ne = nearest(k.pos, foes);
  const look = ec ?? ne;
  if (look) it.face = angleOf(sub(look.pos, k.pos));
  // lob at the enemy carrier first, else the nearest kid in range
  if (k.throwCd <= 0 && k.blowerCd <= 0) {
    const t = ec && dist(ec.pos, k.pos) <= BLOWER.range ? ec : ne && dist(ne.pos, k.pos) <= BLOWER.range ? ne : null;
    if (t && dist(t.pos, k.pos) >= 3) it.throwAt = { p: lead(k, t, "blower"), kind: "blower", target: t.id };
  }
  if (!ne) {
    it.move = moveTo(w, k, w.hill.crown, 6);
    return;
  }
  const d = dist(k.pos, ne.pos);
  // a snowman out front does his back-line job for him
  if (k.kit.snowman && k.wallCd <= 0 && d <= 11 && buildSpot(w, k, angleOf(sub(ne.pos, k.pos))).legal) it.plant = angleOf(sub(ne.pos, k.pos));
  let m: V;
  if (d < 6) m = norm(sub(k.pos, ne.pos)); // backs off inside 6m
  else if (d > 10) m = norm(sub((ec ?? ne).pos, k.pos));
  else {
    // hold the 6-10m band, drifting sideways so the angle keeps changing
    const side = Math.floor(w.t / 3 + k.id) % 2 ? 1 : -1;
    m = mul(perp(norm(sub(ne.pos, k.pos))), 0.35 * side);
  }
  it.move = keepIn(w, k, m);
}

function brick(w: World, k: Kid, it: Intent) {
  const c = carrier(w);
  const myC = c && c.team === k.team ? c : null;
  const lead = myC ?? w.kids.find((o) => o.team === k.team && o.role === "beanie" && inPlay(o) && !o.isHuman) ?? null;
  const ref = lead ? lead.pos : w.hill.crown;
  const threat = nearest(ref, enemiesOf(w, k.team));
  if (!threat) {
    it.move = moveTo(w, k, ref, 1.5);
    return;
  }
  const dir = norm(sub(threat.pos, ref));
  it.face = angleOf(dir);
  const crown = w.hill.crown;
  let base = myC && dist(myC.pos, crown) <= CROWN_R + 1 ? add(crown, mul(dir, CROWN_R + 0.6)) : add(ref, mul(dir, 2.5));
  if (dist(base, w.sled.pos) < 2.5) base = add(w.sled.pos, mul(dir, 2.6));
  const stand = sub(base, mul(dir, WALL.offset));
  const wallGood = k.wall && dist(k.wall.c, base) < 1.6;
  if (wallGood) {
    it.move = moveTo(w, k, stand, 0.4);
  } else if (k.wallCd <= 0) {
    it.move = moveTo(w, k, stand, 0.3);
    if (dist(k.pos, stand) < 0.45 && wallSpot(w, k, angleOf(dir)).legal) it.plant = angleOf(dir);
  } else {
    // wall down: walk 2m ahead of the carrier as a shield
    it.move = moveTo(w, k, add(ref, mul(dir, 2)), 0.3);
  }
}

function copycat(w: World, k: Kid, it: Intent) {
  const h = human(w);
  if (!carrier(w) && (isSeeker(w, k) || k.copyGrabUntil > w.t)) {
    grab(w, k, it);
  } else {
    // default: mirror the human across the crown (movement only; he never initiates actions)
    const m = sub(w.hill.crown, sub(h.pos, w.hill.crown));
    const b = w.hill.bounds;
    const p = v(clamp(m.x, b.minX + 0.5, b.maxX - 0.5), clamp(m.y, b.minY + 0.5, b.maxY - 0.5));
    // ...but never closer than siege range to an enemy carrier
    const c = carrier(w);
    if (c && c.team !== k.team && dist(p, c.pos) < SIEGE.standoff) it.move = moveTo(w, k, siegeSpot(w, k, c), 0.4);
    else it.move = moveTo(w, k, p, 0.5);
  }
  it.face = angleOf(sub(h.pos, k.pos));
  const act = w.humanAct;
  if (act && act.seq > k.copiedSeq && w.t - act.t >= COPY_DELAY) {
    k.copiedSeq = act.seq;
    if (act.type === "throw" && k.throwCd <= 0) {
      const t = plainTarget(w, k) ?? nearest(k.pos, enemiesOf(w, k.team));
      if (t) it.throwAt = { p: lead(k, t, "plain"), kind: "plain", target: t.id };
    } else if (act.type === "wall" && k.wallCd <= 0 && !k.carrying) {
      const ne = nearest(k.pos, enemiesOf(w, k.team));
      const a = ne ? angleOf(sub(ne.pos, k.pos)) : k.facing;
      if (wallSpot(w, k, a).legal) it.plant = a;
    } else if (act.type === "grab") {
      k.copyGrabUntil = w.t + 3;
    }
  }
}

export function think(w: World, k: Kid): Intent {
  const it = idle();
  if (!inPlay(k)) return it;
  if (k.planting > 0) return it;
  updateDodge(w, k);
  if (k.dodge) {
    it.move = w.t >= k.dodge.startAt ? k.dodge.dir : v();
    return it;
  }
  if (k.carrying) return carry(w, k, it);
  // launcher burst in progress: keep spraying at the same kid
  if (k.burstUntil > w.t && k.burstTarget >= 0 && inPlay(w.kids[k.burstTarget])) {
    const t = w.kids[k.burstTarget];
    it.throwAt = { p: lead(k, t, "plain"), kind: "plain", target: t.id };
  }
  // melter: go thaw a chilled teammate nearby (unless the sled is loose and it's my job)
  if (k.kit.melter && k.thawCd <= 0 && !(isSeeker(w, k) && !carrier(w))) {
    const frozen = w.kids.filter((o) => o.team === k.team && o !== k && (o.state === "chilled" || o.state === "toStand") && dist(o.pos, k.pos) <= 6);
    const f = nearest(k.pos, frozen);
    if (f) {
      it.move = moveTo(w, k, f.pos, 0);
      return it;
    }
  }
  if (k.role === "beanie") beanie(w, k, it);
  else if (k.role === "pockets") pockets(w, k, it);
  else if (k.role === "brick") brick(w, k, it);
  else copycat(w, k, it);
  return it;
}
