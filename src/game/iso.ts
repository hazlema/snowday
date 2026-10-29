import { heightAt, type Hill } from "../sim/hill";
import type { V } from "../sim/math";

// One fixed iso shot. Whole playable hill in 1280x720, no pan, no follow.
export const W = 1280;
export const H = 720;
export const A = 30; // px per world unit along each iso axis
export const OX = 640;
export const OY = 404;
export const ZS = 34; // px per metre of height

export interface S {
  x: number;
  y: number;
}

export const iso = (x: number, y: number, z = 0): S => ({ x: OX + (x + y) * A, y: OY + (y - x) * A * 0.5 - z * ZS });
export const isoV = (p: V, z = 0) => iso(p.x, p.y, z);

export function unIso(sx: number, sy: number): V {
  const u = (sx - OX) / A, w = (sy - OY) / (A * 0.5);
  return { x: (u - w) / 2, y: (u + w) / 2 };
}

/** Screen point -> the hill surface you can see there: march down the camera ray, take the first hit. */
export function pickGround(h: Hill, sx: number, sy: number): V {
  const at = (z: number) => unIso(sx, sy + z * ZS);
  const above = (z: number) => heightAt(h, at(z)) < z;
  let hi = 3;
  for (let z = hi - 0.04; z > 0; z -= 0.04) {
    if (!above(z)) {
      let lo = z;
      for (let i = 0; i < 12; i++) {
        const m = (lo + hi) / 2;
        if (above(m)) hi = m;
        else lo = m;
      }
      return at((lo + hi) / 2);
    }
    hi = z;
  }
  return at(0);
}

/** Screen-space direction (e.g. WASD) -> world-space direction. */
export function screenDirToWorld(dx: number, dy: number): V {
  const x = dx - 2 * dy, y = dx + 2 * dy;
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/** Screen ellipse radii for a world circle of radius r. */
export const ringRadii = (r: number) => ({ rx: Math.SQRT2 * r * A, ry: (Math.SQRT2 * r * A) / 2 });
