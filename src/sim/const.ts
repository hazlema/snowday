// Every number here is either from the frozen ruleset (v4) or marked GREYBOX
// (a value the ruleset leaves open; tune from the bot CSV, never from taste).

export const DT = 1 / 60;

export const ROUND_LEN = 120; // streetlights at 120s (owner: 180 felt very long)
export const COUNTDOWN = 20; // exact countdown in the last 20s
export const DUSK_STEPS = [0, 0.25, 0.5, 0.75]; // fractions of the round: afternoon -> dusk in 4 steps, then lights
export const SD_HOLD = 5; // sudden death: hold the crown 5 continuous s
export const SD_CAP = 60; // after 60s the first crown-second wins

export const KID_SPEED = 4.5; // GREYBOX m/s (human move speed; bots dodge at this too)
export const KID_ACCEL = 22.5; // GREYBOX m/s^2: 0.2s to full speed (spec's 0.25s dodge step)
export const DODGE_SLOP = 0.1; // spec: clear a ring = reaction + 0.25s step + 0.1s slop
export const CARRY_MUL = 0.6; // carrier: 60% speed
export const KID_R = 0.3; // GREYBOX body radius for contact
export const BALL_R = 0.1; // GREYBOX
export const RING_R = 0.8; // landing ring radius
export const THROW_CD = 0.6; // GREYBOX scoop-and-pack a new ball, everyone (owner 2026-10-28: 1.2 took too long to shoot)
export const BOT_THROW_JITTER = 0.35; // bots add 0..this on top (was 0.7, halved with THROW_CD)
export const BLOWER_CD = 8; // GREYBOX Pockets' blower recharge (swept 6-16: 8 keeps poss changes >= 6 and holds <= 25s)

export const PLAIN = { base: 0.35, perM: 0.05, range: 12 }; // flat, never clears a wall
export const BLOWER = { base: 0.5, perM: 0.12, range: 14 }; // high lob, clears walls

export const WALL = {
  len: 1.5,
  thick: 0.4, // GREYBOX
  plant: 1.0, // 1s plant, busy
  cooldown: 8, // after any plant or break
  offset: 0.7, // GREYBOX: wall centre this far in front of the planter
};

export const CROWN_R = 4.0; // every crown: flat, 4m radius (design doc rule 11)
export const SLED_NO_BUILD = 2.0; // no wall within 2m of the sled
export const PICKUP_R = 0.65; // GREYBOX touch distance
export const HANDOFF_R = 6;

export const CHILL_FREEZE = 1.0; // GREYBOX: stopped + visibly chilled before walking
export const CHILL_OUT = 8.0; // ~8s out of play including the walk
export const FALLBACK_AFTER = 3.0; // fallback carrier when Beanie is chilled 3s+
export const BEANIE_THROW_AFTER = 5.0; // Beanie throws only when sled off crown 5s+
export const COPY_DELAY = 2.0; // Copycat repeats 2s after the human acts
export const FRONT_ARC = (120 / 2) * (Math.PI / 180); // fair-bot facing arc half-angle

export const SKID_MIN = 0.4; // GREYBOX: a miss skids past the boots
export const SKID_MAX = 1.0;

// ---------------------------------------------------------------- garage upgrades (owner's brief:
// snowball types, a launcher, a melter, a snowman; bought with credits between rounds)

export const ICE = { base: 0.25, perM: 0.03, range: 12 }; // faster flat line; shatters the wall it hits
export const ROCK_KNOCK = 1.5; // rock: smashes through walls and knocks the kid back (m)
export const PELLET = { base: 0.3, perM: 0.04, range: 9, ring: 0.45 }; // launcher shot: small, short
export const LAUNCHER = {
  rate: 0.13, // seconds between shots while held
  hopper: 15,
  refillDelay: 0.6, // stop firing this long and it starts topping up
  refillEvery: 0.2,
  emptyReload: 2.5, // run it dry and you wait
  spread: 0.5, // metres of scatter at full range
  burst: 0.75, // bots fire bursts this long
};
export const SNOWMAN = { r: 0.45, hp: 3, build: 1.5, cooldown: 12, range: 8, fireEvery: 2.2, offset: 0.9 };
export const MELT_R = 0.35; // melter: enemy walls/snowmen this close to your body melt
export const THAW_R = 1.2; // melter: chilled teammates this close thaw instantly
export const THAW_CD = 6; // ...but the thermos needs this long between thaws

export const CREDITS = { hit: 1, crownSecs: 6, round: 4, roundWin: 2 }; // per kid; 4/round = the cheapest item, so the shelf is never bare

// ---------------------------------------------------------------- siege (Host playtest 1: the crown was too safe)

export const SIEGE = {
  trigger: 2, // an enemy carrier within 2m of the crown edge is under siege
  firstAfter: 0.6, // GREYBOX: first volley this long after the siege starts
  standoff: 9, // GREYBOX: plain throwers ring an enemy carrier at bracket range (8m+)
  near: 8, // closer throwers take one direct shot; 8m+ bracket the path
  spacing: 1.2, // the bracket's second ring sits this far to the side of the lead
  exit: 1.8, // GREYBOX: cappers land this far out on an exit (where a carrier who walked out of the plain rings ends up)
  exitSpread: 0.9, // GREYBOX: two cappers split the exit this many radians either way
  maxRings: 4, // never more than 4 live siege rings
  // rule 10, per street: cadence, plain rings, cappers (street 3 swaps Copycat for a second Pockets)
  streets: [
    { cadence: 2.0, plains: 2, cappers: 1 },
    { cadence: 1.5, plains: 2, cappers: 1 },
    { cadence: 1.45, plains: 1, cappers: 2 },
  ],
};
export const CARRIER_READ = 0.4; // GREYBOX: a carrier under siege reads a ring this long after release (a human watching the screen)
export const CARRIER_WANDER = [0.7, 1.3]; // GREYBOX: bot carriers pick a new spot on the crown this often (s)
