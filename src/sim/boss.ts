// Boss bout: Frosty (design doc, "Boss bout: Frosty", merged spec). A bonus after a match:
// your kid alone against Frosty on the crown, 60s, streetlights on, plain snowballs only.
//   10 hits melt him; his normal throws take 1 of your 3 (knockback + cancelled throw, never the stand).
//   Specials at 15/30/45s: a 0.5s mitten sweep moves the two mounds, a 2.5s snowflake swirl warns,
//   then a gapless Blizzard Burst (or, from 5 hits left, a Double Blizzard: two bursts 1.5s apart).
//   A burst is an instant loss unless you're in a drawn safe zone behind a mound. 2s dizzy after each.
import { BALL_R, BLOWER, DT, KID_ACCEL, KID_R, KID_SPEED, PLAIN, RING_R } from "./const";
import { inBounds, type Hill } from "./hill";
import type { Recorder } from "./log";
import { add, angleDiff, angleOf, clamp, dist, distPointSeg, fromAngle, len, lerp, mul, norm, perp, Rng, sub, v, type V } from "./math";
import type { HumanInput, Kid } from "./types";
import { makeKid } from "./world";

export const FROSTY = {
  len: 60, // never the host's to tune away (doc): the 60s clock
  hp: 10, // hits to melt him (host's call)
  lives: 3, // his hits you can take
  body: 1.0, // GREYBOX: Frosty's body radius (big and easy to hit)
  specials: [15, 30, 45],
  doubleFrom: 5, // Double Blizzard once he has this many hits left
  sweep: 0.5, // mitten sweep: old mounds sink, new ones rise
  swirl: 2.5, // the warning; never shorter (doc)
  burstGap: 1.5, // Double Blizzard: second burst this long after the first
  burstSpeed: 16, // GREYBOX m/s: how fast the burst ring travels out
  dizzy: 2, // free throws after each special
  volleyEvery: 2.4, // GREYBOX: normal volley cadence (lead + direct + lob)
  firstVolley: 2.5,
  exit: 1.8, // the lob lands this far out on the obvious exit
  knock: 1.5, // knockback when he hits you (m)
  stun: 0.4, // no control after a hit
  windup: 0.45, // GREYBOX: your throw plants you this long before release (a hit cancels it)
  scoop: 2.0, // GREYBOX: packing the next ball. The doc's budget is ~1 hit per 2.5s; at the field's
  //            1.2s, ten throws melt him in 12s, before his first special at 15s.
  mound: { r: 0.9, nearKid: [5, 7], fromFrosty: [3.5, 8], inset: 0.15 },
};

export type BoutPhase = "normal" | "sweep" | "swirl" | "burst" | "dizzy";
export type BoutOutcome = "melted" | "time" | "hits" | "blizzard";

export interface Mound {
  pos: V;
  r: number;
  grow: number; // 0..1 (sinks / rises during the sweep); solid only when 1
  dir: 1 | -1; // rising or sinking
}

export interface BoutBall {
  id: number;
  mine: boolean; // thrown by the kid
  kind: "plain" | "blower";
  pellet: false;
  from: V;
  to: V;
  pos: V;
  t: number;
  T: number;
  ringR: number;
}

export interface Special {
  idx: number;
  kind: "burst" | "double";
  start: number;
  releases: number[]; // burst release times
  checked: boolean[]; // has this burst's front passed the kid yet
  safeAt: number; // first time the kid stood in a safe zone after the swirl began (-1 never)
}

export type BoutEvent =
  | { type: "throw"; p: V; mine: boolean; kind: "plain" | "blower" }
  | { type: "frostyHit"; p: V; left: number }
  | { type: "kidHit"; p: V; lives: number }
  | { type: "splat"; p: V }
  | { type: "miss"; p: V }
  | { type: "sweep" }
  | { type: "swirl"; step: number } // 0..4, every half second of the warning
  | { type: "burst" }
  | { type: "dizzy" }
  | { type: "tick"; left: number }
  | { type: "over"; outcome: BoutOutcome };

export interface Bout {
  hill: Hill;
  rng: Rng;
  t: number;
  over: BoutOutcome | null;
  overAt: number;
  frosty: V;
  hits: number; // landed on Frosty
  lives: number;
  kid: Kid;
  stunned: number;
  knockVel: V;
  windup: number; // seconds left on the kid's throw wind-up (0 = none)
  windupAim: V;
  mounds: Mound[];
  balls: BoutBall[];
  special: Special | null;
  nextSpecial: number; // index into FROSTY.specials
  nextVolley: number;
  dizzyUntil: number;
  throwPose: number; // Frosty's throw anim timer
  lastThrow: number; // the kid's last throw (for the throw gap across a special)
  gapFrom: number; // last kid throw before the current special (-1 = none pending)
  nextId: number;
  events: BoutEvent[];
  log: Recorder;
}

const SPAWN = v(-9, 0);

export function createBout(hill: Hill, seed: number, log: Recorder): Bout {
  const kid = makeKid(0, "You", 0, "beanie", true, false, { ...SPAWN }, 0);
  const b: Bout = {
    hill, rng: new Rng(seed * 2654435761 + 17), t: 0, over: null, overAt: 0,
    frosty: { ...hill.crown }, hits: 0, lives: FROSTY.lives, kid, stunned: 0, knockVel: v(), windup: 0, windupAim: v(),
    mounds: [], balls: [], special: null, nextSpecial: 0, nextVolley: FROSTY.firstVolley,
    dizzyUntil: 0, throwPose: 0, lastThrow: -99, gapFrom: -1, nextId: 1, events: [], log,
  };
  b.mounds = placeMounds(b).map((pos) => ({ pos, r: FROSTY.mound.r, grow: 1, dir: 1 as const }));
  log.add("bout_start", 0, { note: `seed ${seed}` });
  return b;
}

// ---------------------------------------------------------------- geometry

/** The kid stands in the drawn safe zone behind this mound (a shadow cone away from Frosty). */
export function safeBehind(b: Bout, m: Mound, p: V): boolean {
  if (m.grow < 1) return false;
  const dm = dist(b.frosty, m.pos);
  if (dist(b.frosty, p) <= dm) return false;
  return angleDiff(angleOf(sub(p, b.frosty)), angleOf(sub(m.pos, b.frosty))) <= safeHalfAngle(b, m);
}

export const safeHalfAngle = (b: Bout, m: Mound) => Math.asin(clamp((m.r - FROSTY.mound.inset) / dist(b.frosty, m.pos), 0, 1));
export const isSafe = (b: Bout, p: V) => b.mounds.some((m) => safeBehind(b, m, p));

/** Where a burst snowball travelling at angle `a` stops: the first solid mound, or far away. */
export function burstStop(b: Bout, a: number): number {
  let stop = 40;
  for (const m of b.mounds) {
    if (m.grow < 1) continue;
    const dm = dist(b.frosty, m.pos);
    const off = angleDiff(a, angleOf(sub(m.pos, b.frosty)));
    const perpD = dm * Math.sin(off);
    if (off < Math.PI / 2 && Math.abs(perpD) < m.r) stop = Math.min(stop, dm * Math.cos(off) - Math.sqrt(m.r * m.r - perpD * perpD));
  }
  return stop;
}

/** First contact param (0..1) of a point moving p1->p2 against a circle, or -1. */
function segCircle(p1: V, p2: V, c: V, r: number): number {
  const d = sub(p2, p1), f = sub(p1, c);
  const a = d.x * d.x + d.y * d.y;
  const bq = 2 * (f.x * d.x + f.y * d.y);
  const cq = f.x * f.x + f.y * f.y - r * r;
  if (cq <= 0) return 0;
  if (a < 1e-9) return -1;
  const disc = bq * bq - 4 * a * cq;
  if (disc < 0) return -1;
  const t = (-bq - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

function goodMound(b: Bout, p: V): boolean {
  const d = dist(b.frosty, p);
  const [lo, hi] = FROSTY.mound.fromFrosty;
  if (d < lo || d > hi || !inBounds(b.hill, p, 1.2)) return false;
  // there must be room to hide behind it
  return inBounds(b.hill, add(p, mul(norm(sub(p, b.frosty)), FROSTY.mound.r + 1)), 0.4);
}

/** Two mounds, random, but one always 5-7m from the kid so the run always fits (doc). */
function placeMounds(b: Bout): V[] {
  const K = b.kid.pos, F = b.frosty;
  const [n0, n1] = FROSTY.mound.nearKid;
  for (let i = 0; i < 400; i++) {
    const m1 = add(K, fromAngle(b.rng.range(0, Math.PI * 2), b.rng.range(n0, n1)));
    if (!goodMound(b, m1)) continue;
    for (let j = 0; j < 80; j++) {
      const [lo, hi] = FROSTY.mound.fromFrosty;
      const m2 = add(F, fromAngle(b.rng.range(0, Math.PI * 2), b.rng.range(lo, hi)));
      if (!goodMound(b, m2) || dist(m1, m2) < 5 || dist(m2, K) < 2.5) continue;
      if (angleDiff(angleOf(sub(m1, F)), angleOf(sub(m2, F))) < 1.0) continue;
      return [m1, m2];
    }
  }
  return [v(-5, -3), v(5, 3)];
}

// ---------------------------------------------------------------- throws

const flight = (kind: "plain" | "blower", d: number) => (kind === "blower" ? BLOWER.base + BLOWER.perM * d : PLAIN.base + PLAIN.perM * d);

function throwBall(b: Bout, mine: boolean, from: V, to: V, kind: "plain" | "blower") {
  const range = kind === "blower" ? BLOWER.range : PLAIN.range;
  if (dist(from, to) > range) to = add(from, mul(norm(sub(to, from)), range));
  const ball: BoutBall = { id: b.nextId++, mine, kind, pellet: false, from: { ...from }, to, pos: { ...from }, t: 0, T: flight(kind, dist(from, to)), ringR: RING_R };
  b.balls.push(ball);
  b.events.push({ type: "throw", p: from, mine, kind });
}

/** Lead ring + direct ring + a lob on the obvious exit, all on one frame. */
function volley(b: Bout) {
  const k = b.kid, F = b.frosty;
  const d = dist(F, k.pos);
  const lead = add(k.pos, mul(k.seenVel, flight("plain", d)));
  const direct = { ...k.pos };
  const centre = lerp(lead, direct, 0.5);
  const away = dist(centre, k.pos) > 0.3 ? norm(sub(k.pos, centre)) : perp(norm(sub(k.pos, F)));
  const side = b.rng.chance(0.5) ? 1 : -1;
  const exit = add(k.pos, mul(dist(centre, k.pos) > 0.3 ? away : mul(away, side), FROSTY.exit));
  const hand = (to: V) => add(F, mul(norm(sub(to, F)), FROSTY.body));
  throwBall(b, false, hand(lead), lead, "plain");
  if (dist(lead, direct) > 0.6) throwBall(b, false, hand(direct), direct, "plain");
  throwBall(b, false, hand(exit), exit, "blower");
  b.throwPose = 0.35;
}

function hitKid(b: Bout) {
  const k = b.kid;
  b.lives--;
  b.stunned = FROSTY.stun;
  if (b.windup > 0) (b.windup = 0), (k.throwCd = FROSTY.scoop); // the throw you were winding up is gone
  b.knockVel = mul(norm(sub(k.pos, b.frosty)), FROSTY.knock / 0.25);
  b.events.push({ type: "kidHit", p: { ...k.pos }, lives: b.lives });
  b.log.add("bout_taken", b.t, { note: "normal", kid: 0 });
  if (b.lives <= 0) end(b, "hits");
}

function hitFrosty(b: Bout, p: V) {
  b.hits++;
  b.events.push({ type: "frostyHit", p, left: FROSTY.hp - b.hits });
  b.log.add("bout_hit", b.t, { note: `hit ${b.hits}` });
  if (b.hits >= FROSTY.hp) end(b, "melted");
}

function updateBalls(b: Bout) {
  const k = b.kid;
  for (const ball of b.balls) {
    const prev = ball.pos;
    ball.t = Math.min(ball.T, ball.t + DT);
    const next = lerp(ball.from, ball.to, ball.t / ball.T);
    let dead = false;
    if (ball.kind === "plain") {
      // flat: first contact in flight. Mounds stop it; Frosty or the kid take it.
      let best = 2, what: "mound" | "frosty" | "kid" | null = null;
      for (const m of b.mounds) {
        if (m.grow < 1) continue;
        const s = segCircle(prev, next, m.pos, m.r + BALL_R);
        if (s >= 0 && s < best) (best = s), (what = "mound");
      }
      if (ball.mine) {
        const s = segCircle(prev, next, b.frosty, FROSTY.body + BALL_R);
        if (s >= 0 && s < best) (best = s), (what = "frosty");
      } else if (!b.over) {
        const s = segCircle(prev, next, k.pos, KID_R + BALL_R);
        if (s >= 0 && s < best) (best = s), (what = "kid");
      }
      if (what) {
        const p = lerp(prev, next, best);
        dead = true;
        if (what === "mound") b.events.push({ type: "splat", p });
        else if (what === "frosty") hitFrosty(b, p);
        else hitKid(b);
      }
    }
    ball.pos = next;
    if (!dead && ball.t >= ball.T) {
      dead = true;
      if (ball.mine && dist(ball.to, b.frosty) <= RING_R + FROSTY.body * 0.6) hitFrosty(b, ball.to);
      else if (!ball.mine && !b.over && dist(ball.to, k.pos) <= ball.ringR) hitKid(b);
      else b.events.push({ type: "miss", p: ball.to });
    }
    if (dead) ball.t = -1;
  }
  b.balls = b.balls.filter((x) => x.t >= 0);
}

// ---------------------------------------------------------------- specials

export function boutPhase(b: Bout): BoutPhase {
  const s = b.special;
  if (s) {
    const e = b.t - s.start;
    if (e < FROSTY.sweep) return "sweep";
    if (e < FROSTY.sweep + FROSTY.swirl) return "swirl";
    return "burst";
  }
  return b.t < b.dizzyUntil ? "dizzy" : "normal";
}

function startSpecial(b: Bout) {
  const idx = b.nextSpecial++;
  const kind = FROSTY.hp - b.hits <= FROSTY.doubleFrom ? "double" : "burst";
  const start = b.t;
  const rel = start + FROSTY.sweep + FROSTY.swirl;
  b.special = { idx, kind, start, releases: kind === "double" ? [rel, rel + FROSTY.burstGap] : [rel], checked: [], safeAt: -1 };
  // the old mounds sink while the new ones rise: puffs show where, before the swirl begins
  const next = placeMounds(b);
  for (const m of b.mounds) m.dir = -1;
  b.mounds.push(...next.map((pos) => ({ pos, r: FROSTY.mound.r, grow: 0, dir: 1 as const })));
  b.gapFrom = b.lastThrow;
  b.events.push({ type: "sweep" });
  b.log.add("bout_special", b.t, { note: `${kind} #${idx + 1}`, ring_x: next[0].x, ring_y: next[0].y });
}

function updateSpecial(b: Bout) {
  const s = b.special!;
  const e = b.t - s.start;
  // mounds: sink / rise over the sweep, then locked
  for (const m of b.mounds) m.grow = clamp(m.grow + (m.dir * DT) / FROSTY.sweep, 0, 1);
  b.mounds = b.mounds.filter((m) => !(m.dir === -1 && m.grow <= 0));
  // the warning swirl gets bigger and louder each half second
  const sw = e - FROSTY.sweep;
  if (sw >= 0 && sw < FROSTY.swirl) {
    const step = Math.floor(sw / 0.5);
    if (Math.floor((sw - DT) / 0.5) !== step || sw < DT) b.events.push({ type: "swirl", step });
    if (s.safeAt < 0 && isSafe(b, b.kid.pos)) {
      s.safeAt = b.t;
      b.log.add("bout_safe", b.t, { secs: b.t - (s.start + FROSTY.sweep), note: s.kind });
    }
  }
  s.releases.forEach((r, i) => {
    if (b.t >= r && b.t - DT < r) b.events.push({ type: "burst" });
    // the front reaches the kid: anywhere outside a safe zone is an instant loss
    if (!s.checked[i] && b.t >= r && FROSTY.burstSpeed * (b.t - r) >= dist(b.frosty, b.kid.pos) - KID_R) {
      s.checked[i] = true;
      if (!b.over && !isSafe(b, b.kid.pos)) {
        b.log.add("bout_taken", b.t, { note: `special ${s.kind} burst ${i + 1}`, kid: 0 });
        end(b, "blizzard");
      }
    }
  });
  const last = s.releases[s.releases.length - 1];
  if (b.t >= last + 1.0) {
    if (s.safeAt < 0) b.log.add("bout_safe", b.t, { note: `${s.kind} never` });
    b.special = null;
    b.dizzyUntil = b.t + FROSTY.dizzy;
    b.nextVolley = b.dizzyUntil + 0.6;
    b.events.push({ type: "dizzy" });
  }
}

// ---------------------------------------------------------------- the kid

function moveKid(b: Bout, inp: HumanInput) {
  const k = b.kid;
  const want = b.stunned > 0 || b.windup > 0 || b.over ? v() : mul(len(inp.move) > 1 ? norm(inp.move) : inp.move, KID_SPEED);
  const dv = sub(want, k.vel);
  const step = KID_ACCEL * DT;
  k.vel = len(dv) <= step ? want : add(k.vel, mul(norm(dv), step));
  let p = add(k.pos, mul(k.vel, DT));
  if (b.knockVel.x || b.knockVel.y) {
    p = add(p, mul(b.knockVel, DT));
    b.knockVel = len(b.knockVel) < 0.5 ? v() : mul(b.knockVel, 0.85);
  }
  // solid: Frosty's body and formed mounds; the field edge
  const push = (c: V, r: number) => {
    const d = dist(p, c);
    if (d < r) p = add(c, mul(d > 1e-6 ? norm(sub(p, c)) : v(1, 0), r));
  };
  push(b.frosty, FROSTY.body + KID_R);
  for (const m of b.mounds) if (m.grow >= 1) push(m.pos, m.r + KID_R);
  const bd = b.hill.bounds;
  p = v(clamp(p.x, bd.minX + KID_R, bd.maxX - KID_R), clamp(p.y, bd.minY + KID_R, bd.maxY - KID_R));
  const moved = mul(sub(p, k.pos), 1 / DT);
  k.seenVel = lerp(k.seenVel, moved, 0.12);
  k.pos = p;
  if (len(k.vel) > 0.4) k.facing = angleOf(k.vel);
}

function end(b: Bout, outcome: BoutOutcome) {
  if (b.over) return;
  b.over = outcome;
  b.overAt = b.t;
  b.kid.vel = v();
  b.events.push({ type: "over", outcome });
  b.log.add("bout_end", b.t, { note: `${outcome} hits=${b.hits} lives=${b.lives}` });
}

// ---------------------------------------------------------------- step

export function stepBout(b: Bout, inp: HumanInput) {
  b.events.length = 0;
  b.t += DT;
  const k = b.kid;
  k.throwCd = Math.max(0, k.throwCd - DT);
  k.throwPose = Math.max(0, k.throwPose - DT);
  b.stunned = Math.max(0, b.stunned - DT);
  b.throwPose = Math.max(0, b.throwPose - DT);

  if (!b.over) {
    const left = Math.ceil(FROSTY.len - b.t);
    if (left <= 10 && left > 0 && Math.ceil(FROSTY.len - (b.t - DT)) !== left) b.events.push({ type: "tick", left });

    // the kid throws: plain snowballs only, no building
    if (inp.throwPressed && k.throwCd <= 0 && b.windup <= 0 && b.stunned <= 0) {
      b.windup = FROSTY.windup;
      b.windupAim = { ...inp.aim };
      k.facing = angleOf(sub(inp.aim, k.pos));
    }
    if (b.windup > 0 && (b.windup -= DT) <= 0) {
      b.windup = 0;
      const to = b.windupAim;
      throwBall(b, true, k.pos, to, "plain");
      k.throwCd = FROSTY.scoop;
      k.throwPose = 0.3;
      k.facing = angleOf(sub(to, k.pos));
      if (b.gapFrom >= 0 && !b.special) {
        b.log.add("bout_gap", b.t, { secs: b.t - b.gapFrom });
        b.gapFrom = -1;
      }
      b.lastThrow = b.t;
    }

    if (!b.special && b.nextSpecial < FROSTY.specials.length && b.t >= FROSTY.specials[b.nextSpecial]) startSpecial(b);
    if (b.special) updateSpecial(b);
    else if (b.t >= b.dizzyUntil && b.t >= b.nextVolley) {
      volley(b);
      b.nextVolley = b.t + FROSTY.volleyEvery;
    }
  }

  moveKid(b, inp);
  updateBalls(b);
  if (!b.over && b.t >= FROSTY.len) end(b, "time");
}

// ---------------------------------------------------------------- stand-in (headless tuning)

/** A decent player: hides on time, throws from the open, steps out of rings they've read. */
export function boutBot(b: Bout, read = 0.45): HumanInput {
  const k = b.kid, F = b.frosty;
  const none: HumanInput = { move: v(), aim: F, throwPressed: false, throwHeld: false, wallPressed: false };
  const ph = boutPhase(b);
  if (ph === "sweep" || ph === "swirl" || ph === "burst") {
    // run for the nearest safe spot behind a rising mound, around it if it's in the way
    const ms = b.mounds.filter((m) => m.dir === 1);
    let best: V | null = null, bd = Infinity, via: V | null = null;
    for (const m of ms) {
      const out = norm(sub(m.pos, F));
      const spot = add(m.pos, mul(out, m.r + 0.8));
      const d = dist(k.pos, spot);
      if (d < bd) {
        bd = d;
        best = spot;
        via = distPointSeg(m.pos, k.pos, spot) < m.r + KID_R + 0.1 ? add(m.pos, mul(perp(out), (Math.sign((k.pos.x - m.pos.x) * -out.y + (k.pos.y - m.pos.y) * out.x) || 1) * (m.r + 0.9))) : null;
      }
    }
    if (!best) return none;
    const goal = via && dist(k.pos, via) > 0.4 ? via : best;
    return { ...none, move: dist(k.pos, goal) < 0.2 ? v() : norm(sub(goal, k.pos)) };
  }
  // dodge any ring read so far
  const seen = b.balls.filter((x) => !x.mine && x.t >= read);
  const threat = seen.some((x) => dist(k.pos, x.to) <= x.ringR + 0.35 || (x.kind === "plain" && distPointSeg(k.pos, x.pos, x.to) <= KID_R + BALL_R + 0.25));
  let move: V;
  if (threat) {
    let bestD = v(), bestS = -Infinity;
    for (let i = 0; i < 12; i++) {
      const d = fromAngle((i / 12) * Math.PI * 2);
      const p = add(k.pos, mul(d, 1.2));
      let c = 2;
      for (const x of seen) {
        c = Math.min(c, dist(p, x.to) - x.ringR - KID_R);
        if (x.kind === "plain") c = Math.min(c, distPointSeg(p, x.pos, x.to) - KID_R - BALL_R);
      }
      const s = c - (inBounds(b.hill, p, 0.5) ? 0 : 5) - Math.abs(dist(p, F) - 8) * 0.2;
      if (s > bestS) (bestS = s), (bestD = d);
    }
    move = bestD;
  } else {
    // hold ~8m out, drifting sideways so the lead ring keeps missing
    const r = norm(sub(k.pos, F));
    const hold = add(F, mul(r, 8));
    const drift = mul(perp(r), Math.floor(b.t / 1.1) % 2 ? 0.7 : -0.7);
    move = add(mul(sub(hold, k.pos), 0.5), drift);
    if (len(move) > 1) move = norm(move);
  }
  const clear = !b.mounds.some((m) => m.grow >= 1 && distPointSeg(m.pos, k.pos, F) < m.r + BALL_R);
  // throw in his rhythm: nothing of his in the air, and his next volley isn't due mid-wind-up
  const calm = !b.balls.some((x) => !x.mine) && (b.nextVolley - b.t > FROSTY.windup + 0.1 || b.t < b.dizzyUntil);
  return { ...none, move, throwPressed: calm && k.throwCd <= 0 && b.windup <= 0 && clear && dist(k.pos, F) <= PLAIN.range };
}
