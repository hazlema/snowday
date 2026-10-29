import { idle, think, type Intent } from "./ai";
import {
  BALL_R,
  BLOWER,
  BLOWER_CD,
  CARRY_MUL,
  CREDITS,
  ICE,
  LAUNCHER,
  MELT_R,
  PELLET,
  ROCK_KNOCK,
  SNOWMAN,
  THAW_CD,
  THAW_R,
  CHILL_FREEZE,
  CHILL_OUT,
  CROWN_R,
  DT,
  DUSK_STEPS,
  FRONT_ARC,
  KID_ACCEL,
  KID_R,
  KID_SPEED,
  PICKUP_R,
  PLAIN,
  RING_R,
  ROUND_LEN,
  SIEGE,
  SD_CAP,
  SD_HOLD,
  SKID_MAX,
  SKID_MIN,
  THROW_CD,
  BOT_THROW_JITTER,
  WALL,
} from "./const";
import type { Recorder } from "./log";
import { add, angleDiff, angleOf, clamp, dist, distPointSeg, dot, fromAngle, lerp, mul, norm, perp, Rng, sub, sweepHit, v, type V } from "./math";
import { buildSpot, busy, carrier, enemiesOf, handoffTarget, inPlay, lineBlocked, nearest, ringOn, snowmanLegal, wallSpot } from "./query";
import { planVolley, siegeCarrier, siegeCfg } from "./siege";
import { defaultKit } from "./shop";
import type { Ball, BallKind, HumanInput, Kid, Kit, Role, RoundCfg, Snowman, Team, Wall, World } from "./types";

export const CHESTNUT = { name: "Chestnut", allies: ["Pip", "Scoop", "Waffle"] as const };
const CHESTNUT_ROLES: Role[] = ["beanie", "pockets", "brick"]; // Pip, Scoop, Waffle
export const ROLE_NAME: Record<Role, string> = { beanie: "Beanie", pockets: "Pockets", brick: "Brick", copycat: "Copycat" };
const HAT: Record<Role, Kid["hat"]> = { beanie: "beanie", pockets: "cap", brick: "mitten", copycat: "trapper" };

export function makeKid(id: number, name: string, team: Team, role: Role, isHuman: boolean, bot: boolean, pos: V, facing: number): Kid {
  return {
    id, name, team, role, isHuman, bot,
    hat: isHuman ? "trapper" : HAT[role],
    pos, vel: v(), seenVel: v(), facing,
    state: "play", stateT: 0, chillAt: -99, returnAt: -99, chills: 0,
    carrying: false, planting: 0, plantSpot: null, plantKind: "wall",
    wallCd: 0, throwCd: 0, blowerCd: 0, wall: null, snowman: null,
    kit: defaultKit(), credits: 0, earned: 0, crownAcc: 0,
    hopper: LAUNCHER.hopper, launchCd: 0, thawCd: 0, lastFire: -99, refillT: 0, reloading: 0, burstUntil: 0, burstTarget: -1,
    throwPose: 0, waving: false,
    dodge: null, reacts: [], copiedSeq: 0, copyGrabUntil: 0, thinkT: 0, wanderAt: 0, wanderTo: null,
  };
}

/** Porch spawn: 4 kids emerge in a 1.2m arc, front-centre first (the human on Chestnut). */
function spawnSpots(porch: V, inward: V): V[] {
  const a = angleOf(inward);
  return [
    add(porch, fromAngle(a, 1.6)),
    add(porch, fromAngle(a - 1.05, 1.2)),
    add(porch, fromAngle(a + 1.05, 1.2)),
    add(porch, fromAngle(a, 0.5)),
  ];
}

export function createRound(cfg: RoundCfg, log: Recorder): World {
  const h = cfg.hill;
  const kids: Kid[] = [];
  const inC = norm(sub(h.crown, h.porch[0]));
  const inR = norm(sub(h.crown, h.porch[1]));
  const sc = spawnSpots(h.porch[0], inC);
  const sr = spawnSpots(h.porch[1], inR);
  kids.push(makeKid(0, "You", 0, "beanie", true, cfg.humanBot, sc[0], angleOf(inC)));
  CHESTNUT_ROLES.forEach((r, i) => kids.push(makeKid(kids.length, CHESTNUT.allies[i], 0, r, false, true, sc[i + 1], angleOf(inC))));
  cfg.rival.forEach((r, i) => kids.push(makeKid(kids.length, ROLE_NAME[r], 1, r, false, true, sr[i], angleOf(inR))));

  kids.forEach((k, i) => {
    if (cfg.kits?.[i]) k.kit = { ...cfg.kits[i] };
    if (cfg.credits?.[i] !== undefined) k.credits = cfg.credits[i];
  });

  log.round = cfg.round;
  const w: World = {
    cfg, hill: h, rng: new Rng(cfg.seed * 7919 + cfg.round * 104729 + 1),
    t: 0, phase: "play", sdT: 0, sdHold: { team: -1, t: 0 }, winner: -1,
    score: [0, 0], kids, balls: [], rest: [], walls: [], snowmen: [],
    siege: null, volleyN: [0, 0], lastVolleyChill: [-9, -9],
    sled: { pos: { ...(cfg.round === 0 ? h.sledR1 : h.sledFoot) }, carrier: -1, lastTeam: -1, noPickupUntil: 0 },
    events: [{ type: "whistle" }], nextId: 1, duskStep: 0, crownPulse: 0,
    lastOnCrown: 0, handoffTarget: -1, humanAct: null, log,
    stats: {
      crownTime: 0, possChanges: [0, 0, 0, 0, 0, 0, 0], handoffs: [0, 0, 0, 0, 0, 0, 0],
      holdTeam: -1, holdStart: 0, longestHold: 0, freeSince: 0, longestFree: 0,
      carrySecs: {}, humanOut: 0, humanFirstTouch: -1, silentPresses: 0, silentPressesTotal: 0,
      firstHandoff: -1, wallPresses: 0, wallPressesCooldown: 0, wallPressesIllegal: 0, lastSecond: -1,
      holds: [], volleyChills: 0, backToBack: 0, chillsBy: { plain: 0, launcher: 0, other: 0 },
    },
  };
  return w;
}

const bucket = (t: number) => Math.min(6, Math.floor(t / 30));

export const roundLen = (w: World) => w.cfg.roundLen ?? ROUND_LEN;

// ---------------------------------------------------------------- human

function humanIntent(w: World, k: Kid, inp: HumanInput | null): Intent {
  const it = idle();
  if (!inp || !inPlay(k)) return it;
  it.pickup = true;
  const m = Math.hypot(inp.move.x, inp.move.y);
  it.move = m > 1 ? mul(inp.move, 1 / m) : inp.move;
  if (dist(inp.aim, k.pos) > 0.2) it.face = angleOf(sub(inp.aim, k.pos));
  const ht = k.carrying ? handoffTarget(w, k, inp.aim) : null;
  w.handoffTarget = ht ? ht.id : -1;
  if (inp.throwPressed && k.carrying) it.handoff = true;
  else if (!k.carrying && (inp.throwPressed || (k.kit.launcher && inp.throwHeld))) {
    // the launcher sprays while held; otherwise one throw per press
    const ring = clampRange(k.pos, inp.aim, k.kit.launcher ? PELLET.range : PLAIN.range);
    const t = nearest(ring, enemiesOf(w, k.team).filter((e) => dist(e.pos, ring) <= RING_R + 1.5));
    it.throwAt = { p: ring, kind: "plain", target: t ? t.id : -1 };
  }
  if (inp.wallPressed) it.plant = it.face ?? k.facing;
  return it;
}

function clampRange(from: V, to: V, range: number): V {
  const d = dist(from, to);
  return d <= range ? { ...to } : add(from, mul(norm(sub(to, from)), range));
}

function noteHumanAct(w: World, k: Kid, type: "throw" | "wall" | "grab") {
  if (!k.isHuman) return;
  w.humanAct = { seq: (w.humanAct?.seq ?? 0) + 1, type, t: w.t };
}

// ---------------------------------------------------------------- actions

/** Build a ball in flight. Every ball's ring is committed and visible from launch. */
function makeBall(w: World, owner: number, team: Team, from: V, p: V, kind: BallKind, pellet: boolean, targetId: number, facing: number): Ball {
  const spec = pellet ? PELLET : kind === "ice" ? ICE : kind === "blower" ? BLOWER : PLAIN;
  let to = clampRange(from, p, spec.range);
  if (dist(from, to) < 1) to = add(from, fromAngle(facing, 1));
  if (pellet) {
    const sp = (LAUNCHER.spread * dist(from, to)) / PELLET.range;
    to = add(to, fromAngle(w.rng.range(0, Math.PI * 2), w.rng.range(0, sp)));
  }
  const d = dist(from, to);
  const tgt = targetId >= 0 ? w.kids[targetId] : null;
  const ringR = pellet ? PELLET.ring : RING_R;
  const b: Ball = {
    id: w.nextId++, owner, team, kind, pellet, ringR, smashed: [],
    from: { ...from }, to, t: 0, T: (spec.base + spec.perM * d) * (pellet && kind === "ice" ? 0.75 : 1), pos: { ...from },
    target: targetId,
    targetDist: tgt ? dist(from, tgt.pos) : -1,
    targetFront: tgt ? angleDiff(tgt.facing, angleOf(sub(from, tgt.pos))) <= FRONT_ARC : false,
    targetBusy: tgt ? busy(tgt) : false,
    targetInRing: tgt ? dist(tgt.pos, to) <= ringR : false,
    closest: Infinity,
    volley: -1,
  };
  w.balls.push(b);
  w.events.push({ type: "throw", p: { ...from }, kind, pellet });
  // fair-bot perception: enemy bots see the committed ring only if the thrower is in their facing arc
  for (const e of enemiesOf(w, team)) {
    if (!e.bot) continue;
    if (angleDiff(e.facing, angleOf(sub(from, e.pos))) <= FRONT_ARC) e.reacts.push({ ballId: b.id, at: w.t + w.cfg.reaction });
  }
  return b;
}

/** A kid's throw. "plain" means "my snowball": whatever the garage loaded (plain, ice or rock),
 *  unless `bare`: siege volleys always throw the street's listed rings, never a bot's purchases (rule 4). */
function doThrow(w: World, k: Kid, p: V, kind: BallKind, targetId: number, bare = false): Ball {
  const real: BallKind = kind === "plain" && !bare ? k.kit.ball : kind;
  const b = makeBall(w, k.id, k.team, k.pos, p, real, false, targetId, k.facing);
  k.throwCd = THROW_CD + (k.bot ? w.rng.range(0, BOT_THROW_JITTER) : 0);
  if (kind === "blower") k.blowerCd = BLOWER_CD;
  k.throwPose = 0.3;
  k.facing = angleOf(sub(b.to, k.pos));
  noteHumanAct(w, k, "throw");
  return b;
}

function firePellet(w: World, k: Kid, p: V, targetId: number) {
  const b = makeBall(w, k.id, k.team, k.pos, p, k.kit.ball, true, targetId, k.facing);
  k.hopper--;
  k.launchCd = LAUNCHER.rate;
  k.lastFire = w.t;
  k.refillT = 0;
  if (k.hopper <= 0) k.reloading = LAUNCHER.emptyReload;
  k.throwPose = 0.15;
  k.facing = angleOf(sub(b.to, k.pos));
  noteHumanAct(w, k, "throw");
}

function tickLauncher(w: World, k: Kid) {
  k.launchCd = Math.max(0, k.launchCd - DT);
  if (!k.kit.launcher) return;
  if (k.reloading > 0) {
    k.reloading -= DT;
    if (k.reloading <= 0) (k.reloading = 0), (k.hopper = LAUNCHER.hopper);
  } else if (k.hopper < LAUNCHER.hopper && w.t - k.lastFire > LAUNCHER.refillDelay) {
    k.refillT += DT;
    while (k.refillT >= LAUNCHER.refillEvery && k.hopper < LAUNCHER.hopper) (k.refillT -= LAUNCHER.refillEvery), k.hopper++;
  }
}

function snowmanThrow(w: World, s: Snowman) {
  const foes = enemiesOf(w, s.team).filter((e) => dist(e.pos, s.pos) <= SNOWMAN.range && !lineBlocked(w, s.pos, e.pos, s.id));
  const t = nearest(s.pos, foes);
  if (!t) return;
  const T = PLAIN.base + PLAIN.perM * dist(s.pos, t.pos);
  makeBall(w, s.owner, s.team, s.pos, add(t.pos, mul(t.seenVel, T)), "plain", false, t.id, 0);
  s.fireCd = SNOWMAN.fireEvery;
}

function breakWall(w: World, wl: Wall, melt: boolean) {
  w.walls = w.walls.filter((x) => x !== wl);
  const o = w.kids[wl.owner];
  if (o.wall === wl) o.wall = null;
  o.wallCd = Math.max(o.wallCd, WALL.cooldown); // 8s after any plant or break
  w.events.push(melt ? { type: "melt", p: { ...wl.c } } : { type: "wallBreak", p: { ...wl.c } });
}

function breakSnowman(w: World, s: Snowman, melt: boolean) {
  w.snowmen = w.snowmen.filter((x) => x !== s);
  const o = w.kids[s.owner];
  if (o.snowman === s) o.snowman = null;
  o.wallCd = Math.max(o.wallCd, SNOWMAN.cooldown / 2);
  w.events.push(melt ? { type: "melt", p: { ...s.pos } } : { type: "snowmanBreak", p: { ...s.pos } });
}

function earn(k: Kid, n: number) {
  k.credits += n;
  k.earned += n;
}

function startPlant(w: World, k: Kid, angle: number) {
  const spot = buildSpot(w, k, angle);
  if (k.isHuman) w.stats.wallPresses++;
  if (k.carrying) return;
  if (k.wallCd > 0) {
    if (k.isHuman) {
      w.stats.wallPressesCooldown++;
      w.log.add("input", w.t, { kid: k.id, note: `wall_press_cooldown ${k.wallCd.toFixed(1)}s left` });
    }
    return;
  }
  if (!spot.legal) {
    if (k.isHuman) {
      w.stats.wallPressesIllegal++;
      w.log.add("input", w.t, { kid: k.id, note: "wall_press_illegal" });
    }
    return;
  }
  k.plantKind = k.kit.snowman ? "snowman" : "wall";
  k.planting = k.plantKind === "snowman" ? SNOWMAN.build : WALL.plant;
  k.plantSpot = spot;
  k.facing = angle;
  w.events.push({ type: "plantStart", kid: k.id });
  noteHumanAct(w, k, "wall");
}

function finishPlant(w: World, k: Kid) {
  const s = k.plantSpot!;
  k.planting = 0;
  k.plantSpot = null;
  if (k.plantKind === "snowman") {
    if (!snowmanLegal(w, s.c)) return;
    if (k.snowman) w.snowmen = w.snowmen.filter((x) => x !== k.snowman); // one snowman each
    const sm: Snowman = { id: w.nextId++, owner: k.id, team: k.team, pos: { ...s.c }, hp: SNOWMAN.hp, fireCd: 1, bornAt: w.t };
    k.snowman = sm;
    w.snowmen.push(sm);
    k.wallCd = SNOWMAN.cooldown;
    w.events.push({ type: "snowman", kid: k.id });
    return;
  }
  const fresh = wallSpot(w, { ...k, pos: sub(s.c, fromAngle(s.angle, WALL.offset)) }, s.angle);
  if (!fresh.legal) return; // sled moved into the spot: cancelled, no cooldown
  if (k.wall) w.walls = w.walls.filter((x) => x !== k.wall); // planting again moves it
  const wall = { id: w.nextId++, owner: k.id, team: k.team, a: s.a, b: s.b, c: s.c, angle: s.angle, dents: [], bornAt: w.t };
  k.wall = wall;
  w.walls.push(wall);
  k.wallCd = WALL.cooldown;
  w.events.push({ type: "plant", kid: k.id });
  if (k.isHuman) w.log.add("input", w.t, { kid: k.id, note: "wall_plant" });
}

function handoff(w: World, k: Kid) {
  const to = w.handoffTarget >= 0 ? w.kids[w.handoffTarget] : null;
  if (!to) {
    // silent: no toss, no cooldown, no sound
    w.stats.silentPressesTotal++;
    if (w.stats.firstHandoff < 0) w.stats.silentPresses++;
    w.log.add("input", w.t, { kid: k.id, note: "handoff_press_silent" });
    return;
  }
  k.carrying = false;
  to.carrying = true;
  w.sled.carrier = to.id;
  w.stats.handoffs[bucket(w.t)]++;
  if (w.stats.firstHandoff < 0) w.stats.firstHandoff = w.t;
  w.handoffTarget = -1;
  w.events.push({ type: "handoff", from: k.id, to: to.id });
  w.log.add("handoff", w.t, { kid: k.id, target: to.id });
}

function pickup(w: World, k: Kid) {
  const s = w.sled;
  if (s.lastTeam !== -1 && s.lastTeam !== k.team) {
    w.stats.possChanges[bucket(w.t)]++;
    w.log.add("possession", w.t, { kid: k.id, team: k.team });
  }
  w.stats.longestFree = Math.max(w.stats.longestFree, w.t - w.stats.freeSince);
  s.carrier = k.id;
  s.lastTeam = k.team;
  k.carrying = true;
  k.dodge = null;
  if (k.isHuman && w.stats.humanFirstTouch < 0) w.stats.humanFirstTouch = w.t;
  w.events.push({ type: "grab", kid: k.id });
  noteHumanAct(w, k, "grab");
}

function chill(w: World, e: Kid, b: Ball) {
  earn(w.kids[b.owner], CREDITS.hit);
  e.state = "chilled";
  e.stateT = 0;
  e.chillAt = w.t;
  e.chills++;
  e.planting = 0;
  e.plantSpot = null;
  e.dodge = null;
  e.reacts = [];
  e.vel = v();
  w.events.push({ type: "hit", kid: e.id, p: { ...e.pos } });
  const repeat = w.t - e.returnAt < 5 ? "repeat_within_5s" : "";
  let note = [repeat, e.carrying ? "carrier" : ""].filter(Boolean).join(" ");
  if (b.volley >= 0 && e.carrying) {
    w.stats.volleyChills++;
    if (w.lastVolleyChill[b.team] === b.volley - 1) (w.stats.backToBack++), (note = [note, "back_to_back"].filter(Boolean).join(" "));
    w.lastVolleyChill[b.team] = b.volley;
  }
  // the item that did it (QA #32: launcher chills vs plain-ball chills)
  const card = b.pellet ? "launcher" : b.kind;
  w.stats.chillsBy[card === "launcher" ? "launcher" : card === "plain" ? "plain" : "other"]++;
  w.log.add("chill", w.t, { kid: e.id, team: e.team, by: b.owner, card, dist: dist(b.from, e.pos), volley: b.volley >= 0 ? b.volley : "", note });
  if (e.carrying) {
    // a chilled carrier drops it in place
    e.carrying = false;
    w.sled.carrier = -1;
    w.sled.pos = { ...e.pos };
    w.sled.noPickupUntil = w.t + 0.25;
    w.stats.freeSince = w.t;
    w.events.push({ type: "drop", kid: e.id });
  }
  if (b.kind === "rock") {
    // knocked back along the throw
    const kb = add(e.pos, mul(norm(sub(b.to, b.from)), ROCK_KNOCK));
    const bd = w.hill.bounds;
    e.pos = v(clamp(kb.x, bd.minX, bd.maxX), clamp(kb.y, bd.minY, bd.maxY));
  }
}

function thaw(w: World, k: Kid, by: Kid) {
  k.state = "play";
  k.stateT = 0;
  k.returnAt = w.t;
  w.events.push({ type: "thaw", kid: k.id, by: by.id });
  earn(by, 1);
  w.log.add("thaw", w.t, { kid: k.id, team: k.team, by: by.id });
}

function logThrow(w: World, b: Ball, outcome: string, hitKid = -1) {
  w.log.add("throw", w.t, {
    kid: b.owner, team: b.team, card: b.kind,
    ring_x: b.to.x, ring_y: b.to.y, flight: b.T, outcome,
    target: b.target, target_dist: b.target >= 0 ? b.targetDist : "",
    target_front: b.target >= 0 ? b.targetFront : "", target_busy: b.target >= 0 ? b.targetBusy : "",
    closest: outcome === "hit" || outcome === "wall" || !isFinite(b.closest) ? "" : b.closest,
    volley: b.volley >= 0 ? b.volley : "",
    note: hitKid >= 0 && hitKid !== b.target ? `hit_kid=${hitKid}` : "",
  });
}

/** First contact param of moving point p1->p2 against a circle, or -1. */
function circleT(p1: V, p2: V, c: V, r: number) {
  if (distPointSeg(c, p1, p2) > r) return -1;
  const d = sub(p2, p1), f = sub(p1, c);
  const A = dot(d, d);
  if (A < 1e-12) return 0;
  const B = 2 * dot(f, d), C = dot(f, f) - r * r;
  if (C <= 0) return 0;
  const disc = B * B - 4 * A * C;
  return disc < 0 ? -1 : clamp((-B - Math.sqrt(disc)) / (2 * A), 0, 1);
}

function updateBalls(w: World) {
  const keep: Ball[] = [];
  for (const b of w.balls) {
    const prev = b.pos;
    b.t = Math.min(b.t + DT, b.T);
    b.pos = lerp(b.from, b.to, b.t / b.T);
    const tgt = b.target >= 0 ? w.kids[b.target] : null;
    // a lob is overhead in flight: only its touchdown counts as an approach
    if (tgt && inPlay(tgt) && (b.kind !== "blower" || b.t >= b.T)) b.closest = Math.min(b.closest, b.kind !== "blower" ? distPointSeg(tgt.pos, prev, b.pos) : dist(tgt.pos, b.to));

    if (b.kind !== "blower") {
      // flat: dies on the first wall, snowman or enemy body it touches. Ice shatters the wall it hits;
      // rock smashes walls and snowmen and keeps going.
      type Hit = { t: number; wall?: Wall; sm?: Snowman; kid?: Kid };
      const hits: Hit[] = [];
      for (const wl of w.walls) {
        if (b.smashed.includes(wl.id)) continue;
        const tt = sweepHit(prev, b.pos, wl.a, wl.b, WALL.thick / 2 + BALL_R);
        if (tt >= 0) hits.push({ t: tt, wall: wl });
      }
      for (const sm of w.snowmen) {
        if (sm.team === b.team || b.smashed.includes(sm.id)) continue;
        const tt = circleT(prev, b.pos, sm.pos, SNOWMAN.r + BALL_R);
        if (tt >= 0) hits.push({ t: tt, sm });
      }
      for (const e of w.kids) {
        if (e.team === b.team || !inPlay(e)) continue; // no friendly fire
        const tt = circleT(prev, b.pos, e.pos, KID_R + BALL_R);
        if (tt >= 0) hits.push({ t: tt, kid: e });
      }
      hits.sort((x, y) => x.t - y.t);
      let done = false;
      for (const h of hits) {
        const p = lerp(prev, b.pos, h.t);
        if (h.wall) {
          if (b.kind === "rock") {
            b.smashed.push(h.wall.id);
            breakWall(w, h.wall, false);
            continue;
          }
          if (b.kind === "ice") breakWall(w, h.wall, false);
          else {
            h.wall.dents.push({ p, t: w.t });
            w.events.push({ type: "splat", p });
          }
          logThrow(w, b, "wall");
          done = true;
          break;
        }
        if (h.sm) {
          if (b.kind === "rock") {
            b.smashed.push(h.sm.id);
            breakSnowman(w, h.sm, false);
            continue;
          }
          h.sm.hp -= b.kind === "ice" ? h.sm.hp : 1;
          w.events.push({ type: "splat", p });
          if (h.sm.hp <= 0) breakSnowman(w, h.sm, false);
          logThrow(w, b, "wall");
          done = true;
          break;
        }
        if (h.kid) {
          chill(w, h.kid, b);
          logThrow(w, b, "hit", h.kid.id);
          done = true;
          break;
        }
      }
      if (done) continue;
    }

    if (b.t < b.T) {
      keep.push(b);
      continue;
    }
    // touchdown: anyone in the ring
    const inRing = w.kids.filter((e) => e.team !== b.team && inPlay(e) && dist(e.pos, b.to) <= b.ringR);
    if (inRing.length) {
      const hits = b.kind === "blower" ? inRing : [nearest(b.to, inRing)!];
      for (const e of hits) chill(w, e, b);
      logThrow(w, b, "hit", hits[0].id);
      continue;
    }
    // miss: skid past the boots and rest where it stops (never through a body or wall)
    const dir = norm(sub(b.to, b.from));
    const skid = b.kind === "blower" ? 0.15 : w.rng.range(SKID_MIN, SKID_MAX) * (b.pellet ? 0.5 : 1);
    let end = add(b.to, mul(dir, skid));
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const p = add(b.to, mul(dir, (skid * i) / steps));
      const blocked = w.kids.some((e) => inPlay(e) && dist(e.pos, p) < KID_R + BALL_R) || w.walls.some((wl) => distPointSeg(p, wl.a, wl.b) < WALL.thick / 2 + BALL_R);
      if (blocked) {
        end = add(b.to, mul(dir, (skid * (i - 1)) / steps));
        break;
      }
      if (tgt && inPlay(tgt)) b.closest = Math.min(b.closest, dist(tgt.pos, p));
    }
    w.rest.push({ p: end, from: { ...b.to }, t: w.t, kind: b.kind });
    if (w.rest.length > 40) w.rest.shift();
    w.events.push({ type: "miss", p: end });
    logThrow(w, b, b.targetInRing ? "stepped out" : "empty");
  }
  w.balls = keep;
}

// ---------------------------------------------------------------- movement

function integrate(w: World, k: Kid, it: Intent) {
  if (k.state === "chilled") {
    k.vel = v();
    k.stateT += DT;
    if (k.stateT >= CHILL_FREEZE) k.state = "toStand";
    return;
  }
  if (k.state === "toStand") {
    const d = dist(k.pos, w.hill.stand);
    if (d < 0.3) k.state = "atStand";
    else {
      k.vel = mul(norm(sub(w.hill.stand, k.pos)), KID_SPEED);
      k.facing = angleOf(k.vel);
      k.pos = add(k.pos, mul(k.vel, DT));
    }
    return;
  }
  if (k.state === "atStand") {
    k.vel = v();
    if (w.t - k.chillAt >= CHILL_OUT) {
      k.state = "play";
      k.returnAt = w.t;
      k.pos = add(w.hill.standExit, v(w.rng.range(-1, 1), 0));
    }
    return;
  }
  if (it.face !== undefined) k.facing = it.face;
  else if (Math.hypot(it.move.x, it.move.y) > 0.1) k.facing = angleOf(it.move);
  if (k.planting > 0) {
    k.vel = v();
    return;
  }
  const speed = KID_SPEED * (k.carrying ? CARRY_MUL : 1);
  const want = mul(it.move, speed);
  const dv = sub(want, k.vel);
  const dl = Math.hypot(dv.x, dv.y), step = KID_ACCEL * DT;
  k.vel = dl <= step ? want : add(k.vel, mul(dv, step / dl));
  k.pos = add(k.pos, mul(k.vel, DT));
}

function collide(w: World) {
  const live = w.kids.filter(inPlay);
  // soft separation so kids never stack
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const d = dist(a.pos, b.pos), min = KID_R * 1.8;
      if (d < min && d > 1e-6) {
        const push = mul(norm(sub(a.pos, b.pos)), (min - d) / 2);
        a.pos = add(a.pos, push);
        b.pos = sub(b.pos, push);
      }
    }
  // walls block bodies
  for (const k of live)
    for (const wl of w.walls) {
      const min = KID_R + WALL.thick / 2;
      const d = distPointSeg(k.pos, wl.a, wl.b);
      if (d < min) {
        let n = norm(sub(k.pos, add(wl.a, mul(sub(wl.b, wl.a), 0.5))));
        const c = (() => {
          const ab = sub(wl.b, wl.a);
          const t = clamp(dot(sub(k.pos, wl.a), ab) / dot(ab, ab), 0, 1);
          return add(wl.a, mul(ab, t));
        })();
        if (d > 1e-6) n = norm(sub(k.pos, c));
        else n = perp(norm(sub(wl.b, wl.a)));
        k.pos = add(c, mul(n, min));
      }
    }
  for (const k of live)
    for (const sm of w.snowmen) {
      const min = KID_R + SNOWMAN.r, d = dist(k.pos, sm.pos);
      if (d < min) k.pos = add(sm.pos, mul(d > 1e-6 ? norm(sub(k.pos, sm.pos)) : v(1, 0), min));
    }
  const b = w.hill.bounds;
  for (const k of live) k.pos = v(clamp(k.pos.x, b.minX, b.maxX), clamp(k.pos.y, b.minY, b.maxY));
}

/** Melter: rival walls and snowmen you touch melt; chilled teammates you reach thaw. */
function melters(w: World) {
  for (const k of w.kids) {
    if (!k.kit.melter || !inPlay(k)) continue;
    for (const wl of [...w.walls]) if (wl.team !== k.team && distPointSeg(k.pos, wl.a, wl.b) <= KID_R + WALL.thick / 2 + MELT_R) breakWall(w, wl, true);
    for (const sm of [...w.snowmen]) if (sm.team !== k.team && dist(k.pos, sm.pos) <= KID_R + SNOWMAN.r + MELT_R) breakSnowman(w, sm, true);
    if (k.thawCd > 0) continue;
    const o = w.kids.find((o) => o.team === k.team && o !== k && !inPlay(o) && dist(o.pos, k.pos) <= THAW_R);
    if (o) (thaw(w, o, k), (k.thawCd = THAW_CD));
  }
}

// ---------------------------------------------------------------- step

export function step(w: World, input: HumanInput | null) {
  if (w.phase === "over") return;
  w.t += DT;
  if (w.phase === "sudden") w.sdT += DT;
  w.events.length = 0;
  w.crownPulse = Math.max(0, w.crownPulse - DT * 2.5);

  if (w.phase === "play") {
    let s = 0;
    for (let i = 0; i < DUSK_STEPS.length; i++) if (w.t >= DUSK_STEPS[i] * roundLen(w)) s = i;
    if (s !== w.duskStep) (w.duskStep = s), w.events.push({ type: "duskStep", step: s });
    const left = Math.ceil(roundLen(w) - w.t);
    if (left <= 10 && left > 0 && Math.ceil(roundLen(w) - (w.t - DT)) !== left) w.events.push({ type: "tick", left });
  }

  for (const k of w.kids) {
    k.throwCd = Math.max(0, k.throwCd - DT);
    k.blowerCd = Math.max(0, k.blowerCd - DT);
    k.wallCd = Math.max(0, k.wallCd - DT);
    k.throwPose = Math.max(0, k.throwPose - DT);
    tickLauncher(w, k);
    k.thawCd = Math.max(0, k.thawCd - DT);
  }

  const intents = w.kids.map((k) => (k.bot ? think(w, k) : humanIntent(w, k, input)));
  if (w.kids[0].bot) w.handoffTarget = -1;

  w.kids.forEach((k, i) => {
    const it = intents[i];
    if (!inPlay(k) || k.planting > 0) return;
    if (it.handoff && k.carrying) handoff(w, k);
    // under siege the defenders throw only in the shared volley, so each volley is one visible event
    const ta = w.siege && k.bot && k.team === w.siege.defenders ? undefined : it.throwAt;
    if (ta && !k.carrying) {
      if (k.kit.launcher && ta.kind !== "blower") {
        // bots fire in bursts; the human sprays for as long as they hold
        if (k.bot && k.burstUntil <= w.t && k.throwCd <= 0) {
          k.burstUntil = w.t + LAUNCHER.burst;
          k.burstTarget = ta.target;
          k.throwCd = LAUNCHER.burst + THROW_CD + w.rng.range(0, BOT_THROW_JITTER);
        }
        if ((!k.bot || k.burstUntil > w.t) && k.launchCd <= 0 && k.hopper > 0 && k.reloading <= 0) firePellet(w, k, ta.p, ta.target);
      } else if (k.throwCd <= 0 && (ta.kind !== "blower" || k.blowerCd <= 0)) doThrow(w, k, ta.p, ta.kind, ta.target);
    }
    if (it.plant !== undefined) startPlant(w, k, it.plant);
  });
  updateSiege(w);

  const before = w.kids.map((k) => ({ ...k.pos }));
  w.kids.forEach((k, i) => integrate(w, k, intents[i]));
  collide(w);
  melters(w);
  w.kids.forEach((k, i) => {
    const moved = mul(sub(k.pos, before[i]), 1 / DT);
    k.seenVel = inPlay(k) ? lerp(k.seenVel, moved, 0.12) : v();
  });

  for (const k of w.kids) {
    if (k.planting > 0) {
      k.planting -= DT;
      if (k.planting <= 0) finishPlant(w, k);
    }
  }

  // sled
  const c = carrier(w);
  if (c) w.sled.pos = add(c.pos, fromAngle(c.facing, 0.2));
  else if (w.t >= w.sled.noPickupUntil) {
    let best: Kid | null = null, bd = PICKUP_R;
    w.kids.forEach((k, i) => {
      if (!inPlay(k) || k.planting > 0 || !intents[i].pickup) return;
      const d = dist(k.pos, w.sled.pos);
      if (d <= bd) (bd = d), (best = k);
    });
    if (best) pickup(w, best);
  }

  for (const sm of w.snowmen) {
    sm.fireCd -= DT;
    if (sm.fireCd <= 0) snowmanThrow(w, sm);
  }
  updateBalls(w);

  // the teacher: an eligible ally within 6m with no ring on them waves for the sled
  const hu = w.kids[0];
  for (const k of w.kids) {
    k.waving = !!(hu.carrying && !hu.bot && k.team === 0 && !k.isHuman && (k.role === "beanie" || k.role === "pockets") && inPlay(k) && k.planting <= 0 && dist(k.pos, hu.pos) <= 6 && !ringOn(w, k));
  }

  if (!inPlay(hu)) w.stats.humanOut += DT;
  if (hu.isHuman && w.stats.humanFirstTouch < 0 && dist(hu.pos, w.sled.pos) <= PICKUP_R) w.stats.humanFirstTouch = w.t;

  score(w);

  const sec = Math.floor(w.t);
  if (sec > w.stats.lastSecond) {
    w.stats.lastSecond = sec;
    const cc = carrier(w);
    const onC = cc && inPlay(cc) && dist(cc.pos, w.hill.crown) <= CROWN_R;
    w.log.add("second", sec, { sled: cc ? `k${cc.id}${onC ? "+crown" : ""}` : "free", score_c: Math.floor(w.score[0]), score_r: Math.floor(w.score[1]) });
  }

  if (w.phase === "play" && w.t >= roundLen(w)) {
    w.events.push({ type: "lights" });
    const a = Math.floor(w.score[0]), b = Math.floor(w.score[1]);
    if (a !== b) endRound(w, a > b ? 0 : 1);
    else {
      w.phase = "sudden";
      w.events.push({ type: "suddenDeath" });
    }
  }
}

// ---------------------------------------------------------------- siege

/** One shared volley timer for whoever is defending the crown. */
function updateSiege(w: World) {
  const c = siegeCarrier(w);
  if (!c) {
    if (w.siege) endSiege(w);
    return;
  }
  const defenders = (1 - c.team) as Team;
  if (w.siege && w.siege.defenders !== defenders) endSiege(w);
  // a handoff on the crown keeps the same siege (and timer) going
  if (!w.siege) w.siege = { defenders, carrier: c.id, start: w.t, nextAt: w.t + SIEGE.firstAfter, volleys: 0 };
  const s = w.siege;
  s.carrier = c.id;
  if (w.t < s.nextAt) return;
  const live = w.balls.filter((b) => b.volley >= 0 && b.team === defenders).length;
  const shots = planVolley(w, c, SIEGE.maxRings - live);
  if (!shots.length) {
    s.nextAt = w.t + 0.25; // nobody free to throw: look again shortly
    return;
  }
  const n = ++w.volleyN[defenders];
  s.volleys++;
  for (const sh of shots) {
    const b = doThrow(w, sh.kid, sh.p, sh.kind, sh.target, true);
    b.volley = n;
    sh.kid.burstUntil = 0;
  }
  s.nextAt = w.t + siegeCfg(w).cadence;
}

function endSiege(w: World) {
  const s = w.siege!;
  w.log.add("siege", w.t, { team: s.defenders, kid: s.carrier, secs: w.t - s.start, volley: s.volleys });
  w.siege = null;
}

/** Compact kit tag for the round row: b=ball (p/i/r), then L launcher, M melter, S snowman. */
const kitTag = (k: Kit) => k.ball[0] + (k.launcher ? "L" : "") + (k.melter ? "M" : "") + (k.snowman ? "S" : "");

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

/** A team's continuous time on the crown ended (drop, chill, walked off, or the round ended). */
function endHold(w: World, kid: number) {
  const st = w.stats;
  if (st.holdTeam === -1) return;
  const secs = w.t - st.holdStart;
  st.holds.push(secs);
  w.log.add("hold", w.t, { team: st.holdTeam, kid, secs });
  st.holdTeam = -1;
}

function score(w: World) {
  const c = carrier(w);
  const on = c && inPlay(c) && dist(c.pos, w.hill.crown) <= CROWN_R ? c : null;
  const st = w.stats;
  if (on) {
    w.lastOnCrown = w.t;
    on.crownAcc += DT;
    if (on.crownAcc >= CREDITS.crownSecs) (on.crownAcc -= CREDITS.crownSecs), earn(on, 1);
    if (st.holdTeam !== on.team) {
      endHold(w, on.id);
      (st.holdTeam = on.team), (st.holdStart = w.t);
    }
    st.longestHold = Math.max(st.longestHold, w.t - st.holdStart);
  } else endHold(w, c ? c.id : -1);

  if (w.phase === "play") {
    if (!on) return;
    const before = Math.floor(w.score[on.team]);
    w.score[on.team] += DT;
    st.crownTime += DT;
    st.carrySecs[on.id] = (st.carrySecs[on.id] ?? 0) + DT;
    if (Math.floor(w.score[on.team]) > before) {
      w.crownPulse = 1;
      w.events.push({ type: "crownSecond", team: on.team });
    }
  } else if (w.phase === "sudden") {
    if (on) {
      if (w.sdHold.team === on.team) w.sdHold.t += DT;
      else w.sdHold = { team: on.team, t: DT };
      st.carrySecs[on.id] = (st.carrySecs[on.id] ?? 0) + DT;
    } else w.sdHold = { team: -1, t: 0 };
    const need = w.sdT >= SD_CAP ? 1 : SD_HOLD;
    if (w.sdHold.team !== -1 && w.sdHold.t >= need) endRound(w, w.sdHold.team as Team);
  }
}

function endRound(w: World, winner: Team) {
  w.phase = "over";
  w.winner = winner;
  endHold(w, w.sled.carrier);
  if (w.siege) endSiege(w);
  if (w.sled.carrier < 0) w.stats.longestFree = Math.max(w.stats.longestFree, w.t - w.stats.freeSince);
  for (const k of w.kids) earn(k, CREDITS.round + (k.team === winner ? CREDITS.roundWin : 0));
  w.events.push({ type: "roundOver", winner });
  const st = w.stats;
  st.possChanges.forEach((p, i) => {
    if (i < 6 || p || st.handoffs[i]) w.log.add("bucket", w.t, { bucket: i < 6 ? `${i * 30}-${i * 30 + 30}` : "sudden", poss: p, handoffs: st.handoffs[i] });
  });
  const hc = st.carrySecs[0] ?? 0;
  const teamC = Object.entries(st.carrySecs).filter(([id]) => w.kids[+id].team === 0).reduce((s, [, x]) => s + x, 0);
  w.log.add("round", w.t, {
    winner,
    score_c: Math.floor(w.score[0]),
    score_r: Math.floor(w.score[1]),
    note: [
      `sudden_death=${w.sdT > 0 ? w.sdT.toFixed(1) : "no"}`,
      `crown_share=${(st.crownTime / roundLen(w)).toFixed(3)}`,
      `poss_changes=${st.possChanges.reduce((a, b) => a + b, 0)}`,
      `handoffs=${st.handoffs.reduce((a, b) => a + b, 0)}`,
      `longest_hold=${st.longestHold.toFixed(1)}`,
      `longest_free=${st.longestFree.toFixed(1)}`,
      `human_carry_share=${teamC > 0 ? (hc / teamC).toFixed(3) : "na"}`,
      `human_out=${st.humanOut.toFixed(1)}`,
      `human_first_touch=${st.humanFirstTouch.toFixed(1)}`,
      `silent_presses_before_first=${st.silentPresses}`,
      `silent_presses=${st.silentPressesTotal}`,
      `wall_presses=${st.wallPresses}`,
      `wall_presses_cooldown=${st.wallPressesCooldown}`,
      `holds=${st.holds.length}`,
      `median_hold=${median(st.holds).toFixed(1)}`,
      `volley_chills=${st.volleyChills}`,
      `back_to_back=${st.backToBack}`,
      `chills_plain=${st.chillsBy.plain} chills_launcher=${st.chillsBy.launcher} chills_other=${st.chillsBy.other}`,
      `kits=${w.kids.map((k) => kitTag(k.kit)).join("/")}`,
      `chills=${w.kids.map((k) => k.chills).join("/")}`,
      `earned=${w.kids.map((k) => k.earned).join("/")}`,
    ].join(" "),
  });
}
