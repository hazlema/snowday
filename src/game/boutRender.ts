// Frosty's bout: same hill, streetlights on, Frosty on the crown, two snow mounds and their drawn safe zones.
import { boutPhase, burstStop, FROSTY, isSafe, safeHalfAngle, type Bout, type BoutEvent, type Mound } from "../sim/boss";
import { PLAIN, RING_R } from "../sim/const";
import { heightAt, type Hill } from "../sim/hill";
import { add, angleOf, clamp, dist, fromAngle, mul, norm, sub, type V } from "../sim/math";
import { H, iso, isoV, ringRadii, W, type S } from "./iso";
import {
  CHESTNUT_PAL,
  drawBall,
  drawCrown,
  drawGround,
  drawKid,
  drawRing,
  ellipse,
  houseDrawables,
  lighting,
  drawSnowfall,
  poly,
  propDrawables,
  puffs,
  rr,
  type Drawable,
  type TeamPal,
  type View,
} from "./render";

export interface BoutView {
  b: Bout;
  hill: Hill;
  rival: TeamPal;
  aim: V | null;
  time: number; // wall clock, for idle animation
  debug: string[] | null;
  card: string; // 'Snowballs only…': shown as the bout opens, until your first throw
}

let frostyHitAt = -9;
let kidHitAt = -9;

/** Cosmetic puffs for bout events. */
export function boutFx(e: BoutEvent, b: Bout) {
  const h = b.hill;
  const burst = (p: V, z: number, n: number, life: number, kind: "hit" | "splat" | "snow", spread: number) => {
    for (let i = 0; i < n; i++) puffs.push({ p, z, t: 0, life, kind, dx: Math.cos((i / n) * Math.PI * 2) * spread, dy: Math.sin((i / n) * Math.PI * 2) * spread * 0.5 - 10 });
  };
  if (e.type === "frostyHit") {
    frostyHitAt = b.t;
    burst(e.p, heightAt(h, e.p) + 1.4, 10, 0.5, "hit", 30);
  } else if (e.type === "kidHit") {
    kidHitAt = b.t;
    burst(e.p, heightAt(h, e.p) + 0.8, 9, 0.45, "hit", 28);
  } else if (e.type === "splat") burst(e.p, heightAt(h, e.p) + 0.6, 6, 0.35, "splat", 14);
  else if (e.type === "sweep") {
    // show the destination first: puffs exactly where the new mounds rise (and where the old ones sink)
    for (const m of b.mounds) burst(m.pos, heightAt(h, m.pos) + 0.3, 12, 0.9, "snow", 34);
  } else if (e.type === "over" && e.outcome === "melted") burst(b.frosty, h.crownH + 1.2, 18, 1.1, "snow", 60);
  else if (e.type === "over" && e.outcome !== "time") burst(b.kid.pos, heightAt(h, b.kid.pos) + 0.5, 14, 0.8, "snow", 34);
}

// ------------------------------------------------------------------ ground: safe zones

/** The drawn safe zone IS the rule (boss.ts safeBehind): a cone behind the mound, away from Frosty. */
function zonePoints(b: Bout, m: Mound): S[] {
  const F = b.frosty;
  const dm = dist(F, m.pos), am = angleOf(sub(m.pos, F)), half = safeHalfAngle(b, m);
  const pts: S[] = [];
  const at = (a: number, d: number) => {
    const p = add(F, fromAngle(a, d));
    pts.push(isoV(p, heightAt(b.hill, p)));
  };
  for (let d = dm; d <= 30; d += 0.5) at(am - half, d);
  for (let i = 0; i <= 8; i++) at(am - half + (2 * half * i) / 8, 30);
  for (let d = 30; d >= dm; d -= 0.5) at(am + half, d);
  for (let i = 8; i >= 0; i--) at(am - half + (2 * half * i) / 8, dm);
  return pts;
}

function drawZones(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b, bd = b.hill.bounds;
  const ph = boutPhase(b);
  const warn = ph === "sweep" || ph === "swirl" || ph === "burst";
  const inZone = isSafe(b, b.kid.pos);
  ctx.save();
  poly(ctx, [iso(bd.minX, bd.minY), iso(bd.maxX, bd.minY), iso(bd.maxX, bd.maxY), iso(bd.minX, bd.maxY)]);
  ctx.clip();
  for (const m of b.mounds) {
    if (m.dir === -1) continue;
    const pts = zonePoints(b, m);
    const pulse = warn ? 0.5 + 0.5 * Math.sin(v.time * 8) : 0;
    ctx.globalAlpha = m.grow;
    poly(ctx, pts);
    ctx.fillStyle = `rgba(55,65,105,${warn ? 0.2 + 0.08 * pulse : 0.11})`;
    ctx.fill();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = `rgba(255,255,255,${warn ? 0.85 : 0.45})`;
    ctx.lineWidth = warn ? 2.5 : 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  // you're covered: a soft ring under your boots
  if (inZone && !b.over) {
    const f = isoV(b.kid.pos, heightAt(b.hill, b.kid.pos));
    ellipse(ctx, f, 18, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawAimRing(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b, k = b.kid;
  if (!v.aim || b.over) return;
  let to = v.aim;
  if (dist(k.pos, to) > PLAIN.range) to = add(k.pos, mul(norm(sub(to, k.pos)), PLAIN.range));
  const a = isoV(k.pos, heightAt(b.hill, k.pos) + 0.75), c = isoV(to, heightAt(b.hill, to) + 0.35);
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.restore();
  drawRing(ctx, b.hill, to, "plain", k.throwCd > 0 || b.windup > 0 ? 0.35 : 0.7, RING_R);
}

// ------------------------------------------------------------------ mounds

function drawMound(ctx: CanvasRenderingContext2D, h: Hill, m: Mound) {
  if (m.grow <= 0.01) return;
  const z = heightAt(h, m.pos);
  const c = isoV(m.pos, z);
  const { rx, ry } = ringRadii(m.r);
  const ht = 34 * 1.05 * m.grow;
  ellipse(ctx, { x: c.x + 3, y: c.y + 2 }, rx + 3, ry + 2);
  ctx.fillStyle = "rgba(40,50,90,0.22)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI);
  ctx.bezierCurveTo(c.x - rx, c.y - ht * 0.9, c.x - rx * 0.45, c.y - ht * 1.05, c.x, c.y - ht);
  ctx.bezierCurveTo(c.x + rx * 0.45, c.y - ht * 1.05, c.x + rx, c.y - ht * 0.9, c.x + rx, c.y);
  const g = ctx.createLinearGradient(c.x - rx, c.y - ht, c.x + rx, c.y);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#c3cfe3");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(110,125,170,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // a couple of lumps so it reads as packed snow, not a rock
  for (const [ox, oy, r] of [[-0.35, -0.55, 0.22], [0.25, -0.75, 0.18]] as const) {
    ellipse(ctx, { x: c.x + rx * ox, y: c.y + ht * oy }, rx * r, rx * r * 0.6);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();
  }
}

// ------------------------------------------------------------------ Frosty

function stick(ctx: CanvasRenderingContext2D, from: S, dir: S, len: number) {
  const to = { x: from.x + dir.x * len, y: from.y + dir.y * len };
  ctx.strokeStyle = "#5b3b22";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  // a twig
  ctx.moveTo(from.x + dir.x * len * 0.6, from.y + dir.y * len * 0.6);
  ctx.lineTo(from.x + dir.x * len * 0.6 - dir.y * 7, from.y + dir.y * len * 0.6 + dir.x * 7 - 5);
  ctx.stroke();
  ellipse(ctx, to, 7, 6);
  ctx.fillStyle = "#c86a32";
  ctx.fill();
  ctx.strokeStyle = "#7a3a17";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function ball(ctx: CanvasRenderingContext2D, c: S, r: number) {
  const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.2, c.x, c.y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#cbd6ea");
  ellipse(ctx, c, r, r * 0.95);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(100,115,165,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function potHat(ctx: CanvasRenderingContext2D, c: S, wdt: number, tilt: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tilt);
  const hgt = wdt * 0.6;
  ctx.fillStyle = "#6f655c";
  ctx.beginPath();
  ctx.moveTo(-wdt / 2, 0);
  ctx.lineTo(-wdt / 2 + 3, -hgt);
  ctx.lineTo(wdt / 2 - 3, -hgt);
  ctx.lineTo(wdt / 2, 0);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, { x: 0, y: -hgt }, wdt / 2 - 3, 3.5);
  ctx.fillStyle = "#8a7f74";
  ctx.fill();
  // rust and the handle
  ctx.fillStyle = "rgba(150,80,40,0.55)";
  ctx.fillRect(-wdt / 4, -hgt * 0.7, 5, 4);
  ctx.strokeStyle = "#4b443e";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(wdt / 2 - 1, -hgt * 0.65);
  ctx.lineTo(wdt / 2 + 9, -hgt * 0.55);
  ctx.stroke();
  ellipse(ctx, { x: 0, y: 0 }, wdt / 2 + 2, 3.5);
  ctx.fillStyle = "#5a524b";
  ctx.fill();
  ctx.restore();
}

function drawFrosty(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b, h = b.hill, t = v.time;
  const base = isoV(b.frosty, h.crownH);
  const ph = boutPhase(b);
  ellipse(ctx, base, 46, 18);
  ctx.fillStyle = "rgba(40,50,90,0.28)";
  ctx.fill();

  if (b.over === "melted") {
    // slumps into a heap with his pot on top
    const k = clamp((b.t - b.overAt) / 0.9, 0, 1);
    ellipse(ctx, { x: base.x, y: base.y }, 40 + 12 * k, 14 + 4 * k);
    ctx.fillStyle = "#e8f0fb";
    ctx.fill();
    ctx.strokeStyle = "rgba(100,115,165,0.5)";
    ctx.stroke();
    const lump = 1 - k * 0.65;
    ball(ctx, { x: base.x, y: base.y - 18 * lump }, 26 * lump + 8);
    potHat(ctx, { x: base.x + 4, y: base.y - 18 * lump - (26 * lump + 8) * 0.8 }, 28, 0.25 * k);
    ctx.fillStyle = "#f08a2a";
    ctx.beginPath();
    ctx.moveTo(base.x + 26, base.y - 4);
    ctx.lineTo(base.x + 44, base.y + 1);
    ctx.lineTo(base.x + 26, base.y + 4);
    ctx.fill();
    return;
  }

  const shrink = 1 - (b.hits / FROSTY.hp) * 0.3; // visibly less of him each hit
  const dizzy = ph === "dizzy";
  const wob = dizzy ? Math.sin(t * 9) * 0.12 : ph === "swirl" && b.special?.kind === "double" ? Math.sin(t * 22) * 0.05 : 0;
  const r1 = 32 * shrink, r2 = 24 * shrink, r3 = 17 * shrink;
  const bob = Math.sin(t * 2.2) * 1.5;
  const p1 = { x: base.x, y: base.y - r1 * 0.85 };
  const p2 = { x: base.x + wob * 30, y: p1.y - r1 * 0.7 - r2 * 0.65 + bob * 0.5 };
  const p3 = { x: base.x + wob * 60, y: p2.y - r2 * 0.7 - r3 * 0.7 + bob };
  // facing: the carrot points at the kid's side of the screen
  const ks = isoV(b.kid.pos);
  const face = ks.x < base.x ? -1 : 1;

  // arms (behind the middle ball): pose per phase
  const sh = (s: number) => ({ x: p2.x + s * r2 * 0.85, y: p2.y - r2 * 0.15 });
  const dir = (x: number, y: number) => {
    const l = Math.hypot(x, y);
    return { x: x / l, y: y / l };
  };
  let la = dir(-1, 0.35), ra = dir(1, 0.35);
  const e = b.special ? b.t - b.special.start : 0;
  if (ph === "sweep") {
    // the mitten sweep that moves the mounds
    const k = e / FROSTY.sweep;
    ra = dir(Math.cos(Math.PI * (1 - k)) * face, 0.2);
  } else if (ph === "swirl" || ph === "burst") {
    if (b.special?.kind === "double") (la = dir(-1, -0.1 + Math.sin(t * 14) * 0.25)), (ra = dir(1, -0.1 - Math.sin(t * 14) * 0.25));
    else (la = dir(-0.45, -1)), (ra = dir(0.45, -1));
  } else if (dizzy) (la = dir(-0.8, 0.8)), (ra = dir(0.8, 0.8));
  else if (b.throwPose > 0) {
    const k = b.throwPose / 0.35;
    if (face > 0) ra = dir(1, -0.6 + k);
    else la = dir(-1, -0.6 + k);
  } else {
    la = dir(-1, 0.3 + Math.sin(t * 1.7) * 0.15);
    ra = dir(1, 0.3 - Math.sin(t * 1.7) * 0.15);
  }
  stick(ctx, sh(-1), la, 30 * shrink + 6);
  stick(ctx, sh(1), ra, 30 * shrink + 6);

  ball(ctx, p1, r1);
  ball(ctx, p2, r2);
  // coal buttons
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, { x: p2.x + face * 3, y: p2.y - r2 * 0.25 + i * r2 * 0.32 }, 2.6, 2.6);
    ctx.fillStyle = "#1f2230";
    ctx.fill();
  }
  // purple scarf with a tail
  ctx.fillStyle = "#7d4fa3";
  ctx.beginPath();
  ctx.ellipse(p2.x + wob * 15, p2.y - r2 * 0.78, r3 * 0.95, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(p2.x - face * r3 * 0.5 - 4, p2.y - r2 * 0.78, 8, 18 + Math.sin(t * 3) * 2);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(p2.x - face * r3 * 0.5 - 4, p2.y - r2 * 0.78 + 8, 8, 3);
  ball(ctx, p3, r3);
  // face: coal eyes (spirals when dizzy), carrot nose
  for (const s of [-1, 1]) {
    const ex = p3.x + face * 3 + s * 5.5, ey = p3.y - 3;
    if (dizzy) {
      ctx.strokeStyle = "#1f2230";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.8, t * 8, t * 8 + Math.PI * 1.6);
      ctx.stroke();
    } else {
      ellipse(ctx, { x: ex, y: ey }, 2.6, ph === "swirl" ? 1.4 : 2.6);
      ctx.fillStyle = "#1f2230";
      ctx.fill();
    }
  }
  ctx.fillStyle = "#f08a2a";
  ctx.beginPath();
  ctx.moveTo(p3.x + face * 3, p3.y + 0.5);
  ctx.lineTo(p3.x + face * 22, p3.y + 3.5);
  ctx.lineTo(p3.x + face * 3, p3.y + 5.5);
  ctx.fill();
  potHat(ctx, { x: p3.x, y: p3.y - r3 * 0.7 }, 30 * shrink + 4, -0.12 * face + wob);

  // a hit flashes him white
  const since = b.t - frostyHitAt;
  if (since >= 0 && since < 0.18) {
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - since / 0.18);
    for (const [p, r] of [[p1, r1], [p2, r2], [p3, r3]] as const) {
      ellipse(ctx, p, r + 2, r + 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();
  }
  // dizzy: stars round his head (free throws)
  if (dizzy) {
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i * Math.PI) / 2;
      star(ctx, { x: p3.x + Math.cos(a) * 24, y: p3.y - r3 - 6 + Math.sin(a) * 7 }, 5, "#ffd34d");
    }
  }
}

function star(ctx: CanvasRenderingContext2D, c: S, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(c.x + Math.cos(a) * rr2, c.y + Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** The warning: a snowflake swirl tight around Frosty, bigger each half second. */
function drawSwirl(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b, s = b.special;
  if (!s) return;
  const e = b.t - s.start - FROSTY.sweep;
  if (e < 0) return;
  const last = s.releases[s.releases.length - 1];
  if (b.t > last + 0.2) return;
  const step = Math.min(4, Math.floor(e / 0.5));
  const k = Math.min(1, e / FROSTY.swirl);
  const c = isoV(b.frosty, b.hill.crownH + 1.4);
  const n = 14 + step * 7;
  const R = 46 + step * 13;
  const spin = s.kind === "double" ? -1 : 1;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = spin * v.time * (2.2 + step * 0.6) + (i / n) * Math.PI * 2;
    const rad = R * (0.75 + 0.25 * Math.sin(i * 1.7 + v.time * 3));
    const p = { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad * 0.5 + Math.sin(i * 2.3) * 14 };
    const sz = 3 + step * 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * k})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const q = (j * Math.PI) / 3 + v.time * 2;
      ctx.moveTo(p.x - Math.cos(q) * sz, p.y - Math.sin(q) * sz);
      ctx.lineTo(p.x + Math.cos(q) * sz, p.y + Math.sin(q) * sz);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** The burst itself: a gapless ring of flat snowballs; each stops at the first mound. */
function burstDrawables(v: BoutView, out: Drawable[], ctx: CanvasRenderingContext2D) {
  const b = v.b, s = b.special;
  if (!s) return;
  const bd = b.hill.bounds;
  for (const r of s.releases) {
    const e = b.t - r;
    if (e < 0 || e > 1.3) continue;
    const front = FROSTY.burstSpeed * e;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const stop = burstStop(b, a);
      const d = Math.max(FROSTY.body, Math.min(front, stop));
      const p = add(b.frosty, fromAngle(a, d));
      if (p.x < bd.minX - 1 || p.x > bd.maxX + 1 || p.y < bd.minY - 1 || p.y > bd.maxY + 1) continue;
      if (front > stop + 0.8) continue; // splatted on the mound
      const z = heightAt(b.hill, p) + 0.75;
      out.push({
        key: isoV(p).y + 1,
        draw: () => {
          const s1 = isoV(p, z);
          const back = add(b.frosty, fromAngle(a, Math.max(FROSTY.body, d - 1.2)));
          const s0 = isoV(back, heightAt(b.hill, back) + 0.75);
          const g = ctx.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(1, "rgba(255,255,255,0.95)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(s1.x, s1.y);
          ctx.stroke();
          ellipse(ctx, s1, 4.5, 4.5);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = "#7f8db5";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        },
      });
    }
  }
}

/** Lost: a kid-shaped snowdrift, then your hat, then a mitten, popping out. */
function drawDrift(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b, k = b.kid;
  const f = isoV(k.pos, heightAt(b.hill, k.pos));
  const e = b.t - b.overAt;
  ellipse(ctx, f, 20, 8);
  ctx.fillStyle = "rgba(40,50,90,0.25)";
  ctx.fill();
  ball(ctx, { x: f.x - 4, y: f.y - 8 }, 14);
  ball(ctx, { x: f.x + 7, y: f.y - 16 }, 9);
  const pop = (delay: number, dx: number, draw: (c: S) => void) => {
    const u = e - delay;
    if (u < 0) return;
    const k2 = Math.min(1, u / 0.5);
    draw({ x: f.x + dx * k2, y: f.y - 22 - Math.sin(k2 * Math.PI) * 26 + k2 * 14 });
  };
  pop(0.3, -14, (c) => {
    ellipse(ctx, c, 9, 6);
    ctx.fillStyle = CHESTNUT_PAL.coat;
    ctx.fill();
    ctx.fillStyle = CHESTNUT_PAL.light;
    ctx.fillRect(c.x - 9, c.y + 1, 18, 3);
  });
  pop(0.65, 16, (c) => {
    ellipse(ctx, c, 5, 4);
    ctx.fillStyle = CHESTNUT_PAL.dark;
    ctx.fill();
  });
}

// ------------------------------------------------------------------ strip

function mitten(ctx: CanvasRenderingContext2D, c: S, on: boolean) {
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.28;
  ellipse(ctx, c, 8, 10);
  ctx.fillStyle = CHESTNUT_PAL.coat;
  ctx.fill();
  ellipse(ctx, { x: c.x - 8, y: c.y + 1 }, 3.5, 5);
  ctx.fill();
  ctx.fillStyle = CHESTNUT_PAL.light;
  ctx.fillRect(c.x - 8, c.y + 6, 16, 4);
  ctx.restore();
}

/** The bout card (QA): your gear isn't broken, it's in the garage. Until your first throw, at most 4s. */
function drawCard(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b;
  if (!v.card || b.lastThrow >= 0 || b.t >= 4) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (4 - b.t) / 0.6, b.t / 0.25 + 0.2);
  ctx.font = "700 18px Fredoka, system-ui, sans-serif";
  const w = ctx.measureText(v.card).width + 40;
  rr(ctx, W / 2 - w / 2, 66, w, 36, 10);
  ctx.fillStyle = "rgba(26,32,56,0.82)";
  ctx.fill();
  ctx.fillStyle = "#fff6ea";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(v.card, W / 2, 84);
  ctx.restore();
}

function drawStrip(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b;
  ctx.save();
  rr(ctx, W / 2 - 260, 10, 520, 46, 12);
  ctx.fillStyle = "rgba(26,32,56,0.82)";
  ctx.fill();
  ctx.font = "800 17px Fredoka, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#dfe8ff";
  ctx.fillText("FROSTY", W / 2 - 246, 33);
  // ten snowballs: each hit melts one
  for (let i = 0; i < FROSTY.hp; i++) {
    const c = { x: W / 2 - 160 + i * 17, y: 33 };
    const melted = i >= FROSTY.hp - b.hits;
    ellipse(ctx, c, 6.5, 6.5);
    ctx.fillStyle = melted ? "rgba(140,170,220,0.25)" : "#ffffff";
    ctx.fill();
    if (!melted) {
      ctx.strokeStyle = "#8f9cc2";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // clock
  const left = Math.max(0, Math.ceil(FROSTY.len - b.t));
  const late = left <= 10 && !b.over;
  ctx.font = `800 ${late ? 22 : 19}px Fredoka, system-ui, sans-serif`;
  ctx.fillStyle = late ? "#ffd34d" : "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(`0:${String(left).padStart(2, "0")}`, W / 2 + 92, 33);
  ctx.textAlign = "left";
  // your three hit points
  for (let i = 0; i < FROSTY.lives; i++) mitten(ctx, { x: W / 2 + 160 + i * 28, y: 33 }, i < b.lives);
  const since = b.t - kidHitAt;
  if (since >= 0 && since < 0.4) {
    ctx.globalAlpha = 1 - since / 0.4;
    rr(ctx, W / 2 + 140, 14, 100, 38, 10);
    ctx.strokeStyle = "#ff7a5c";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ draw

export function drawBout(ctx: CanvasRenderingContext2D, v: BoutView) {
  const b = v.b;
  const view: View = {
    w: null, hill: v.hill, pals: [CHESTNUT_PAL, v.rival], aim: null,
    light: { from: 3, to: 3, k: 1, lamps: 1 }, time: v.time, roundsWon: [0, 0], debug: false,
  };
  drawGround(ctx, view);
  drawCrown(ctx, view);
  drawZones(ctx, v);
  for (const ball2 of b.balls) drawRing(ctx, v.hill, ball2.to, ball2.kind, ball2.mine ? 0.55 : 1, ball2.ringR);
  drawAimRing(ctx, v);
  // wind-up: an arc filling under your boots, you're planted until it's full
  if (b.windup > 0) {
    const f = isoV(b.kid.pos, heightAt(b.hill, b.kid.pos));
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, 16, 7, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - b.windup / FROSTY.windup));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const list: Drawable[] = [];
  houseDrawables(ctx, view, list);
  propDrawables(ctx, view, list);
  for (const m of b.mounds) list.push({ key: isoV(m.pos).y, draw: () => drawMound(ctx, v.hill, m) });
  list.push({ key: isoV(b.frosty).y, draw: () => drawFrosty(ctx, v) });
  const lost = b.over === "hits" || b.over === "blizzard";
  if (lost) list.push({ key: isoV(b.kid.pos).y, draw: () => drawDrift(ctx, v) });
  else {
    const k = b.kid;
    if (b.windup > 0) k.planting = 0.01; // crouch while winding up (cosmetic)
    // a plain snowball in hand whenever one is packed and ready
    const hold = k.throwCd <= 0 && b.windup <= 0 && b.stunned <= 0;
    list.push({ key: isoV(k.pos).y, draw: () => drawKid(ctx, view, k, CHESTNUT_PAL, false, hold) });
  }
  for (const ball2 of b.balls) list.push({ key: isoV(ball2.pos).y + 2, draw: () => drawBall(ctx, view, ball2) });
  burstDrawables(v, list, ctx);
  list.sort((a, c) => a.key - c.key);
  for (const d of list) d.draw();
  b.kid.planting = 0;

  for (const p of puffs) {
    const s = isoV(p.p, p.z), k = p.t / p.life;
    const r = (p.kind === "hit" ? 5 : p.kind === "snow" ? 4 : 3) * (1 - k * 0.5);
    ellipse(ctx, { x: s.x + p.dx * k, y: s.y + p.dy * k }, r, r);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
    ctx.fill();
  }
  drawSwirl(ctx, v);

  lighting(ctx, view);
  drawSnowfall(ctx, v.time, 1);
  drawStrip(ctx, v);
  drawCard(ctx, v);

  if (v.debug) {
    ctx.save();
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, H - 14 * v.debug.length - 14, 560, 14 * v.debug.length + 8);
    ctx.fillStyle = "#e8f0ff";
    v.debug.forEach((l, i) => ctx.fillText(l, 14, H - 14 * (v.debug!.length - i) - 2));
    ctx.restore();
  }
}
