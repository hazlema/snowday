// Headless Frosty bouts with a stand-in player (hides on time, throws from the open, reads rings).
// Prints the doc's red lines: hit points spent, hits landed, safe-zone timing, throw gaps.
//
//   bun tools/bossrun.ts [--bouts 200] [--seed 1] [--read 0.45]
import { FROSTY, boutBot, createBout, stepBout } from "../src/sim/boss";
import { DT } from "../src/sim/const";
import { HILL_A } from "../src/sim/hill";
import { Recorder } from "../src/sim/log";

const arg = (n: string, d: string) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const BOUTS = +arg("bouts", "200"), SEED = +arg("seed", "1"), READ = +arg("read", "0.45");

const log = new Recorder();
const outcomes: Record<string, number> = {};
const spent: number[] = [], landed: number[] = [];
for (let i = 0; i < BOUTS; i++) {
  log.match = i;
  const b = createBout(HILL_A, SEED * 10007 + i, log);
  while (!b.over) stepBout(b, boutBot(b, READ));
  outcomes[b.over] = (outcomes[b.over] ?? 0) + 1;
  spent.push(FROSTY.lives - b.lives);
  landed.push(b.hits);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const safe = log.rows.filter((r) => r.event === "bout_safe");
const gaps = log.rows.filter((r) => r.event === "bout_gap").map((r) => +r.secs!);
const taken = log.rows.filter((r) => r.event === "bout_taken");
console.log(`\nFrosty — ${BOUTS} bouts, stand-in read ${READ}s`);
console.log(`outcomes: ${Object.entries(outcomes).map(([k, n]) => `${k} ${((n / BOUTS) * 100).toFixed(0)}%`).join(", ")}`);
console.log(`hit points spent: median ${med(spent)} (0: ${spent.filter((x) => x === 0).length}, 1: ${spent.filter((x) => x === 1).length}, 2: ${spent.filter((x) => x === 2).length}, 3: ${spent.filter((x) => x === 3).length})   red line: median 1-2`);
console.log(`hits landed: median ${med(landed)}`);
console.log(`hits taken: normal ${taken.filter((r) => r.note === "normal").length}, special ${taken.filter((r) => r.note !== "normal").length}`);
const secs = safe.filter((r) => r.secs !== undefined).map((r) => +r.secs!);
console.log(`swirl start -> safe: median ${med(secs).toFixed(2)}s, max ${Math.max(...secs).toFixed(2)}s, never ${safe.length - secs.length}`);
console.log(`throw gap across a special: median ${med(gaps).toFixed(1)}s`);
const ends = log.rows.filter((r) => r.event === "bout_end").map((r) => +r.t!);
console.log(`bout length: median ${med(ends).toFixed(1)}s; specials seen per bout ${(log.rows.filter((r) => r.event === "bout_special").length / BOUTS).toFixed(1)}`);
