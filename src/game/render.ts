import { BLOWER, CROWN_R, LAUNCHER, PELLET, PLAIN, RING_R, SD_CAP, SD_HOLD, SNOWMAN, WALL } from "../sim/const";
import { heightAt, type Hill, type Prop } from "../sim/hill";
import { add, angleOf, dist, distSegSeg, fromAngle, lerp, mul, norm, sub, type V } from "../sim/math";
import { buildSpot, carrier, handoffTarget, inPlay } from "../sim/query";
import { roundLen } from "../sim/world";
import type { Ball, BallKind, GameEvent, Kid, Snowman, Team, World } from "../sim/types";
import { A, H, iso, isoV, ringRadii, W, type S } from "./iso";
import { BUSHES, groundZ, HOUSE_HX, HOUSE_HY, HOUSE_RISE, HOUSE_SPOTS, HOUSE_WALL, drawTerrain, noise, TREES } from "./terrain";

// ------------------------------------------------------------------ palettes

export interface TeamPal {
  coat: string;
  light: string;
  dark: string;
  pattern: "bands" | "v";
  name: string;
  short: string;
}

export const CHESTNUT_PAL: TeamPal = { coat: "#c4612b", light: "#f7c999", dark: "#7a3313", pattern: "bands", name: "Chestnut Street", short: "CHESTNUT" };
export const RIVAL_PALS: TeamPal[] = [
  { coat: "#1c6c70", light: "#a9e4dc", dark: "#0b4043", pattern: "v", name: "Maple Court", short: "MAPLE" },
  { coat: "#6c3b78", light: "#e5c2ea", dark: "#3d1f48", pattern: "v", name: "Ivy Terrace", short: "IVY" },
  { coat: "#34508f", light: "#c0cff3", dark: "#1b2b55", pattern: "v", name: "The Summit Kids", short: "SUMMIT" },
];

// afternoon -> dusk (4 steps) -> streetlights. Multiply tints over the whole scene.
const TINTS = ["#fffaf3", "#ffe7c7", "#f6c4b2", "#aaa6da", "#7079bd"];

const SKIN = "#f1c7a3";
const LEGS = "#2c3247";
const CORAL = "#ff7a5c";

export interface View {
  w: World | null;
  hill: Hill;
  pals: [TeamPal, TeamPal];
  aim: V | null; // the human's private aim point
  light: { from: number; to: number; k: number; lamps: number };
  time: number;
  roundsWon: [number, number];
  debug: boolean;
  debugText?: string[];
  attract?: boolean; // the title screen's demo match: no HUD
}

// ------------------------------------------------------------------ fx (cosmetic only)

export interface Puff {
  p: V;
  z: number;
  t: number;
  life: number;
  kind: "hit" | "splat" | "snow";
  dx: number;
  dy: number;
}
export const puffs: Puff[] = [];

export function fx(e: GameEvent, w: World) {
  if (e.type === "hit") {
    for (let i = 0; i < 9; i++) puffs.push({ p: e.p, z: heightAt(w.hill, e.p) + 0.8, t: 0, life: 0.45, kind: "hit", dx: Math.cos(i * 0.7) * 30, dy: Math.sin(i * 0.7) * 16 - 10 });
  } else if (e.type === "melt" || e.type === "thaw") {
    const p = e.type === "melt" ? e.p : w.kids[e.kid].pos;
    for (let i = 0; i < 8; i++) puffs.push({ p, z: heightAt(w.hill, p) + 0.4, t: 0, life: 0.8, kind: "snow", dx: (i - 3.5) * 5, dy: -30 - (i % 3) * 8 });
  } else if (e.type === "snowmanBreak" || e.type === "wallBreak") {
    for (let i = 0; i < 10; i++) puffs.push({ p: e.p, z: heightAt(w.hill, e.p) + 0.4, t: 0, life: 0.5, kind: "splat", dx: Math.cos(i * 0.63) * 26, dy: Math.sin(i * 0.63) * 12 - 14 });
  } else if (e.type === "splat") {
    for (let i = 0; i < 6; i++) puffs.push({ p: e.p, z: heightAt(w.hill, e.p) + 0.35, t: 0, life: 0.35, kind: "splat", dx: (i - 2.5) * 8, dy: -12 - (i % 3) * 5 });
  }
}

// crown -> score strip: a spark per scoring second, and the number bumps when it lands
interface Spark {
  team: Team;
  from: S;
  t: number;
}
const sparks: Spark[] = [];
const bump: [number, number] = [0, 0];
const STRIP_NUM: S[] = [{ x: W / 2 - 34, y: 31 }, { x: W / 2 + 34, y: 31 }];

export function scoreSpark(w: World, team: Team) {
  sparks.push({ team, from: isoV(w.hill.crown, w.hill.crownH), t: 0 });
}

export function tickFx(dt: number) {
  for (const s of sparks) s.t += dt;
  for (let i = sparks.length - 1; i >= 0; i--)
    if (sparks[i].t >= 0.45) {
      bump[sparks[i].team] = 1;
      sparks.splice(i, 1);
    }
  bump[0] = Math.max(0, bump[0] - dt * 4);
  bump[1] = Math.max(0, bump[1] - dt * 4);
  for (const p of puffs) p.t += dt;
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > puffs[i].life) puffs.splice(i, 1);
}

// ------------------------------------------------------------------ helpers

export const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixC = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function poly(ctx: CanvasRenderingContext2D, pts: S[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

export function ellipse(ctx: CanvasRenderingContext2D, c: S, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const kidZ = (h: Hill, k: Kid) => groundZ(h, k.pos);

/** Visible vertical quad between two ground points (for walls, houses). */
function quad(p0: V, p1: V, z0: number, z1: number, base = 0): S[] {
  return [isoV(p0, base + z0), isoV(p1, base + z0), isoV(p1, base + z1), isoV(p0, base + z1)];
}

/** Iso box from a footprint (4 corners CCW) with height; draws visible sides + top. */
function box(ctx: CanvasRenderingContext2D, fp: V[], z0: number, h: number, top: string, left: string, right: string, stroke?: string) {
  for (let i = 0; i < 4; i++) {
    const a = fp[i], b = fp[(i + 1) % 4];
    const sa = isoV(a), sb = isoV(b);
    // a side faces the camera if its screen edge runs left->right along the bottom of the box
    const mid = isoV(lerp(a, b, 0.5)), cen = isoV(lerp(fp[0], fp[2], 0.5));
    if (mid.y <= cen.y) continue;
    poly(ctx, quad(a, b, 0, h, z0));
    ctx.fillStyle = sb.x > sa.x ? right : left;
    ctx.fill();
    if (stroke) (ctx.strokeStyle = stroke), (ctx.lineWidth = 1), ctx.stroke();
  }
  poly(ctx, fp.map((p) => isoV(p, z0 + h)));
  ctx.fillStyle = top;
  ctx.fill();
  if (stroke) (ctx.strokeStyle = stroke), (ctx.lineWidth = 1), ctx.stroke();
}

function rectFp(c: V, along: number, l: number, wd: number): V[] {
  const u = fromAngle(along, l / 2), n = fromAngle(along + Math.PI / 2, wd / 2);
  return [sub(sub(c, u), n), sub(add(c, u), n), add(add(c, u), n), add(sub(c, u), n)];
}

// ------------------------------------------------------------------ ground

export function drawGround(ctx: CanvasRenderingContext2D, v: View) {
  ctx.fillStyle = "#cdd7e6";
  ctx.fillRect(0, 0, W, H);
  const dusk = Math.min(1, (v.light.from + (v.light.to - v.light.from) * v.light.k) / 3);
  drawTerrain(ctx, v.hill, v.time, dusk);
  drawPrints(ctx, v);
}

export function drawCrown(ctx: CanvasRenderingContext2D, v: View) {
  const h = v.hill, w = v.w;
  const c = isoV(h.crown, h.crownH);
  const { rx, ry } = ringRadii(CROWN_R);
  // the crown: a trampled flat top, roped off between little stakes (stakes are drawables)
  ellipse(ctx, c, rx, ry);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
  ellipse(ctx, { x: c.x, y: c.y + 1.5 }, rx + 1, ry + 0.5);
  ctx.strokeStyle = "rgba(110,128,178,0.35)";
  ctx.lineWidth = 4;
  ctx.stroke();
  if (!w) return;
  // while the sled is held on the crown it fills with that team's colour: this is where points come from
  const cc = carrier(w);
  const scoring = cc && inPlay(cc) && dist(cc.pos, h.crown) <= CROWN_R;
  if (scoring) {
    ellipse(ctx, c, rx, ry);
    ctx.fillStyle = v.pals[cc.team].coat;
    ctx.globalAlpha = 0.22 + 0.18 * w.crownPulse;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = v.pals[cc.team].coat;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // ...and the edge pulses outward each scoring second
  if (w.crownPulse > 0 && cc) {
    ellipse(ctx, c, rx + (1 - w.crownPulse) * 22, ry + (1 - w.crownPulse) * 11);
    ctx.strokeStyle = v.pals[cc.team].coat;
    ctx.globalAlpha = w.crownPulse;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // sudden death: the hold builds as an arc around the crown
  if (w.phase === "sudden" && w.sdHold.team !== -1) {
    const need = w.sdT >= SD_CAP ? 1 : SD_HOLD;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx + 6, ry + 3, 0, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(1, w.sdHold.t / need)));
    ctx.strokeStyle = v.pals[w.sdHold.team].coat;
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ props, houses, lamps, stand

export interface Drawable {
  key: number; // screen depth
  draw: () => void;
}

const STAKES = new Map<string, V[]>();
function crownStakes(h: Hill) {
  let s = STAKES.get(h.id);
  if (!s) {
    s = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.11;
      s.push({ x: h.crown.x + Math.cos(a) * (CROWN_R + 0.05), y: h.crown.y + Math.sin(a) * (CROWN_R + 0.05) });
    }
    STAKES.set(h.id, s);
  }
  return s;
}

function drawStake(ctx: CanvasRenderingContext2D, h: Hill, p: V) {
  const b = isoV(p, h.crownH), t = isoV(p, h.crownH + 0.32);
  ctx.strokeStyle = "#6e4e3a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(t.x, t.y);
  ctx.stroke();
  ctx.lineCap = "butt";
  ellipse(ctx, { x: t.x, y: t.y - 1 }, 2.6, 2.2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

const quadZ = (a: V, b: V, z0: number, z1: number) => [isoV(a, z0), isoV(b, z0), isoV(b, z1), isoV(a, z1)];

/** The two walls the camera sees (-x side, +y gable end), their windows, and which one has the door (nearest the field). */
function houseFaces(h: Hill, c: V) {
  const x0 = c.x - HOUSE_HX, x1 = c.x + HOUSE_HX, y0 = c.y - HOUSE_HY, y1 = c.y + HOUSE_HY;
  const faces = [
    { a: { x: x0, y: y0 }, b: { x: x0, y: y1 }, n: { x: -1, y: 0 }, wins: [] as number[] },
    { a: { x: x0, y: y1 }, b: { x: x1, y: y1 }, n: { x: 0, y: 1 }, wins: [] as number[] },
  ];
  const al = (f: { n: V }) => f.n.x * (h.crown.x - c.x) + f.n.y * (h.crown.y - c.y);
  const doorFace = al(faces[0]) >= al(faces[1]) ? 0 : 1;
  faces.forEach((f, fi) => {
    const L = dist(f.a, f.b);
    f.wins = fi === doorFace ? [L * 0.2, L * 0.8] : L > 3.5 ? [L * 0.25, L * 0.5, L * 0.75] : [L * 0.3, L * 0.7];
  });
  const df = faces[doorFace];
  const door = add(lerp(df.a, df.b, 0.5), mul(df.n, 0.4));
  return { faces, doorFace, door };
}

/** A snowed-in house with a pitched roof. The camera sees the -x wall and the +y gable end. */
function drawHouse(ctx: CanvasRenderingContext2D, v: View, c: V, wall: string, wallDark: string, roof: string, door: string, lit: boolean, wreath: boolean) {
  const h = v.hill;
  const x0 = c.x - HOUSE_HX, x1 = c.x + HOUSE_HX, y0 = c.y - HOUSE_HY, y1 = c.y + HOUSE_HY;
  const WZ = HOUSE_WALL, RZ = HOUSE_WALL + HOUSE_RISE, ov = 0.3, ez = WZ - ov * (HOUSE_RISE / HOUSE_HX);
  const edge = "rgba(40,40,64,0.4)";
  const P = (x: number, y: number) => ({ x, y });

  // back roof plane (+x), seen as a sliver past the ridge
  poly(ctx, [isoV(P(c.x, y0 - ov), RZ), isoV(P(c.x, y1 + ov), RZ), isoV(P(x1 + ov, y1 + ov), ez), isoV(P(x1 + ov, y0 - ov), ez)]);
  ctx.fillStyle = "#dfe6f2";
  ctx.fill();

  // walls: the long -x side in the sun, the gable end in shade
  poly(ctx, quadZ(P(x0, y0), P(x0, y1), 0, WZ));
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  poly(ctx, [isoV(P(x0, y1), 0), isoV(P(x1, y1), 0), isoV(P(x1, y1), WZ), isoV(P(c.x, y1), RZ), isoV(P(x0, y1), WZ)]);
  ctx.fillStyle = wallDark;
  ctx.fill();
  ctx.stroke();
  // siding lines
  ctx.strokeStyle = "rgba(60,40,40,0.08)";
  for (let z = 0.3; z < WZ; z += 0.3) {
    ctx.beginPath();
    const a = isoV(P(x0, y0), z), b = isoV(P(x0, y1), z), d = isoV(P(x1, y1), z);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }

  // windows and the door on the face nearest the field
  const { faces, doorFace } = houseFaces(h, c);
  faces.forEach((f, fi) => {
    const L = dist(f.a, f.b);
    const at = (u: number) => lerp(f.a, f.b, u / L);
    const wins = f.wins;
    for (const u of wins) {
      poly(ctx, quadZ(at(u - 0.36), at(u + 0.36), 1.05, 1.85));
      ctx.fillStyle = "#fff4e2";
      ctx.fill();
      poly(ctx, quadZ(at(u - 0.28), at(u + 0.28), 1.12, 1.78));
      ctx.fillStyle = "#ffd27a";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,244,226,0.95)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const m0 = isoV(at(u), 1.12), m1 = isoV(at(u), 1.78), l0 = isoV(at(u - 0.28), 1.45), l1 = isoV(at(u + 0.28), 1.45);
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.moveTo(l0.x, l0.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.stroke();
      // snow on the sill
      const s0 = isoV(at(u - 0.4), 1.05), s1 = isoV(at(u + 0.4), 1.05);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    }
    if (fi === doorFace) {
      const m = L / 2;
      poly(ctx, quadZ(at(m - 0.42), at(m + 0.42), 0, 1.62));
      ctx.fillStyle = "#f4ead8";
      ctx.fill();
      poly(ctx, quadZ(at(m - 0.34), at(m + 0.34), 0, 1.55));
      ctx.fillStyle = door;
      ctx.fill();
      const kn = isoV(at(m + 0.2), 0.8);
      ellipse(ctx, kn, 1.3, 1.3);
      ctx.fillStyle = "#f6d68a";
      ctx.fill();
      if (wreath) {
        const wc = isoV(at(m), 1.2);
        ellipse(ctx, wc, 5, 5.5);
        ctx.strokeStyle = "#2f5d45";
        ctx.lineWidth = 3;
        ctx.stroke();
        ellipse(ctx, { x: wc.x, y: wc.y + 4 }, 1.6, 1.6);
        ctx.fillStyle = "#d8443a";
        ctx.fill();
      }
      // porch step, swept
      const n = mul(f.n, 0.5);
      poly(ctx, [isoV(at(m - 0.6), 0.16), isoV(at(m + 0.6), 0.16), isoV(add(at(m + 0.6), n), 0.16), isoV(add(at(m - 0.6), n), 0.16)]);
      ctx.fillStyle = "#c9c2b8";
      ctx.fill();
      if (lit) {
        const lp = isoV(at(m + 0.62), 1.85);
        ellipse(ctx, lp, 2.6, 3.2);
        ctx.fillStyle = "#ffe7a8";
        ctx.fill();
      }
    }
  });

  // snow drifted against the foot of both walls
  ctx.fillStyle = "#f7f9fd";
  const drift = (a: V, b: V, seed: number) => {
    const pts: S[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) pts.push(isoV(lerp(a, b, i / N), 0.12 + 0.2 * noise(seed + i * 0.7, seed)));
    for (let i = N; i >= 0; i--) pts.push(isoV(lerp(a, b, i / N), -0.05));
    poly(ctx, pts);
    ctx.fill();
  };
  drift(P(x0, y0), P(x0, y1), c.x + c.y);
  drift(P(x0, y1), P(x1, y1), c.x - c.y);

  // front roof plane (-x), deep with snow, then the snow's thickness along the eave and the rake
  const ridgeA = P(c.x, y0 - ov), ridgeB = P(c.x, y1 + ov), eA = P(x0 - ov, y0 - ov), eB = P(x0 - ov, y1 + ov), rB = P(x1 + ov, y1 + ov);
  poly(ctx, [isoV(eB, ez - 0.22), isoV(rB, ez - 0.22), isoV(ridgeB, RZ - 0.22), isoV(ridgeB, RZ)]);
  ctx.fillStyle = roof;
  ctx.fill();
  poly(ctx, [isoV(eA, ez - 0.22), isoV(eB, ez - 0.22), isoV(eB, ez), isoV(eA, ez)]);
  ctx.fill();
  poly(ctx, [isoV(ridgeA, RZ), isoV(ridgeB, RZ), isoV(eB, ez), isoV(eA, ez)]);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // soft snow lip hanging over the eave
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  const l0 = isoV(eA, ez + 0.02), l1 = isoV(eB, ez + 0.02), l2 = isoV(ridgeB, RZ + 0.02), l3 = isoV(rB, ez + 0.02);
  ctx.moveTo(l0.x, l0.y);
  ctx.lineTo(l1.x, l1.y);
  ctx.lineTo(l2.x, l2.y);
  ctx.lineTo(l3.x, l3.y);
  ctx.stroke();
  ctx.lineCap = "butt";
  // icicles along the sunny eave
  ctx.fillStyle = "rgba(214,232,250,0.95)";
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    const len = 4 + 7 * noise(i * 1.7 + c.x, c.y);
    const p = isoV(lerp(eA, eB, u), ez - 0.22);
    ctx.beginPath();
    ctx.moveTo(p.x - 2, p.y);
    ctx.lineTo(p.x + 2, p.y);
    ctx.lineTo(p.x, p.y + len);
    ctx.fill();
  }

  // chimney on the back slope, with a curl of smoke
  const ch = P(c.x + 0.7, c.y - 1.1), cz0 = WZ + HOUSE_RISE * (1 - 0.7 / HOUSE_HX) - 0.1, cz1 = RZ + 0.55;
  const cfp = [P(ch.x - 0.24, ch.y - 0.24), P(ch.x + 0.24, ch.y - 0.24), P(ch.x + 0.24, ch.y + 0.24), P(ch.x - 0.24, ch.y + 0.24)];
  poly(ctx, quadZ(cfp[0], cfp[3], cz0, cz1));
  ctx.fillStyle = "#a35a45";
  ctx.fill();
  poly(ctx, quadZ(cfp[3], cfp[2], cz0, cz1));
  ctx.fillStyle = "#86463a";
  ctx.fill();
  poly(ctx, cfp.map((p) => isoV(p, cz1)));
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const top = isoV(ch, cz1 + 0.1);
  for (let i = 0; i < 6; i++) {
    const k = (v.time * 0.35 + i / 6 + c.x * 0.01) % 1;
    ellipse(ctx, { x: top.x + k * 26 + Math.sin(k * 6 + i) * 3, y: top.y - k * 46 }, 3 + k * 7, 2.5 + k * 6);
    ctx.fillStyle = `rgba(236,240,250,${0.55 * (1 - k)})`;
    ctx.fill();
  }
}

function drawPine(ctx: CanvasRenderingContext2D, b: S, s: number) {
  const sc = s * 34;
  ctx.fillStyle = "#5a3e2c";
  ctx.fillRect(b.x - 2.5 * s, b.y - 0.5 * sc, 5 * s, 0.5 * sc);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const bot = b.y - (0.35 + i * 0.62) * sc, top = bot - 1.15 * sc;
    const half = (1.05 - i * 0.2) * sc * 0.62;
    // lit left half, shaded right half
    ctx.beginPath();
    ctx.moveTo(b.x, top);
    ctx.lineTo(b.x - half, bot);
    ctx.quadraticCurveTo(b.x - half * 0.5, bot + 4 * s, b.x, bot + 2 * s);
    ctx.closePath();
    ctx.fillStyle = "#2f5a4a";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x, top);
    ctx.lineTo(b.x + half, bot);
    ctx.quadraticCurveTo(b.x + half * 0.5, bot + 4 * s, b.x, bot + 2 * s);
    ctx.closePath();
    ctx.fillStyle = "#234538";
    ctx.fill();
    // snow resting on the tier
    ctx.beginPath();
    ctx.moveTo(b.x, top - 1);
    ctx.lineTo(b.x - half * 0.92, bot - 3 * s);
    ctx.quadraticCurveTo(b.x - half * 0.6, bot - 0.5 * sc + 4, b.x - half * 0.2, bot - 0.42 * sc);
    ctx.quadraticCurveTo(b.x + half * 0.2, bot - 0.5 * sc, b.x + half * 0.7, bot - 6 * s);
    ctx.closePath();
    ctx.fillStyle = i === tiers - 1 ? "#ffffff" : "#f4f7fc";
    ctx.fill();
  }
}

function drawBush(ctx: CanvasRenderingContext2D, b: S, s: number) {
  const r = 15 * s;
  ellipse(ctx, { x: b.x, y: b.y - r * 0.55 }, r, r * 0.72);
  ctx.fillStyle = "#2c5446";
  ctx.fill();
  ellipse(ctx, { x: b.x + r * 0.35, y: b.y - r * 0.45 }, r * 0.6, r * 0.5);
  ctx.fillStyle = "#234538";
  ctx.fill();
  ellipse(ctx, { x: b.x - r * 0.15, y: b.y - r * 0.95 }, r * 0.85, r * 0.42);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

export function houseDrawables(ctx: CanvasRenderingContext2D, v: View, out: Drawable[]) {
  const h = v.hill;
  const [chestnut, rival, nw, se] = HOUSE_SPOTS;
  const house = (c: V, wall: string, wallDark: string, roof: string, door: string, lit: boolean, wreath = false) =>
    out.push({ key: isoV({ x: c.x - HOUSE_HX, y: c.y + HOUSE_HY }).y, draw: () => drawHouse(ctx, v, c, wall, wallDark, roof, door, lit, wreath) });
  house(chestnut, "#efcfae", "#c99e7c", "#8a4a2a", CHESTNUT_PAL.coat, true, true);
  house(rival, "#cfe3df", "#9dbcb8", v.pals[1].dark, v.pals[1].coat, true);
  // neighbours, for a street (no gameplay)
  house(nw, "#e6dfec", "#bfb3cc", "#6d5a7a", "#6d5a7a", false);
  house(se, "#ece4d4", "#c8bba2", "#7a6a4a", "#7a6a4a", false);

  for (const t of TREES) out.push({ key: isoV(t.p).y, draw: () => drawPine(ctx, isoV(t.p, groundZ(h, t.p)), t.s) });
  for (const b of BUSHES) out.push({ key: isoV(b.p).y, draw: () => drawBush(ctx, isoV(b.p, groundZ(h, b.p)), b.s) });
  for (const p of crownStakes(h)) out.push({ key: isoV(p).y, draw: () => drawStake(ctx, h, p) });

  // cocoa stand: side of the hill
  const s = h.stand;
  out.push({
    key: isoV(s).y,
    draw: () => {
      box(ctx, rectFp(s, 0, 1.6, 0.8), 0, 0.9, "#f2e2c8", "#c98b5a", "#b07548");
      // a big mug painted on the counter
      const m0 = isoV(add(s, { x: -0.8, y: 0.05 }), 0.45);
      ellipse(ctx, m0, 4.5, 5);
      ctx.fillStyle = "#fff6ea";
      ctx.fill();
      // striped awning, snow on top
      const aw = rectFp(add(s, { x: 0, y: -0.15 }), 0, 1.9, 1.2);
      poly(ctx, aw.map((p) => isoV(p, 1.6)));
      ctx.fillStyle = "#e45d4c";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const px of [-0.7, 0.7]) {
        const a = isoV(add(s, { x: px, y: -0.6 }), 0), b2 = isoV(add(s, { x: px, y: -0.6 }), 1.6);
        ctx.strokeStyle = "#8a5a3a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.stroke();
      }
      // steam
      const m = isoV(s, 1.0);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const ph = v.time * 2 + i * 2;
        ctx.moveTo(m.x - 4 + i * 8, m.y - 4);
        ctx.bezierCurveTo(m.x - 8 + i * 8 + Math.sin(ph) * 3, m.y - 12, m.x + i * 8 + Math.sin(ph + 1) * 3, m.y - 18, m.x - 4 + i * 8, m.y - 26);
        ctx.stroke();
      }
    },
  });

  for (const lp of h.lamps) {
    out.push({
      key: isoV(lp).y,
      draw: () => {
        const z = groundZ(h, lp);
        const b = isoV(lp, z), t = isoV(lp, z + 2.3);
        ctx.strokeStyle = "#2f3548";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.fillStyle = "#2f3548";
        ctx.fillRect(b.x - 3, b.y - 4, 6, 4);
        // lantern: dark glass by day, glowing once the lights flicker on
        const on = v.light.lamps > 0.5;
        poly(ctx, [{ x: t.x - 4, y: t.y - 1 }, { x: t.x + 4, y: t.y - 1 }, { x: t.x + 5, y: t.y - 10 }, { x: t.x - 5, y: t.y - 10 }]);
        ctx.fillStyle = on ? "#fff1b8" : "#59607a";
        ctx.fill();
        ctx.strokeStyle = "#2f3548";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        poly(ctx, [{ x: t.x - 7, y: t.y - 10 }, { x: t.x + 7, y: t.y - 10 }, { x: t.x, y: t.y - 15 }]);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      },
    });
  }
}

// ------------------------------------------------------------------ footprints (cosmetic: where everyone has been)

interface Print {
  p: V;
  z: number;
  a: number;
  t: number;
}
const prints: Print[] = [];
const lastPrint = new Map<number, { p: V; side: number }>();
let printWorld: World | null = null;
const PRINT_LIFE = 30;

function drawPrints(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w;
  if (!w) return;
  if (w !== printWorld) {
    prints.length = 0;
    lastPrint.clear();
    printWorld = w;
  }
  for (const k of w.kids) {
    const lp = lastPrint.get(k.id);
    if (!lp || k.state === "atStand") {
      lastPrint.set(k.id, { p: { ...k.pos }, side: 1 });
      continue;
    }
    const d = dist(k.pos, lp.p);
    if (d > 1.6) lp.p = { ...k.pos };
    else if (d >= 0.42) {
      const a = angleOf(sub(k.pos, lp.p));
      lp.side = -lp.side;
      const p = add(k.pos, fromAngle(a + Math.PI / 2, 0.11 * lp.side));
      prints.push({ p, z: groundZ(v.hill, p), a, t: w.t });
      lp.p = { ...k.pos };
    }
  }
  while (prints.length && (w.t - prints[0].t > PRINT_LIFE || prints.length > 900)) prints.shift();
  for (const pr of prints) {
    const age = (w.t - pr.t) / PRINT_LIFE;
    if (age < 0) continue;
    const s = isoV(pr.p, pr.z), f = fromAngle(pr.a, 0.2);
    const ang = Math.atan2((f.y - f.x) * 0.5, f.x + f.y);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 3.4, 1.7, ang, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(118,138,190,${0.34 * (1 - age)})`;
    ctx.fill();
  }
}

export function propDrawables(ctx: CanvasRenderingContext2D, v: View, out: Drawable[]) {
  for (const p of v.hill.props) out.push({ key: isoV(lerp(p.a, p.b, 0.5)).y, draw: () => drawProp(ctx, v.hill, p) });
}

function drawProp(ctx: CanvasRenderingContext2D, h: Hill, p: Prop) {
  const z = groundZ(h, lerp(p.a, p.b, 0.5));
  if (p.kind === "tree") {
    drawPine(ctx, isoV(p.a, z), 1.05);
    return;
  }
  if (p.kind === "pond") {
    const c = isoV(lerp(p.a, p.b, 0.5), 0);
    ellipse(ctx, c, dist(p.a, p.b) * A * 0.75 + 20, 22);
    ctx.fillStyle = "#b9d6ea";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    return;
  }
  const ang = angleOf(sub(p.b, p.a));
  const fp = rectFp(lerp(p.a, p.b, 0.5), ang, dist(p.a, p.b) + p.r, p.r * 2);
  const ht = p.kind === "hedge" ? 1.1 : p.kind === "fence" ? 0.9 : p.kind === "bench" ? 0.5 : 0.6;
  const cols: Record<string, [string, string, string]> = {
    hedge: ["#f3f7fb", "#4f7a5f", "#3f6650"],
    fence: ["#efe6d8", "#b08a62", "#94704c"],
    bench: ["#efe6d8", "#8a6248", "#704e38"],
    bank: ["#ffffff", "#e3eaf4", "#cdd7e8"],
  };
  const [t, l, r] = cols[p.kind];
  box(ctx, fp, z, ht, t, l, r, "rgba(40,50,80,0.3)");
}

// ------------------------------------------------------------------ walls

function drawWall(ctx: CanvasRenderingContext2D, h: Hill, a: V, b: V, frac: number, dents: V[], ghost = false) {
  const c = lerp(a, b, 0.5);
  const z = heightAt(h, c);
  const fp = rectFp(c, angleOf(sub(b, a)), WALL.len, WALL.thick);
  if (ghost) ctx.globalAlpha = 0.6;
  box(ctx, fp, z, 0.5 * frac, "#ffffff", "#e6edf7", "#d3deee", "rgba(90,110,160,0.6)");
  ctx.globalAlpha = 1;
  // persistent splats: a shallow cosmetic dent, never a hole
  for (const d of dents) {
    const s = isoV(d, z + 0.3);
    ellipse(ctx, s, 5, 3.5);
    ctx.fillStyle = "rgba(120,140,185,0.55)";
    ctx.fill();
    ellipse(ctx, { x: s.x + 1, y: s.y - 1 }, 2.5, 1.5);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  }
}

// ------------------------------------------------------------------ sled

function drawSledFree(ctx: CanvasRenderingContext2D, v: View, p: V, flag: string) {
  const z = heightAt(v.hill, p);
  const ang = -0.6;
  const fp = rectFp(p, ang, 1.15, 0.5);
  const s = isoV(p, z);
  ellipse(ctx, s, 22, 9);
  ctx.fillStyle = "rgba(50,60,100,0.22)";
  ctx.fill();
  box(ctx, fp, z + 0.05, 0.12, "#c25b3c", "#8f3b25", "#a3472e", "rgba(60,20,10,0.5)");
  // curled nose
  const nose = isoV(add(p, fromAngle(ang, 0.62)), z + 0.25);
  ctx.strokeStyle = "#8f3b25";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(nose.x, nose.y + 4, 5, -Math.PI * 0.9, Math.PI * 0.2);
  ctx.stroke();
  pennant(ctx, isoV(add(p, fromAngle(ang, -0.45)), z + 0.15), 62, flag);
}

/** Pole + flag; stays with the sled, always above heads. */
function pennant(ctx: CanvasRenderingContext2D, base: S, h: number, flag: string) {
  ctx.strokeStyle = "#4a3a2e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(base.x, base.y - h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(base.x + 1, base.y - h);
  ctx.lineTo(base.x + 22, base.y - h + 6);
  ctx.lineTo(base.x + 1, base.y - h + 13);
  ctx.closePath();
  ctx.fillStyle = flag;
  ctx.fill();
  ctx.strokeStyle = "rgba(30,30,50,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ------------------------------------------------------------------ kids

/** `hold`: a plain snowball in the throwing mitten (Frosty's bout: shows your gear stayed home). */
export function drawKid(ctx: CanvasRenderingContext2D, v: View, k: Kid, pal: TeamPal, outlined: boolean, hold = false) {
  const z = kidZ(v.hill, k);
  const f = isoV(k.pos, z);
  const out = k.state === "toStand" || k.state === "atStand";
  const chilled = k.state === "chilled";
  const fd = fromAngle(k.facing);
  const sdx = fd.x + fd.y; // screen x of facing
  const sdy = (fd.y - fd.x) / 2; // screen y of facing (>0 = toward camera)
  const flip = sdx < 0 ? -1 : 1;
  const toCam = sdy > -0.15;
  const t = v.time;
  const moving = Math.hypot(k.vel.x, k.vel.y) > 0.4;
  const step = moving ? Math.sin(t * 16 + k.id) : 0;
  const shiver = chilled ? Math.sin(t * 60) * 1.2 : 0;
  const x = f.x + shiver;
  const low = k.hat === "mitten" ? 4 : 0; // Brick sits low
  const bend = k.planting > 0 ? 6 : 0;

  ctx.save();
  if (out) ctx.globalAlpha = 0.55;

  // handoff outline (the ONE legal target)
  if (outlined) {
    ellipse(ctx, f, 19, 9);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = CHESTNUT_PAL.coat;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ellipse(ctx, f, 12, 5);
  ctx.fillStyle = "rgba(40,50,90,0.28)";
  ctx.fill();

  // powder kicked up behind running boots
  if (moving && !chilled) {
    const vs = { x: (k.vel.x + k.vel.y) * A, y: (k.vel.y - k.vel.x) * A * 0.5 };
    const vl = Math.hypot(vs.x, vs.y) || 1;
    for (let i = 0; i < 4; i++) {
      const q = (t * 2.6 + i / 4 + k.id * 0.17) % 1;
      const side = (i % 2 ? 1 : -1) * 4;
      ellipse(ctx, { x: f.x - (vs.x / vl) * q * 16 + side * q, y: f.y - 2 - (vs.y / vl) * q * 10 - Math.sin(q * Math.PI) * 7 }, 2 * (1 - q * 0.6), 2 * (1 - q * 0.6));
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - q)})`;
      ctx.fill();
    }
  }

  // legs
  ctx.fillStyle = LEGS;
  rr(ctx, x - 7, f.y - 10 + step * 1.5, 6, 9, 2);
  ctx.fill();
  rr(ctx, x + 1, f.y - 10 - step * 1.5, 6, 9, 2);
  ctx.fill();

  // coat
  const top = f.y - 31 + low + bend, bodyH = 22 - low / 2;
  const bw = k.hat === "mitten" ? 26 : 22;
  const coat = chilled ? "#c9d7ea" : pal.coat;
  rr(ctx, x - bw / 2, top, bw, bodyH, 6);
  ctx.fillStyle = coat;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,20,40,0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.save();
  rr(ctx, x - bw / 2, top, bw, bodyH, 6);
  ctx.clip();
  ctx.fillStyle = chilled ? "#eef4fb" : pal.light;
  if (pal.pattern === "bands") {
    ctx.fillRect(x - bw / 2, top + 6, bw, 3.5);
    ctx.fillRect(x - bw / 2, top + 13, bw, 3.5);
  } else {
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, top);
    ctx.lineTo(x, top + 14);
    ctx.lineTo(x + bw / 2, top);
    ctx.lineTo(x + bw / 2 - 5, top);
    ctx.lineTo(x, top + 8);
    ctx.lineTo(x - bw / 2 + 5, top);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Pockets: bulging pockets
  if (k.hat === "cap") {
    ctx.fillStyle = chilled ? "#b8c8de" : pal.dark;
    ellipse(ctx, { x: x - bw / 2 + 1, y: top + 15 }, 4.5, 5);
    ctx.fill();
    ellipse(ctx, { x: x + bw / 2 - 1, y: top + 15 }, 4.5, 5);
    ctx.fill();
  }

  // head
  const hx = x + flip * (bend ? 4 : 0), hy = top - 7 + bend / 2;
  ellipse(ctx, { x: hx, y: hy }, 8.5, 8.5);
  ctx.fillStyle = chilled ? "#dfe8f3" : SKIN;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,20,40,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (toCam) {
    ctx.fillStyle = "#2a2a35";
    ctx.fillRect(hx + flip * 2 - 1, hy, 2, 2.5);
    ctx.fillRect(hx + flip * 5.5 - 1, hy, 2, 2.5);
  }

  // hat silhouettes: one rig, four heads
  const hatC = chilled ? "#e8f0fa" : pal.dark;
  ctx.fillStyle = hatC;
  if (k.hat === "beanie") {
    ctx.beginPath();
    ctx.ellipse(hx, hy - 2, 9.5, 9, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = chilled ? "#fff" : pal.light;
    ctx.fillRect(hx - 9.5, hy - 5, 19, 3);
    ellipse(ctx, { x: hx, y: hy - 13 }, 4, 4);
    ctx.fill();
  } else if (k.hat === "cap") {
    ctx.beginPath();
    ctx.ellipse(hx, hy - 3, 9, 7, 0, Math.PI, 0);
    ctx.fill();
    rr(ctx, hx + (flip > 0 ? 2 : -13), hy - 4, 11, 3, 1.5);
    ctx.fill();
  } else if (k.hat === "mitten") {
    ctx.beginPath();
    ctx.ellipse(hx, hy - 3, 9, 6, 0, Math.PI, 0);
    ctx.fill();
  } else {
    // trapper: ear flaps (the human's shape; Copycat copies the SHAPE, never the palette)
    ctx.beginPath();
    ctx.ellipse(hx, hy - 3, 10, 8, 0, Math.PI, 0);
    ctx.fill();
    rr(ctx, hx - 10.5, hy - 4, 4.5, 10, 2);
    ctx.fill();
    rr(ctx, hx + 6, hy - 4, 4.5, 10, 2);
    ctx.fill();
  }

  // arms / poses
  const mit = k.hat === "mitten" ? 5.5 : 3.5;
  const arm = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.strokeStyle = coat;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ellipse(ctx, { x: x1, y: y1 }, mit, mit);
    ctx.fillStyle = chilled ? "#dfe8f3" : pal.dark;
    ctx.fill();
  };
  const sh = top + 4;
  if (k.carrying) {
    // sled hugged in BOTH arms, upright across the chest; pennant above heads
    const sx = x + flip * 3;
    rr(ctx, sx - 9, top - 4, 18, 28, 4);
    ctx.fillStyle = "#c25b3c";
    ctx.fill();
    ctx.strokeStyle = "#7a2f1c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "#8f3b25";
    ctx.beginPath();
    ctx.moveTo(sx - 9, top + 6);
    ctx.lineTo(sx + 9, top + 6);
    ctx.moveTo(sx - 9, top + 14);
    ctx.lineTo(sx + 9, top + 14);
    ctx.stroke();
    arm(x - bw / 2, sh, sx - 6, top + 12);
    arm(x + bw / 2, sh, sx + 6, top + 12);
    pennant(ctx, { x: sx - flip * 6, y: top - 2 }, 34, pal.coat);
  } else if (chilled) {
    arm(x - bw / 2, sh, x + 4, sh + 6);
    arm(x + bw / 2, sh, x - 4, sh + 8);
  } else if (k.planting > 0) {
    arm(x - bw / 2, sh + 2, x - 4 + flip * 10, f.y - 3);
    arm(x + bw / 2, sh + 2, x + 4 + flip * 10, f.y - 3);
  } else if (k.throwPose > 0) {
    const big = k.role === "copycat"; // exaggerated throwing pose, for the joke
    arm(x - flip * bw / 2, sh, x - flip * 13, sh + 10);
    arm(x + flip * bw / 2, sh, x + flip * (big ? 16 : 10), sh - (big ? 26 : 18));
  } else if (k.waving) {
    const wv = Math.sin(t * 12) * 5;
    arm(x - flip * bw / 2, sh, x - flip * 12, sh + 12);
    arm(x + flip * bw / 2, sh, x + flip * 12 + wv, sh - 22);
  } else if (hold) {
    arm(x - flip * bw / 2, sh, x - flip * (bw / 2 + 3), sh + 13 - step);
    const hx2 = x + flip * (bw / 2 + 6), hy2 = sh + 5;
    arm(x + flip * bw / 2, sh, hx2, hy2);
    ellipse(ctx, { x: hx2 + flip * 1.5, y: hy2 - 4.5 }, 4.5, 4.5);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(60,80,130,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    arm(x - bw / 2, sh, x - bw / 2 - 3, sh + 13 - step);
    arm(x + bw / 2, sh, x + bw / 2 + 3, sh + 13 + step);
  }

  // chilled: frost sparkles
  if (chilled) {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) {
      const a = t * 3 + i * 1.6;
      ellipse(ctx, { x: x + Math.cos(a) * 15, y: top + 8 + Math.sin(a) * 10 }, 1.8, 1.8);
      ctx.fill();
    }
  }

  drawGear(ctx, v, k, x, top, flip);
  // your launcher hopper: a little ring of balls under your feet
  if (k.isHuman && !k.bot && k.kit.launcher && k.state === "play") {
    for (let i = 0; i < LAUNCHER.hopper; i++) {
      const a = Math.PI * 0.15 + (i / (LAUNCHER.hopper - 1)) * Math.PI * 0.7;
      ellipse(ctx, { x: f.x - Math.cos(a) * 20, y: f.y + Math.sin(a) * 9 }, 2, 2);
      ctx.fillStyle = k.reloading > 0 ? "rgba(255,255,255,0.25)" : i < k.hopper ? "#ffffff" : "rgba(40,50,90,0.3)";
      ctx.fill();
    }
  }

  // breath in the cold air: a puff every couple of seconds, quicker when running
  if (!chilled) {
    const period = moving ? 1.1 : 2.3;
    const ph = ((t + k.id * 0.53) / period) % 1;
    if (ph < 0.5) {
      const q = ph / 0.5;
      ellipse(ctx, { x: hx + flip * (8 + q * 8), y: hy + 3 - q * 9 }, 2 + q * 4.5, 1.6 + q * 3.2);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - q) ** 1.5})`;
      ctx.fill();
    }
  }

  // the human: white overhead chevron, the only one on the field
  if (k.isHuman && !k.bot) {
    const cy = hy - 24 + Math.sin(t * 3) * 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 8, cy - 5);
    ctx.lineTo(hx, cy + 3);
    ctx.lineTo(hx + 8, cy - 5);
    ctx.strokeStyle = "#1d2236";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ throws

export function drawRing(ctx: CanvasRenderingContext2D, h: Hill, p: V, kind: BallKind, alpha = 1, r = RING_R) {
  const c = isoV(p, heightAt(h, p));
  const { rx, ry } = ringRadii(r);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (kind !== "blower") {
    ellipse(ctx, c, rx, ry);
    ctx.strokeStyle = "rgba(30,40,70,0.55)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // blower: broken coral touchdown bracket
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, i * (Math.PI / 2) + 0.25, (i + 1) * (Math.PI / 2) - 0.25);
      ctx.strokeStyle = "rgba(60,20,20,0.5)";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = CORAL;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.restore();
}

type BallLike = Pick<Ball, "t" | "T" | "pos" | "from" | "to" | "kind" | "pellet">;

function ballScreen(v: View, b: BallLike) {
  const s = b.t / b.T;
  const groundZ = heightAt(v.hill, b.pos);
  const z = b.kind !== "blower" ? lerp({ x: heightAt(v.hill, b.from) + 0.75, y: 0 }, { x: groundZ + 0.35, y: 0 }, s).x : groundZ + 0.5 + 4 * s * (1 - s) * 3.2;
  return { ball: isoV(b.pos, z), shadow: isoV(b.pos, groundZ) };
}

const BALL_LOOK: Record<BallKind, { fill: string; edge: string; streak: string }> = {
  plain: { fill: "#ffffff", edge: "#7f8db5", streak: "255,255,255" },
  blower: { fill: "#ffffff", edge: "#7f8db5", streak: "255,255,255" },
  ice: { fill: "#c9f1ff", edge: "#3fa7d6", streak: "170,230,255" },
  rock: { fill: "#9a948c", edge: "#4d4842", streak: "200,190,180" },
};

export function drawBall(ctx: CanvasRenderingContext2D, v: View, b: BallLike) {
  const { ball, shadow } = ballScreen(v, b);
  const look = BALL_LOOK[b.kind];
  const r = b.pellet ? 3 : b.kind === "rock" ? 5.5 : 4.5;
  // compact moving shadow
  ellipse(ctx, shadow, b.kind === "blower" ? 5 : r - 0.5, 2);
  ctx.fillStyle = "rgba(30,40,80,0.45)";
  ctx.fill();
  if (b.kind !== "blower") {
    // short bright streak, dark underside: a hard flat line, never an arc
    const back = sub(b.pos, mul(norm(sub(b.to, b.from)), 0.9));
    const s0 = isoV(back, heightAt(v.hill, back) + 0.75);
    const g = ctx.createLinearGradient(s0.x, s0.y, ball.x, ball.y);
    g.addColorStop(0, `rgba(${look.streak},0)`);
    g.addColorStop(1, `rgba(${look.streak},0.95)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = b.pellet ? 2.5 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(ball.x, ball.y);
    ctx.stroke();
  }
  ellipse(ctx, ball, r, r);
  ctx.fillStyle = look.fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = look.edge;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** Private aim preview for the human: ring + flat line that stops at the first blocking wall. */
function drawAim(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w!, hu = w.kids[0];
  if (!v.aim || hu.bot || !inPlay(hu) || hu.planting > 0) return;
  if (hu.carrying) return drawHandoffPreview(ctx, v);
  let to = v.aim;
  const range = hu.kit.launcher ? PELLET.range : PLAIN.range;
  if (dist(hu.pos, to) > range) to = add(hu.pos, mul(norm(sub(to, hu.pos)), range));
  // stop the preview at the first wall (rock snowballs go straight through)
  let stop: V | null = null;
  for (const wl of hu.kit.ball === "rock" ? [] : w.walls) {
    if (distSegSeg(hu.pos, to, wl.a, wl.b) > WALL.thick / 2 + 0.1) continue;
    for (let i = 1; i <= 40; i++) {
      const p = lerp(hu.pos, to, i / 40);
      if (distSegSeg(p, p, wl.a, wl.b) <= WALL.thick / 2 + 0.1) {
        if (!stop || dist(hu.pos, p) < dist(hu.pos, stop)) stop = p;
        break;
      }
    }
  }
  const end = stop ?? to;
  const a = isoV(hu.pos, heightAt(v.hill, hu.pos) + 0.1), b = isoV(end, heightAt(v.hill, end) + 0.1);
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
  if (stop) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - 6, b.y - 3);
    ctx.lineTo(b.x + 6, b.y + 3);
    ctx.stroke();
    drawRing(ctx, v.hill, to, hu.kit.ball, 0.18, hu.kit.launcher ? PELLET.ring : RING_R);
  } else {
    const ready = hu.kit.launcher ? hu.hopper > 0 && hu.reloading <= 0 : hu.throwCd <= 0;
    drawRing(ctx, v.hill, to, hu.kit.ball, ready ? 0.5 : 0.25, hu.kit.launcher ? PELLET.ring : RING_R);
  }
}

function drawHandoffPreview(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w!, hu = w.kids[0];
  const t = handoffTarget(w, hu, v.aim!);
  if (!t) return;
  // short sled arrow toward the one legal ally
  const d = norm(sub(t.pos, hu.pos));
  const a = isoV(add(hu.pos, mul(d, 0.6)), heightAt(v.hill, hu.pos) + 0.05);
  const b = isoV(add(hu.pos, mul(d, 1.6)), heightAt(v.hill, hu.pos) + 0.05);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.6) * 9, b.y - Math.sin(ang - 0.6) * 9);
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang + 0.6) * 9, b.y - Math.sin(ang + 0.6) * 9);
  ctx.stroke();
}

/** WALL STATUS: ghost footprint fills with the real cooldown; full outline when ready; barred if illegal. */
function drawWallGhost(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w!, hu = w.kids[0];
  if (hu.bot || !inPlay(hu) || hu.carrying) return;
  if (hu.planting > 0 && hu.plantSpot) {
    if (hu.plantKind === "snowman") drawSnowmanAt(ctx, v, hu.plantSpot.c, 0, 1 - hu.planting / SNOWMAN.build, true);
    else drawWall(ctx, v.hill, hu.plantSpot.a, hu.plantSpot.b, 1 - hu.planting / WALL.plant, [], true);
    return;
  }
  const spot = buildSpot(w, hu, hu.facing);
  if (hu.kit.snowman) return snowmanGhost(ctx, v, spot.c, hu.wallCd / SNOWMAN.cooldown, spot.legal);
  const z = heightAt(v.hill, spot.c);
  const fp = rectFp(spot.c, angleOf(sub(spot.b, spot.a)), WALL.len, WALL.thick).map((p) => isoV(p, z + 0.02));
  ctx.save();
  if (hu.wallCd > 0) {
    // cooldown: low-opacity ghost, filling along its length
    const k = 1 - hu.wallCd / WALL.cooldown;
    const fill = [fp[0], { x: fp[0].x + (fp[1].x - fp[0].x) * k, y: fp[0].y + (fp[1].y - fp[0].y) * k }, { x: fp[3].x + (fp[2].x - fp[3].x) * k, y: fp[3].y + (fp[2].y - fp[3].y) * k }, fp[3]];
    poly(ctx, fill);
    ctx.fillStyle = "rgba(90,110,170,0.28)";
    ctx.fill();
    poly(ctx, fp);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(90,110,170,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (!spot.legal) {
    poly(ctx, fp);
    ctx.strokeStyle = "rgba(90,110,170,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(240,110,90,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fp[0].x, fp[0].y);
    ctx.lineTo(fp[2].x, fp[2].y);
    ctx.moveTo(fp[1].x, fp[1].y);
    ctx.lineTo(fp[3].x, fp[3].y);
    ctx.stroke();
  } else {
    poly(ctx, fp);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(90,110,170,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ lighting

export function lighting(ctx: CanvasRenderingContext2D, v: View) {
  const a = hex(TINTS[v.light.from]), b = hex(TINTS[v.light.to]);
  const c = mixC(a, b, v.light.k);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = rgb(c);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // warm porch windows always; streetlight pools once the lights are on
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const dusk = Math.max(v.light.from, v.light.to) / 4;
  const glow = (p: S, r: number, a2: number) => {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(255,190,110,${a2})`);
    g.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  };
  // the two team porches glow on the snow in front of their doors; every window warms up as it gets dark
  for (const hc of HOUSE_SPOTS.slice(0, 2)) glow(isoV(houseFaces(v.hill, hc).door, 0.4), 70, 0.1 + dusk * 0.25);
  if (dusk > 0)
    for (const hc of HOUSE_SPOTS) {
      for (const f of houseFaces(v.hill, hc).faces) {
        const L = dist(f.a, f.b);
        for (const u of f.wins) {
          const at = (q: number) => lerp(f.a, f.b, q / L);
          poly(ctx, [isoV(at(u - 0.28), 1.12), isoV(at(u + 0.28), 1.12), isoV(at(u + 0.28), 1.78), isoV(at(u - 0.28), 1.78)]);
          ctx.fillStyle = `rgba(255,190,100,${0.55 * dusk})`;
          ctx.fill();
          glow(isoV(add(at(u), mul(f.n, 0.3)), 1.45), 22, 0.2 * dusk);
        }
      }
    }
  if (v.light.lamps > 0) {
    for (const lp of v.hill.lamps) {
      glow(isoV(lp, 2.2), 26, 0.55 * v.light.lamps);
      const g = ctx.createRadialGradient(isoV(lp).x, isoV(lp).y, 0, isoV(lp).x, isoV(lp).y, 120);
      g.addColorStop(0, `rgba(255,200,120,${0.28 * v.light.lamps})`);
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(isoV(lp).x, isoV(lp).y);
      ctx.scale(1, 0.5);
      ctx.translate(-isoV(lp).x, -isoV(lp).y);
      ctx.fillRect(isoV(lp).x - 120, isoV(lp).y - 120, 240, 240);
      ctx.restore();
    }
  }
  ctx.restore();
  // a soft vignette keeps the eye on the hill
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.72);
  vg.addColorStop(0, "rgba(20,26,56,0)");
  vg.addColorStop(1, `rgba(20,26,56,${0.2 + 0.15 * dusk})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ snowmen

function snowmanGhost(ctx: CanvasRenderingContext2D, v: View, c: V, cd: number, legal: boolean) {
  const s = isoV(c, heightAt(v.hill, c) + 0.02);
  const { rx, ry } = ringRadii(SNOWMAN.r);
  ctx.save();
  ellipse(ctx, s, rx, ry);
  if (cd > 0) {
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.ellipse(s.x, s.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd));
    ctx.closePath();
    ctx.fillStyle = "rgba(90,110,170,0.28)";
    ctx.fill();
    ellipse(ctx, s, rx, ry);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(90,110,170,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (!legal) {
    ctx.strokeStyle = "rgba(240,110,90,0.85)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - rx * 0.7, s.y - ry * 0.7);
    ctx.lineTo(s.x + rx * 0.7, s.y + ry * 0.7);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnowmanAt(ctx: CanvasRenderingContext2D, v: View, p: V, team: Team, grow = 1, ghost = false, hp = SNOWMAN.hp, sm?: Snowman) {
  const s = isoV(p, heightAt(v.hill, p));
  const k = Math.max(0.15, grow);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.6;
  ellipse(ctx, s, 14, 6);
  ctx.fillStyle = "rgba(40,50,90,0.25)";
  ctx.fill();
  const balls = [
    { y: -9, r: 11 },
    { y: -24, r: 8.5 },
    { y: -36, r: 6.5 },
  ];
  const n = grow >= 1 ? 3 : Math.ceil(grow * 3);
  for (let i = 0; i < n; i++) {
    const b = balls[i];
    ellipse(ctx, { x: s.x, y: s.y + b.y * k }, b.r * (0.6 + 0.4 * k), b.r * (0.6 + 0.4 * k));
    ctx.fillStyle = "#fbfdff";
    ctx.fill();
    ctx.strokeStyle = "rgba(90,110,160,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  if (grow >= 1) {
    // team scarf, stick arms, coal eyes, carrot nose
    const pal = v.pals[team];
    ctx.fillStyle = pal.coat;
    rr(ctx, s.x - 8, s.y - 31, 16, 4, 2);
    ctx.fill();
    ctx.fillRect(s.x + 3, s.y - 31, 4, 10);
    ctx.strokeStyle = "#6b4a33";
    ctx.lineWidth = 2;
    const wave = sm && sm.fireCd > SNOWMAN.fireEvery - 0.25 ? -8 : 0;
    ctx.beginPath();
    ctx.moveTo(s.x - 8, s.y - 24);
    ctx.lineTo(s.x - 19, s.y - 30);
    ctx.moveTo(s.x + 8, s.y - 24);
    ctx.lineTo(s.x + 19, s.y - 30 + wave);
    ctx.stroke();
    ctx.fillStyle = "#222";
    ctx.fillRect(s.x - 3, s.y - 39, 2, 2);
    ctx.fillRect(s.x + 2, s.y - 39, 2, 2);
    ctx.fillStyle = "#f08a3c";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 36);
    ctx.lineTo(s.x + 8, s.y - 35);
    ctx.lineTo(s.x, s.y - 34);
    ctx.fill();
    // damage: cracks
    if (hp < SNOWMAN.hp) {
      ctx.strokeStyle = "rgba(90,110,160,0.9)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x - 6, s.y - 14);
      ctx.lineTo(s.x - 1, s.y - 9);
      ctx.lineTo(s.x - 4, s.y - 4);
      if (hp < SNOWMAN.hp - 1) {
        ctx.moveTo(s.x + 3, s.y - 27);
        ctx.lineTo(s.x + 6, s.y - 22);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Garage gear, readable at a glance: launcher tube on the arm, thermos + steam for the melter. */
function drawGear(ctx: CanvasRenderingContext2D, v: View, k: Kid, x: number, top: number, flip: number) {
  if (k.kit.launcher && !k.carrying && k.state === "play") {
    ctx.save();
    ctx.translate(x + flip * 12, top + 10);
    ctx.rotate(flip > 0 ? -0.25 : 0.25);
    rr(ctx, flip > 0 ? 0 : -16, -3, 16, 7, 3);
    ctx.fillStyle = "#5d6b8a";
    ctx.fill();
    ctx.strokeStyle = "#2b3348";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  if (k.kit.melter) {
    rr(ctx, x - flip * 13 - 3, top + 2, 6, 11, 2);
    ctx.fillStyle = "#d9493b";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.5;
    const ph = v.time * 3 + k.id;
    ctx.beginPath();
    ctx.moveTo(x - flip * 13, top);
    ctx.quadraticCurveTo(x - flip * 13 + Math.sin(ph) * 4, top - 6, x - flip * 13, top - 12);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ score strip

function drawStrip(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w!;
  const cx = W / 2, y = 10, h = 42;
  const cc = carrier(w);
  const scoring = cc && inPlay(cc) && dist(cc.pos, w.hill.crown) <= CROWN_R ? cc.team : -1;
  ctx.save();
  rr(ctx, cx - 230, y, 460, h, 12);
  ctx.fillStyle = "rgba(24,30,52,0.88)";
  ctx.fill();
  ctx.font = "700 20px Fredoka, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const my = y + h / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f2c49a";
  ctx.fillText(v.pals[0].short, cx - 212, my);
  ctx.textAlign = "right";
  ctx.fillStyle = v.pals[1].light;
  ctx.fillText(v.pals[1].short, cx + 212, my);
  ctx.textAlign = "right";
  ctx.fillStyle = bump[0] > 0 ? "#ffe2b8" : "#ffffff";
  ctx.font = `800 ${26 + bump[0] * 8}px Fredoka, system-ui, sans-serif`;
  ctx.fillText(String(Math.floor(w.score[0])), cx - 18, my + 1);
  ctx.textAlign = "left";
  ctx.fillStyle = bump[1] > 0 ? v.pals[1].light : "#ffffff";
  ctx.font = `800 ${26 + bump[1] * 8}px Fredoka, system-ui, sans-serif`;
  ctx.fillText(String(Math.floor(w.score[1])), cx + 18, my + 1);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(cx - 1, y + 9, 2, h - 18);
  // sled icon by the scoring team
  if (scoring !== -1) {
    const ix = scoring === 0 ? cx - 92 : cx + 72;
    rr(ctx, ix, my - 6, 20, 10, 3);
    ctx.fillStyle = "#c25b3c";
    ctx.fill();
    ctx.fillStyle = v.pals[scoring].coat;
    ctx.beginPath();
    ctx.moveTo(ix + 3, my - 6);
    ctx.lineTo(ix + 3, my - 16);
    ctx.lineTo(ix + 13, my - 12);
    ctx.closePath();
    ctx.fill();
  }
  // rounds won as pips
  for (const team of [0, 1] as Team[])
    for (let i = 0; i < 2; i++) {
      const px = team === 0 ? cx - 205 + i * 12 : cx + 205 - i * 12;
      ellipse(ctx, { x: px, y: y + h + 7 }, 4, 4);
      ctx.fillStyle = i < v.roundsWon[team] ? (team === 0 ? "#f2a66a" : v.pals[1].light) : "rgba(24,30,52,0.5)";
      ctx.fill();
    }
  // your garage credits
  const hu = w.kids[0];
  if (!hu.bot) {
    rr(ctx, 14, 12, 84, 32, 10);
    ctx.fillStyle = "rgba(24,30,52,0.8)";
    ctx.fill();
    ctx.font = "800 18px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9f6ff";
    ctx.fillText(`❄ ${hu.credits}`, 26, 29);
  }
  // sparks flying from the crown into the score
  for (const sp of sparks) {
    const k = Math.min(1, sp.t / 0.45);
    const to = STRIP_NUM[sp.team];
    const e = 1 - (1 - k) * (1 - k);
    const px = sp.from.x + (to.x - sp.from.x) * e, py = sp.from.y + (to.y - sp.from.y) * e - Math.sin(k * Math.PI) * 40;
    ellipse(ctx, { x: px, y: py }, 5 - k * 2, 5 - k * 2);
    ctx.fillStyle = v.pals[sp.team].light;
    ctx.fill();
    ctx.strokeStyle = v.pals[sp.team].coat;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // daylight left: a bar along the bottom of the strip that burns down to the streetlights
  const len = roundLen(w);
  const left = Math.max(0, len - w.t);
  const frac = w.phase === "play" ? left / len : 0;
  rr(ctx, cx - 214, y + h - 6, 428, 3, 1.5);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();
  if (frac > 0) {
    rr(ctx, cx - 214, y + h - 6, 428 * frac, 3, 1.5);
    ctx.fillStyle = left <= 20 ? "#ffd27a" : "rgba(255,236,200,0.75)";
    ctx.fill();
  }
  // the clock, always visible; it grows and turns gold for the last 20s
  if (w.phase === "play") {
    const s = Math.ceil(left);
    const late = s <= 20, last = s <= 10;
    const pw = late ? 104 : 80, ph = late ? 36 : 28;
    const pulse = last ? 1 + 0.08 * Math.max(0, 1 - ((len - w.t) % 1) * 3) : 1;
    rr(ctx, cx - pw / 2, y + h + 4, pw, ph, 10);
    ctx.fillStyle = late ? "rgba(70,40,10,0.92)" : "rgba(24,30,52,0.85)";
    ctx.fill();
    ctx.font = `800 ${Math.round((late ? 26 : 18) * pulse)}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = late ? "#ffd27a" : "#ffffff";
    ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, cx, y + h + 4 + ph / 2 + 1);
  } else if (w.phase === "sudden") {
    rr(ctx, cx - 80, y + h + 4, 160, 30, 10);
    ctx.fillStyle = "rgba(70,40,10,0.92)";
    ctx.fill();
    ctx.font = "800 17px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd27a";
    ctx.fillText("Sudden death", cx, y + h + 20);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ main draw

export function draw(ctx: CanvasRenderingContext2D, v: View) {
  const w = v.w;
  drawGround(ctx, v);
  drawCrown(ctx, v);

  if (w) {
    // ground decals: skid marks + resting misses, committed rings, wall ghost, aim
    for (const r of w.rest) {
      const a = isoV(r.from, heightAt(v.hill, r.from)), b = isoV(r.p, heightAt(v.hill, r.p));
      const age = Math.min(1, (w.t - r.t) / 20);
      ctx.strokeStyle = `rgba(150,165,205,${0.5 * (1 - age)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const b of w.balls) drawRing(ctx, v.hill, b.to, b.kind, b.pellet ? 0.75 : 1, b.ringR);
    drawWallGhost(ctx, v);
    drawAim(ctx, v);
  }

  const list: Drawable[] = [];
  houseDrawables(ctx, v, list);
  propDrawables(ctx, v, list);
  if (w) {
    const ht = w.handoffTarget;
    for (const k of w.kids) list.push({ key: isoV(k.pos).y, draw: () => drawKid(ctx, v, k, v.pals[k.team], k.id === ht) });
    for (const wl of w.walls) list.push({ key: isoV(wl.c).y, draw: () => drawWall(ctx, v.hill, wl.a, wl.b, 1, wl.dents.map((d) => d.p)) });
    for (const k of w.kids)
      if (k.planting > 0 && k.plantSpot && k.bot) {
        const s = k.plantSpot;
        if (k.plantKind === "snowman") list.push({ key: isoV(s.c).y, draw: () => drawSnowmanAt(ctx, v, s.c, k.team, 1 - k.planting / SNOWMAN.build, true) });
        else list.push({ key: isoV(s.c).y, draw: () => drawWall(ctx, v.hill, s.a, s.b, 1 - k.planting / WALL.plant, [], true) });
      }
    for (const sm of w.snowmen) list.push({ key: isoV(sm.pos).y, draw: () => drawSnowmanAt(ctx, v, sm.pos, sm.team, 1, false, sm.hp, sm) });
    if (w.sled.carrier < 0) list.push({ key: isoV(w.sled.pos).y, draw: () => drawSledFree(ctx, v, w.sled.pos, "#ffffff") });
    for (const r of w.rest)
      list.push({
        key: isoV(r.p).y,
        draw: () => {
          const s = isoV(r.p, heightAt(v.hill, r.p));
          ellipse(ctx, { x: s.x, y: s.y + 1 }, 4, 1.8);
          ctx.fillStyle = "rgba(40,50,90,0.3)";
          ctx.fill();
          ellipse(ctx, { x: s.x, y: s.y - 2.5 }, 3.5, 3.5);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = "#8f9cc2";
          ctx.lineWidth = 1;
          ctx.stroke();
        },
      });
    for (const b of w.balls) list.push({ key: isoV(b.pos).y + 2, draw: () => drawBall(ctx, v, b) });
  }
  list.sort((a, b) => a.key - b.key);
  for (const d of list) d.draw();

  // puffs: brief, never obscuring
  for (const p of puffs) {
    const s = isoV(p.p, p.z), k = p.t / p.life;
    ellipse(ctx, { x: s.x + p.dx * k, y: s.y + p.dy * k }, (p.kind === "hit" ? 5 : 3) * (1 - k * 0.5), (p.kind === "hit" ? 5 : 3) * (1 - k * 0.5));
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
    ctx.fill();
  }

  lighting(ctx, v);
  drawSnowfall(ctx, v.time, Math.min(1, (v.light.from + (v.light.to - v.light.from) * v.light.k) / 3));
  if (w && !v.attract) drawStrip(ctx, v);

  if (v.debug && v.debugText) {
    ctx.save();
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, H - 14 * v.debugText.length - 14, 660, 14 * v.debugText.length + 8);
    ctx.fillStyle = "#e8f0ff";
    v.debugText.forEach((l, i) => ctx.fillText(l, 14, H - 14 * (v.debugText!.length - i) - 2));
    if (w) {
      // flank lines and ranges for the designer
      const hu = w.kids[0];
      for (const r of [PLAIN.range, BLOWER.range]) {
        const c = isoV(hu.pos, heightAt(v.hill, hu.pos));
        ellipse(ctx, c, ringRadii(r).rx, ringRadii(r).ry);
        ctx.strokeStyle = "rgba(255,255,0,0.25)";
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/** Static blockout (no bots): porches, crown, props — for Art's 1s flank check. */
export function drawBlockout(ctx: CanvasRenderingContext2D, v: View) {
  draw(ctx, { ...v, w: null });
  // porch spawn arcs so the tester knows where they stand
  for (const [i, p] of v.hill.porch.entries()) {
    const s = isoV(p);
    ellipse(ctx, s, 26, 13);
    ctx.strokeStyle = i === 0 ? CHESTNUT_PAL.coat : v.pals[1].coat;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.save();
  ctx.font = "600 14px Fredoka, system-ui, sans-serif";
  ctx.fillStyle = "rgba(24,30,52,0.85)";
  ctx.fillText(`${v.hill.label} — 1/2/3 switch hill · D dusk`, 16, 26);
  ctx.restore();
}


// ------------------------------------------------------------------ snowfall (ambient, never thick enough to hide a ring)

const FLAKES = Array.from({ length: 150 }, (_, i) => {
  const r = (n: number) => noise(i * 7.31 + n * 13.7, n * 3.1 + i * 0.37);
  const layer = i < 90 ? 0 : i < 135 ? 1 : 2;
  return { x: r(1) * W * 1.2, y: r(2) * H, layer, sway: 0.6 + r(3) * 1.4, ph: r(4) * 6.28 };
});

export function drawSnowfall(ctx: CanvasRenderingContext2D, time: number, dusk: number) {
  const col = dusk > 0.5 ? "232,232,255" : "255,255,255";
  ctx.save();
  for (const f of FLAKES) {
    const sp = [16, 28, 46][f.layer], size = [1.1, 1.7, 2.6][f.layer], a = [0.55, 0.75, 0.85][f.layer];
    const y = (f.y + time * sp) % (H + 20) - 10;
    const x = (((f.x + time * sp * 0.35 + Math.sin(time * f.sway + f.ph) * 10) % (W * 1.2)) + W * 1.2) % (W * 1.2) - W * 0.1;
    ellipse(ctx, { x, y }, size, size);
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.fill();
  }
  ctx.restore();
}
