// Host playtest 1: the crown was too safe. Whoever holds it now faces ONE shared volley per
// cadence: every free defender's ring is released on the same frame (design doc, Fixes 1-3).
//   FAR (8m+) plain rings bracket the carrier's path: lead + one ring 1.2m to the side.
//   NEAR (<8m): one direct shot at the carrier's position, no lead.
//   CAPPERS (Pockets' blowers) land ~1s late on the obvious exit; street 3 has two, one per exit.
// Never more than 4 live siege rings. Brick never throws. Symmetric: Chestnut sieges the same way.
import { BLOWER, CROWN_R, PLAIN, SIEGE } from "./const";
import { add, dist, len, mul, norm, perp, sub, type V } from "./math";
import { carrier, inPlay, lineBlocked } from "./query";
import type { BallKind, Kid, SiegeCfg, World } from "./types";

export interface VolleyShot {
  kid: Kid;
  p: V;
  kind: BallKind; // always a bare plain ball or a blower: never a bot's purchases
  target: number;
  near: boolean;
}

const rotate = (a: V, r: number): V => ({ x: a.x * Math.cos(r) - a.y * Math.sin(r), y: a.x * Math.sin(r) + a.y * Math.cos(r) });

export const siegeCfg = (w: World): SiegeCfg => w.cfg.siege ?? SIEGE.streets[0];

/** In siege: an enemy carries the sled within 2m of the crown edge. */
export function siegeCarrier(w: World): Kid | null {
  const c = carrier(w);
  return c && inPlay(c) && dist(c.pos, w.hill.crown) <= CROWN_R + SIEGE.trigger ? c : null;
}

/** Free = in play, not carrying, not planting. Live bots only: the human throws for themselves. */
const free = (k: Kid) => k.bot && inPlay(k) && !k.carrying && k.planting <= 0;

function flight(kind: BallKind, d: number) {
  const s = kind === "blower" ? BLOWER : PLAIN;
  return s.base + s.perM * d;
}

/** Where the carrier will be at touchdown if they keep walking. */
function leadPoint(k: Kid, c: Kid, kind: BallKind): V {
  let p = c.pos;
  for (let i = 0; i < 2; i++) p = add(c.pos, mul(c.seenVel, flight(kind, dist(k.pos, p))));
  return p;
}

/** Plan one volley against the carrier. `room` = rings allowed before the 4-ring cap. */
export function planVolley(w: World, c: Kid, room: number): VolleyShot[] {
  const cfg = siegeCfg(w);
  const defenders = w.kids.filter((k) => k.team !== c.team && free(k) && k.role !== "brick");
  const byDist = (a: Kid, b: Kid) => dist(a.pos, c.pos) - dist(b.pos, c.pos);
  // plain rings: anyone but Pockets (Beanie, Copycat, the stand-in). Volleys are always plain balls,
  // whatever the thrower bought (rule 4), so every ring needs a clear line.
  const plains = defenders
    .filter((k) => k.role !== "pockets")
    .filter((k) => dist(k.pos, c.pos) <= PLAIN.range && !lineBlocked(w, k.pos, c.pos))
    .sort(byDist)
    .slice(0, cfg.plains);
  const cappers = defenders
    .filter((k) => k.role === "pockets" && dist(k.pos, c.pos) <= BLOWER.range && dist(k.pos, c.pos) >= 3)
    .sort(byDist)
    .slice(0, cfg.cappers);

  // the bracket side: across the carrier's path if walking, else across the line from the throwers
  const moving = len(c.seenVel) > 0.6;
  const from = plains[0] ?? cappers[0];
  const axis = moving ? norm(c.seenVel) : from ? norm(sub(c.pos, from.pos)) : { x: 1, y: 0 };
  const side = mul(perp(axis), w.rng.chance(0.5) ? 1 : -1);

  const shots: VolleyShot[] = [];
  let nearUsed = false, farUsed = 0;
  for (const k of plains) {
    const near = dist(k.pos, c.pos) < SIEGE.near;
    let p: V;
    if (near && !nearUsed) (p = c.pos), (nearUsed = true); // one direct shot punishes standing still
    else if (near) p = add(c.pos, mul(side, SIEGE.spacing));
    else if (farUsed++ === 0) p = leadPoint(k, c, "plain"); // the lead punishes walking straight
    else p = add(leadPoint(k, c, "plain"), mul(side, SIEGE.spacing));
    shots.push({ kid: k, p, kind: "plain", target: c.id, near });
  }
  // cappers land ~1s late on the obvious exit: straight away from the plain rings (one capper),
  // or both ways around them (street 3's two cappers)
  const rings = shots.map((sh) => sh.p);
  const centre = rings.length ? mul(rings.reduce(add, { x: 0, y: 0 }), 1 / rings.length) : sub(c.pos, side);
  const away = dist(centre, c.pos) > 0.3 ? norm(sub(c.pos, centre)) : mul(side, -1);
  const exits = cappers.length > 1 ? [rotate(away, SIEGE.exitSpread), rotate(away, -SIEGE.exitSpread)] : [away];
  cappers.forEach((k, i) => {
    shots.push({ kid: k, p: add(c.pos, mul(exits[i % exits.length], SIEGE.exit)), kind: "blower", target: c.id, near: false });
  });
  return shots.slice(0, Math.max(0, room));
}
