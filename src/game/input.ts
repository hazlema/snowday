// Three controls: move, aim/throw, wall. Keyboard+mouse or a gamepad.
//   KB/M: WASD/arrows move, or HOLD right-click to walk toward the cursor · mouse aims the landing ring ·
//         left-click throws (or hands off the sled) · Space / middle-click = wall
//   Pad:  left stick move · right stick aims the ring · releasing the stick throws (RT also throws) · A / LB = wall
import { PLAIN } from "../sim/const";
import { mul, type V } from "../sim/math";
import { H, screenDirToWorld, W } from "./iso";

export interface Frame {
  moveScreen: { x: number; y: number };
  aimScreen: { x: number; y: number } | null; // mouse, canvas px
  aimStick: V | null; // pad: world-space offset from the kid, metres
  throwEdge: boolean;
  throwHeld: boolean; // left mouse / RT held (the launcher sprays while held)
  wallEdge: boolean;
  moveToAim: boolean; // right mouse held: walk toward the cursor
}

export class Input {
  keys = new Set<string>();
  mouse = { x: W / 2, y: H / 2 };
  private throwQ = false;
  private wallQ = false;
  private rmb = false;
  private lmb = false;
  private usingPad = false;
  private padAim: V | null = null;
  private padWasAiming = false;
  private padPrev: boolean[] = [];
  onKey: (code: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (e.code === "Space") this.wallQ = true;
        this.onKey(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.rmb = false;
      this.lmb = false;
    });
    // released anywhere (even off the canvas) stops the walk
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.rmb = false;
      if (e.button === 0) this.lmb = false;
    });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
      this.usingPad = false;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) (this.throwQ = true), (this.lmb = true);
      if (e.button === 1) {
        e.preventDefault(); // no autoscroll / paste
        this.wallQ = true;
      }
      if (e.button === 2) this.rmb = true;
      this.usingPad = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  poll(): Frame {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) my -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;

    let throwEdge = this.throwQ, wallEdge = this.wallQ, throwHeld = this.lmb;
    this.throwQ = this.wallQ = false;

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (x: number) => (Math.abs(x) < 0.2 ? 0 : x);
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
      const rm = Math.hypot(rx, ry);
      const pressed = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] && !this.padPrev[i];
      if (lx || ly || rm > 0.35 || pressed.some(Boolean)) this.usingPad = true;
      if (this.usingPad) {
        mx = lx;
        my = ly;
        if (rm > 0.35) {
          // stick deflection sets distance: full tilt = full plain range
          const d = screenDirToWorld(rx, ry);
          this.padAim = mul(d, Math.min(1, rm) * PLAIN.range);
          this.padWasAiming = true;
        } else if (rm < 0.2 && this.padWasAiming) {
          throwEdge = true; // release throws
          this.padWasAiming = false;
        }
        if (edge(7) || edge(5)) throwEdge = true;
        throwHeld = !!(pressed[7] || pressed[5]);
        if (edge(0) || edge(4)) wallEdge = true;
      }
      this.padPrev = pressed;
    }

    const ml = Math.hypot(mx, my);
    return {
      moveScreen: ml > 1 ? { x: mx / ml, y: my / ml } : { x: mx, y: my },
      aimScreen: this.usingPad ? null : this.mouse,
      aimStick: this.usingPad ? this.padAim : null,
      moveToAim: this.rmb && !this.usingPad,
      throwEdge,
      throwHeld,
      wallEdge,
    };
  }
}

/** Screen-space stick/keys -> world move vector, keeping the magnitude. */
export function moveToWorld(m: { x: number; y: number }): V {
  const l = Math.hypot(m.x, m.y);
  if (l < 1e-6) return { x: 0, y: 0 };
  return mul(screenDirToWorld(m.x, m.y), Math.min(1, l));
}

