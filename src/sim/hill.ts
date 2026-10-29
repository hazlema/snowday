import { CROWN_R } from "./const";
import { v, type V } from "./math";

/** Static blockout pieces. Hill A has none: walls are the only structure in play. */
export interface Prop {
  kind: "hedge" | "fence" | "tree" | "bench" | "bank" | "pond";
  a: V;
  b: V; // same as a for round props
  r: number;
}

export interface Hill {
  id: "A" | "B" | "park";
  label: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  crown: V;
  crownH: number;
  slope: { rx: number; ry: number };
  porch: [V, V]; // porch door at the foot of each team's side: [Chestnut, rival]
  stand: V; // cocoa stand, side of the hill, off the field
  standExit: V;
  sledR1: V; // round 1: human's lane, 2-3m from their porch
  sledFoot: V; // rounds 2-3: dead centre at the foot
  lamps: V[];
  props: Prop[];
  playable: boolean; // false = static blockout (flank check only)
}

const BOUNDS = { minX: -12, maxX: 12, minY: -6.5, maxY: 6.5 };
const LAMPS = [v(-12.8, -5.5), v(-4.5, -7.3), v(4.5, -7.3), v(12.8, 5.5), v(4.5, 7.3), v(-4.5, 7.3), v(-12.8, 5.5), v(12.8, -5.5)];

function base(id: Hill["id"], label: string): Hill {
  return {
    id,
    label,
    bounds: BOUNDS,
    crown: v(0, 0),
    crownH: 1.8,
    slope: { rx: 10.5, ry: 6.0 },
    porch: [v(-12, 0), v(12, 0)],
    stand: v(0, 7.5),
    standExit: v(0, 6.0),
    sledR1: v(-9.5, 0),
    sledFoot: v(0, -5.8),
    lamps: LAMPS,
    props: [],
    playable: false,
  };
}

/** Hill A: Chestnut's own hill. Open approaches; the greybox plays here. */
export const HILL_A: Hill = { ...base("A", "Hill A: Chestnut's hill"), playable: true };

/** Hill B: Maple's yard. Same crown, different approaches: a hedge splits the
 * direct line, flank routes run along the far lawn and the driveway. */
export const HILL_B: Hill = {
  ...base("B", "Hill B: the away yard (blockout)"),
  props: [
    { kind: "hedge", a: v(-6.5, -1.6), b: v(-6.5, 1.6), r: 0.45 },
    { kind: "hedge", a: v(6.5, -1.6), b: v(6.5, 1.6), r: 0.45 },
    { kind: "fence", a: v(-3.5, -4.6), b: v(3.5, -4.6), r: 0.15 },
    { kind: "bank", a: v(-9, 3.8), b: v(-7.2, 4.4), r: 0.5 },
    { kind: "bank", a: v(9, -3.8), b: v(7.2, -4.4), r: 0.5 },
    { kind: "tree", a: v(-3.8, 4.4), b: v(-3.8, 4.4), r: 0.55 },
    { kind: "tree", a: v(3.8, 4.4), b: v(3.8, 4.4), r: 0.55 },
  ],
};

/** The park: decider hill. Trees and benches; flanks are the two paths
 * around the pond side and the playground side. */
export const PARK: Hill = {
  ...base("park", "The park (blockout)"),
  props: [
    { kind: "tree", a: v(-7, -2.5), b: v(-7, -2.5), r: 0.6 },
    { kind: "tree", a: v(-7.5, 2.8), b: v(-7.5, 2.8), r: 0.6 },
    { kind: "tree", a: v(7, 2.5), b: v(7, 2.5), r: 0.6 },
    { kind: "tree", a: v(7.5, -2.8), b: v(7.5, -2.8), r: 0.6 },
    { kind: "bench", a: v(-4.2, -0.8), b: v(-4.2, 0.8), r: 0.25 },
    { kind: "bench", a: v(4.2, -0.8), b: v(4.2, 0.8), r: 0.25 },
    { kind: "pond", a: v(-2.5, -5.4), b: v(2.5, -5.4), r: 0.9 },
  ],
};

export const HILLS = { A: HILL_A, B: HILL_B, park: PARK };

const smooth = (s: number) => s * s * (3 - 2 * s);
const CROWN_DOME = 0.5;

/** Visual elevation only: the sim plays on the ground plane. */
export function heightAt(h: Hill, p: V): number {
  const dx = p.x - h.crown.x, dy = p.y - h.crown.y;
  const d = Math.hypot(dx, dy);
  // a gentle dome on the crown (flat in play, rounded to the eye); zero slope where it meets the sides
  if (d <= CROWN_R) return h.crownH + CROWN_DOME * (1 - (d / CROWN_R) ** 2) ** 2;
  const c = dx / d, s = dy / d;
  const R = 1 / Math.hypot(c / h.slope.rx, s / h.slope.ry);
  const t = Math.min(1, Math.max(0, (d - CROWN_R) / (R - CROWN_R)));
  return h.crownH * (1 - smooth(t));
}

export function inBounds(h: Hill, p: V, pad = 0) {
  const b = h.bounds;
  return p.x >= b.minX + pad && p.x <= b.maxX - pad && p.y >= b.minY + pad && p.y <= b.maxY - pad;
}
