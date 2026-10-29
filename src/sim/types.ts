import type { Hill } from "./hill";
import type { Recorder } from "./log";
import type { Rng, V } from "./math";

export type Team = 0 | 1; // 0 = Chestnut (human's street), 1 = rival street
export type Role = "beanie" | "pockets" | "brick" | "copycat";
export type KidState = "play" | "chilled" | "toStand" | "atStand";
export type BallKind = "plain" | "ice" | "rock" | "blower";

export interface Kit {
  ball: "plain" | "ice" | "rock";
  launcher: boolean;
  melter: boolean;
  snowman: boolean;
}
export type Outcome = "hit" | "wall" | "empty" | "stepped out";

export interface Wall {
  id: number;
  owner: number;
  team: Team;
  a: V;
  b: V;
  c: V;
  angle: number; // facing direction of the planter
  dents: { p: V; t: number }[]; // persistent splats, cosmetic only
  bornAt: number;
}

export interface WallSpot {
  a: V;
  b: V;
  c: V;
  angle: number;
  legal: boolean;
}

export interface Kid {
  id: number;
  name: string;
  team: Team;
  role: Role; // AI logic (the human's role only matters as a bot stand-in)
  isHuman: boolean;
  bot: boolean; // driven by AI (false only for a live human)
  hat: "trapper" | "beanie" | "cap" | "mitten";
  pos: V;
  vel: V; // intended velocity this tick
  seenVel: V; // measured, smoothed velocity (what a thrower can actually read)
  facing: number;
  state: KidState;
  stateT: number;
  chillAt: number;
  returnAt: number; // last time back in play from the stand
  chills: number;
  carrying: boolean;
  planting: number; // seconds left on a plant (0 = not planting)
  plantSpot: WallSpot | null;
  plantKind: "wall" | "snowman";
  wallCd: number; // build cooldown (wall or snowman)
  throwCd: number;
  blowerCd: number;
  wall: Wall | null;
  snowman: Snowman | null;
  kit: Kit;
  credits: number;
  earned: number; // credits earned this round
  crownAcc: number; // crown-seconds toward the next credit
  hopper: number; // launcher balls left
  launchCd: number;
  lastFire: number;
  refillT: number;
  reloading: number;
  thawCd: number; // melter recharge
  burstUntil: number; // bots: launcher burst in progress
  burstTarget: number;
  throwPose: number; // anim timer
  waving: boolean; // eligible handoff target signal
  // AI memory
  dodge: { dir: V; ballId: number; startAt: number } | null;
  reacts: { ballId: number; at: number }[];
  copiedSeq: number;
  copyGrabUntil: number;
  thinkT: number;
  wanderAt: number; // bot carrier: next time to pick a new spot on the crown
  wanderTo: V | null;
}

export interface Ball {
  id: number;
  owner: number;
  team: Team;
  kind: BallKind;
  pellet: boolean; // launcher shot
  ringR: number;
  smashed: number[]; // rock: walls/snowmen already smashed through
  from: V;
  to: V;
  t: number;
  T: number;
  pos: V;
  target: number; // intended target kid id, -1 none
  targetDist: number;
  targetFront: boolean;
  targetBusy: boolean;
  targetInRing: boolean;
  closest: number;
  volley: number; // siege volley number (per defending team), -1 = an ordinary throw
}

export interface RestBall {
  p: V;
  from: V; // where the skid started (for the skid mark)
  t: number;
  kind: BallKind;
}

export interface Snowman {
  id: number;
  owner: number;
  team: Team;
  pos: V;
  hp: number;
  fireCd: number;
  bornAt: number;
}

export interface Sled {
  pos: V;
  carrier: number; // kid id or -1
  lastTeam: Team | -1; // last team to carry (possession changes)
  noPickupUntil: number;
}

export type GameEvent =
  | { type: "whistle" }
  | { type: "throw"; p: V; kind: BallKind; pellet: boolean }
  | { type: "hit"; kid: number; p: V }
  | { type: "splat"; p: V }
  | { type: "miss"; p: V }
  | { type: "grab"; kid: number }
  | { type: "drop"; kid: number }
  | { type: "handoff"; from: number; to: number }
  | { type: "plantStart"; kid: number }
  | { type: "plant"; kid: number }
  | { type: "wallBreak"; p: V }
  | { type: "melt"; p: V }
  | { type: "thaw"; kid: number; by: number }
  | { type: "snowman"; kid: number }
  | { type: "snowmanBreak"; p: V }
  | { type: "crownSecond"; team: Team }
  | { type: "duskStep"; step: number }
  | { type: "lights" }
  | { type: "tick"; left: number }
  | { type: "suddenDeath" }
  | { type: "roundOver"; winner: Team };

export interface HumanInput {
  move: V; // world-space, magnitude <= 1
  aim: V; // world-space point
  throwPressed: boolean;
  throwHeld: boolean; // launcher: hold to spray
  wallPressed: boolean;
}

export interface SiegeCfg {
  cadence: number; // seconds between volleys
  plains: number; // plain rings per volley
  cappers: number; // blower cappers per volley
}

export interface Siege {
  defenders: Team;
  carrier: number;
  start: number;
  nextAt: number;
  volleys: number;
}

export interface RoundCfg {
  seed: number;
  round: number; // 0-based
  hill: Hill;
  reaction: number; // bot reaction seconds
  rival: Role[]; // 4 roles for the rival team
  humanBot: boolean; // true = bot run (human slot played by the stand-in)
  roundLen?: number; // seconds until the streetlights (default ROUND_LEN)
  kits?: Kit[]; // per kid id, from the garage
  credits?: number[]; // per kid id, carried within the match
  siege?: SiegeCfg; // street tier (default street 1)
}

export interface World {
  cfg: RoundCfg;
  hill: Hill;
  rng: Rng;
  t: number;
  phase: "play" | "sudden" | "over";
  sdT: number;
  sdHold: { team: Team | -1; t: number };
  winner: Team | -1;
  score: [number, number];
  kids: Kid[];
  balls: Ball[];
  rest: RestBall[];
  walls: Wall[];
  snowmen: Snowman[];
  siege: Siege | null;
  volleyN: [number, number]; // volleys released, per defending team
  lastVolleyChill: [number, number]; // per defending team: the volley that last chilled a carrier
  sled: Sled;
  events: GameEvent[];
  nextId: number;
  duskStep: number;
  crownPulse: number; // anim
  lastOnCrown: number; // last time a carrier stood on the crown
  handoffTarget: number; // the ONE ally the strip outlines for the human, -1 none
  humanAct: { seq: number; type: "throw" | "wall" | "grab"; t: number } | null;
  log: Recorder;
  stats: RoundStats;
}

export interface RoundStats {
  crownTime: number;
  possChanges: number[];
  handoffs: number[];
  holdTeam: Team | -1;
  holdStart: number;
  longestHold: number;
  freeSince: number;
  longestFree: number;
  carrySecs: Record<number, number>; // crown-seconds per carrier
  humanOut: number; // seconds the human can't act
  humanFirstTouch: number;
  silentPresses: number; // handoff presses with no legal target, before first success
  silentPressesTotal: number;
  firstHandoff: number;
  wallPresses: number;
  wallPressesCooldown: number;
  wallPressesIllegal: number;
  lastSecond: number;
  holds: number[]; // finished crown holds (s)
  volleyChills: number; // carriers chilled by a volley
  chillsBy: { plain: number; launcher: number; other: number }; // by the item that did it (QA #32)
  backToBack: number; // carriers chilled by two volleys in a row
}
