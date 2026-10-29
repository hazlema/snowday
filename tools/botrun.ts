// Greybox bot run: 8 bots on hill A (human slot = stand-in with Beanie logic, plain snowballs),
// Pockets' blower, no cards, fixed seed, reaction 0.50s. Writes one CSV and prints the
// pass/fail gates from the design doc ("Greybox bot round — logs and pass/fail").
//
//   bun tools/botrun.ts [--matches 20] [--seed 1] [--street 1] [--reaction (street's)] [--round 120] [--out out/botrun.csv]
//   bun tools/botrun.ts --days 10    whole snow days (streets 1 -> 2 -> 3, one match each, gear and
//                                    credits carry over exactly as in play); prints per-street reads
//                                    and the persistence gates (QA #32, #36)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DT, ROUND_LEN, SIEGE } from "../src/sim/const";
import { HILL_A } from "../src/sim/hill";
import { Recorder, type Row } from "../src/sim/log";
import { botShop, type ItemId } from "../src/sim/shop";
import type { Kit, Role } from "../src/sim/types";
import { createRound, step } from "../src/sim/world";
import { defaultKit } from "../src/sim/shop";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = +arg("days", "0");
const MATCHES = DAYS ? DAYS * 3 : +arg("matches", "20");
const SEED = +arg("seed", "1");
const STREET = Math.min(3, Math.max(1, +arg("street", "1")));
const ROUND = +arg("round", String(ROUND_LEN));
const OUT = arg("out", DAYS ? `out/snowday-seed${SEED}.csv` : `out/botrun-seed${SEED}.csv`);
const REACTIONS = [0.6, 0.5, 0.45];
const reactionOf = (st: number) => (process.argv.includes("--reaction") ? +arg("reaction", "0.5") : REACTIONS[st - 1]);
const rivalOf = (st: number): Role[] => (st === 3 ? ["beanie", "pockets", "pockets", "brick"] : ["beanie", "pockets", "brick", "copycat"]);
const REACTION = reactionOf(STREET);
const RIVAL = rivalOf(STREET);
const SIEGE_CFG = SIEGE.streets[STREET - 1];

const log = new Recorder();
log.header = DAYS
  ? [
      `Snow Day greybox bot run — hill A, ${DAYS} whole snow days (streets 1 -> 2 -> 3), seed ${SEED}`,
      `gear and credits carry across the day for every kid; each day starts plain (rule 4)`,
      `Chestnut = stand-in(Beanie) + Pip(Beanie) + Scoop(Pockets) + Waffle(Brick)`,
    ]
  : [
      `Snow Day greybox bot run — hill A, street ${STREET}, seed ${SEED}, ${MATCHES} matches (fresh gear each match)`,
      `siege: volley every ${SIEGE_CFG.cadence}s, ${SIEGE_CFG.plains} plain + ${SIEGE_CFG.cappers} capper`,
      `reaction ${REACTION}s, rival mix ${RIVAL.join("+")}, Chestnut = stand-in(Beanie) + Pip(Beanie) + Scoop(Pockets) + Waffle(Brick)`,
      `garage between rounds: every kid shops with their own credits (Copycat copies the stand-in's last buy)`,
    ];

let rounds = 0;
const shopped: { street: number; kid: number; id: ItemId }[] = [];
const matchWins: { street: number; won: boolean }[] = [];
let kits: Kit[] = [];
let credits: number[] = [];
let standInLast: ItemId | null = null;
for (let m = 0; m < MATCHES; m++) {
  const st = DAYS ? (m % 3) + 1 : STREET;
  // a snow day starts plain; in --street mode every match does
  if (!DAYS || st === 1) (kits = Array.from({ length: 8 }, defaultKit)), (credits = Array(8).fill(0)), (standInLast = null);
  log.day = DAYS ? Math.floor(m / 3) : m;
  log.street = st;
  log.match = m;
  const wins = [0, 0];
  for (let r = 0; wins[0] < 2 && wins[1] < 2; r++) {
    const w = createRound(
      { seed: SEED * 1000 + m, round: r, hill: HILL_A, reaction: reactionOf(st), rival: rivalOf(st), humanBot: true, kits, credits, roundLen: ROUND, siege: SIEGE.streets[st - 1] },
      log,
    );
    let guard = 0;
    while (w.phase !== "over" && guard++ < (ROUND + 120) / DT) step(w, null);
    wins[w.winner as 0 | 1]++;
    rounds++;
    credits = w.kids.map((k) => k.credits);
    // the garage is between rounds only: no visit after the match's last round (the credits carry)
    if (wins[0] >= 2 || wins[1] >= 2) break;
    // stand-in first so Copycat can copy its last buy
    for (const k of w.kids) {
      const held = credits[k.id];
      const res = botShop(k.role, kits[k.id], credits[k.id], k.role === "copycat" ? standInLast : null);
      kits[k.id] = res.kit;
      credits[k.id] = res.credits;
      if (k.isHuman && res.bought.length) standInLast = res.bought[0];
      for (const id of res.bought) log.add("shop", w.t, { kid: k.id, team: k.team, note: id }), shopped.push({ street: st, kid: k.id, id });
      log.add("garage", w.t, { kid: k.id, team: k.team, credits: held, note: res.bought[0] ?? "none" });
    }
  }
  matchWins.push({ street: st, won: wins[0] >= 2 });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, log.toCSV());

// ------------------------------------------------------------- verdicts
const rows = log.rows;
const by = (e: string) => rows.filter((r) => r.event === e);
const note = (r: Row, key: string) => {
  const m = String(r.note ?? "").match(new RegExp(`${key}=([^ ]+)`));
  return m ? m[1] : "";
};
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const share = <T>(xs: T[], f: (x: T) => boolean) => (xs.length ? xs.filter(f).length / xs.length : NaN);

if (!DAYS) {
const rr = by("round");
const throws = by("throw");
const plain = throws.filter((t) => t.card === "plain");
const misses = throws.filter((t) => t.outcome === "empty" || t.outcome === "stepped out");
const chills = by("chill");

const crownShare = rr.map((r) => +note(r, "crown_share"));
const poss = rr.map((r) => +note(r, "poss_changes"));
const hold = rr.map((r) => +note(r, "longest_hold"));
const free = rr.map((r) => +note(r, "longest_free"));
const sd = rr.filter((r) => note(r, "sudden_death") !== "no").length;
const carryShare = rr.map((r) => note(r, "human_carry_share")).filter((x) => x !== "na").map(Number);
const out = rr.map((r) => +note(r, "human_out") / ROUND);

const isHit = (t: Row) => t.outcome === "hit";
const freeFacing = plain.filter((t) => t.target_busy === false && t.target_front === true && +t.target_dist! >= 6 && +t.target_dist! <= 10);
const blind = throws.filter((t) => t.target !== -1 && (t.target_busy === true || t.target_front === false));

const chillsPerTeamRound: number[] = [];
const chillsPerKid: number[] = [];
for (const r of rr) {
  const cs = chills.filter((c) => c.match === r.match && c.round === r.round);
  for (const team of [0, 1]) chillsPerTeamRound.push(cs.filter((c) => c.team === team).length);
  for (let k = 0; k < 8; k++) chillsPerKid.push(cs.filter((c) => c.kid === k).length);
}
const repeat = chills.filter((c) => String(c.note ?? "").includes("repeat_within_5s")).length;
const holds = by("hold").map((h) => +h.secs!);
const sortedHolds = [...holds].sort((a, b) => a - b);
const medHold = sortedHolds.length ? sortedHolds[Math.floor(sortedHolds.length / 2)] : NaN;
const b2b = rr.map((r) => +note(r, "back_to_back"));
const volleyRings = throws.filter((t) => t.volley !== "" && t.volley !== undefined);
const volleyChills = chills.filter((c) => c.volley !== "" && c.volley !== undefined && String(c.note).includes("carrier"));

type Verdict = "PASS" | "FAIL" | "WATCH";
const lines: [string, string, Verdict, string][] = [];
const gate = (name: string, val: string, ok: boolean, rule: string, watch = false) => lines.push([name, val, ok ? "PASS" : watch ? "WATCH" : "FAIL", rule]);

gate("Sled on crown share", `${pct(mean(crownShare))} (min ${pct(Math.min(...crownShare))}, max ${pct(Math.max(...crownShare))})`, mean(crownShare) >= 0.25 && mean(crownShare) <= 0.6, `25-60% of ${ROUND}s`);
gate("Possession changes / round", `${mean(poss).toFixed(1)} (min ${Math.min(...poss)})`, mean(poss) >= 6, ">= 6 team switches");
gate("Longest hold", `${Math.max(...hold).toFixed(1)}s (mean ${mean(hold).toFixed(1)}s)`, Math.max(...hold) <= 25, "<= 25s else camping");
gate("Longest free sled", `${Math.max(...free).toFixed(1)}s`, Math.max(...free) <= 15, "> 15s = revisit idle-slide", true);
gate("Free facing kid 6-10m hit", `${pct(share(freeFacing, isHit))} (n=${freeFacing.length})`, share(freeFacing, isHit) >= 0.6, ">= 60%; <50% = flight time wrong");
gate("Busy / outside front arc hit", `${pct(share(blind, isHit))} (n=${blind.length})`, share(blind, isHit) >= 0.85, "~100%", true);
gate("Match hit rate (all throws)", `${pct(share(throws, isHit))} (n=${throws.length})`, share(throws, isHit) >= 0.3 && share(throws, isHit) <= 0.45, "30-45%; >60% bots blind, <25% no flank");
gate("Chills per team per round", `${mean(chillsPerTeamRound).toFixed(1)} (range ${Math.min(...chillsPerTeamRound)}-${Math.max(...chillsPerTeamRound)})`, mean(chillsPerTeamRound) >= 6 && mean(chillsPerTeamRound) <= 12, "6-12");
gate("Max chills per kid per round", `${Math.max(...chillsPerKid)} (kid-rounds over 3: ${chillsPerKid.filter((x) => x > 3).length}/${chillsPerKid.length})`, Math.max(...chillsPerKid) <= 3, "<= 3 (4th = geometry/spawn)", true);
gate("Misses within 1.2m", `${pct(share(misses.filter((m) => m.closest !== ""), (m) => +m.closest! <= 1.2))} (n=${misses.length})`, share(misses.filter((m) => m.closest !== ""), (m) => +m.closest! <= 1.2) >= 0.8, ">= 80%");
gate("Wall-block share (plain)", pct(share(plain, (t) => t.outcome === "wall")), share(plain, (t) => t.outcome === "wall") < 0.25, "<25% ship, 25-35% watch", share(plain, (t) => t.outcome === "wall") < 0.35);
gate("Rounds reaching sudden death", `${sd}/${rr.length}`, sd / rr.length <= 1 / 6, "<= 1 in 6");
gate("Stand-in carry share (QA #21)", `${pct(mean(carryShare))}`, mean(carryShare) >= 1 / 3, ">= 1/3 (calibration, not a gate)", true);
gate("Stand-in bench time", `${pct(mean(out))} (max ${pct(Math.max(...out))})`, mean(out) < 0.15, "< 15%; > 25% = bench/walk too long", mean(out) <= 0.25);
gate("Median crown hold (siege)", `${medHold.toFixed(1)}s (n=${holds.length}, longest ${Math.max(...holds).toFixed(1)}s)`, medHold >= 8 && medHold <= 20 && holds.length >= 12, "8-20s, >= 12 holds; never 8s = slower volleys, > 20s = add a capper");
gate("Back-to-back volley chills / round", `max ${Math.max(...b2b)} (mean ${mean(b2b).toFixed(1)})`, Math.max(...b2b) <= 2, "<= 2 per round");
gate("Crown chills from < 8m", `${pct(share(volleyChills, (c) => +c.dist! < 8))} (n=${volleyChills.length}, rings ${volleyRings.length})`, share(volleyChills, (c) => +c.dist! < 8) < 0.5, "most from <8m = the near-range rule isn't working");
gate("Repeat chills < 5s after stand (QA #17)", `${repeat}`, repeat <= rr.length * 0.5, "more than a couple = stand exposed", true);

const w0 = Math.max(...lines.map((l) => l[0].length));
const w1 = Math.max(...lines.map((l) => l[1].length));
console.log(`\nSnow Day greybox — street ${STREET}, ${MATCHES} matches, ${rounds} rounds, seed ${SEED}, reaction ${REACTION}s, volley ${SIEGE_CFG.cadence}s`);
console.log(`CSV: ${OUT} (${rows.length} rows)\n`);
for (const [n, val, verdict, rule] of lines) console.log(`${verdict.padEnd(5)}  ${n.padEnd(w0)}  ${val.padEnd(w1)}  ${rule}`);
const outcomes = ["hit", "wall", "empty", "stepped out"].map((o) => `${o} ${pct(share(throws, (t) => t.outcome === o))}`).join(", ");
const buys: Record<string, number> = {};
for (const b of shopped) buys[b.id] = (buys[b.id] ?? 0) + 1;
const kinds: Record<string, number> = {};
for (const t of throws) kinds[String(t.card)] = (kinds[String(t.card)] ?? 0) + 1;
console.log(`\ngarage buys: ${Object.entries(buys).map(([k, n]) => `${k} ${n}`).join(", ")}; thaws ${by("thaw").length}`);
console.log(`throws by kind: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`\nthrow outcomes: ${outcomes}; plain ${plain.length}, blower ${throws.length - plain.length}`);
}

// ------------------------------------------------------------- whole snow days: per-street reads
if (DAYS) {
  const rr = by("round");
  type St = { st: number; rounds: Row[]; standInChills: number[]; kidChills: number[]; bench: number[]; split: number[]; holds: number[]; won: number; matches: number };
  const per: St[] = [1, 2, 3].map((st) => {
    const rounds = rr.filter((r) => r.street === st);
    const cs = by("chill").filter((c) => c.street === st);
    const standInChills: number[] = [], kidChills: number[] = [];
    for (const r of rounds) {
      const here = cs.filter((c) => c.match === r.match && c.round === r.round);
      standInChills.push(here.filter((c) => c.kid === 0).length);
      for (let k = 0; k < 8; k++) kidChills.push(here.filter((c) => c.kid === k).length);
    }
    const item = (c: Row) => (c.card === "launcher" ? 0 : c.card === "plain" ? 1 : 2);
    const split = [0, 0, 0];
    for (const c of cs) split[item(c)]++;
    const ms = matchWins.filter((x) => x.street === st);
    return {
      st, rounds, standInChills, kidChills, split,
      bench: rounds.map((r) => +note(r, "human_out") / ROUND),
      holds: by("hold").filter((h) => h.street === st).map((h) => +h.secs!),
      won: ms.filter((x) => x.won).length, matches: ms.length,
    };
  });
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
  console.log(`\nSnow Day greybox — ${DAYS} whole snow days (streets 1 -> 2 -> 3), ${rounds} rounds, seed ${SEED}; gear carries across each day`);
  console.log(`CSV: ${OUT} (${rows.length} rows)\n`);
  console.log(`street  Chestnut wins  stand-in chills/round (max)  kid-rounds over 2  stand-in bench  median hold  chills: launcher / plain / other`);
  for (const p of per) {
    console.log(
      `${String(p.st).padEnd(6)}  ${`${p.won}/${p.matches}`.padEnd(13)}  ${`${mean(p.standInChills).toFixed(2)} (${Math.max(...p.standInChills)})`.padEnd(27)}  ${pct(share(p.kidChills, (x) => x > 2)).padEnd(17)}  ${pct(mean(p.bench)).padEnd(14)}  ${`${med(p.holds).toFixed(1)}s`.padEnd(11)}  ${p.split[0]} / ${p.split[1]} / ${p.split[2]}`,
    );
  }
  // what everyone carries into each street (kits at the first round of that street)
  for (const st of [2, 3]) {
    const first = rr.filter((r) => r.street === st && r.round === 0).map((r) => note(r, "kits").split("/"));
    const tally: Record<string, number> = {};
    for (const ks of first) for (const kt of ks) tally[kt] = (tally[kt] ?? 0) + 1;
    console.log(`kits walking into street ${st}: ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}  (p/i/r ball, L launcher, M melter, S snowman)`);
  }

  // QA #32: the same player against their own street 1
  const s1 = per[0], s3 = per[2];
  const breaks = (p: St) => mean(p.standInChills) > 2 || mean(p.bench) > 0.15;
  const trip = breaks(s3) && !breaks(s1);
  console.log(
    `\n${trip ? "TRIP " : "OK   "}  Persistence gate (QA #32)  street 1 ${mean(s1.standInChills).toFixed(2)} chills, ${pct(mean(s1.bench))} bench -> street 3 ${mean(s3.standInChills).toFixed(2)}, ${pct(mean(s3.bench))}  trips if street 3 breaks <=2 chills or 15% bench while street 1 clears it; ON TRIP: two-slot loadout`,
  );
  // QA #36: share of street-1 paid purchases by item (the stand-in follows Beanie's wishlist, so only the host's own buys mean much)
  const s1buys = shopped.filter((b) => b.street === 1);
  const byItem = (xs: typeof shopped) => {
    const t: Record<string, number> = {};
    for (const b of xs) t[b.id] = (t[b.id] ?? 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n / xs.length)}`).join(", ");
  };
  const launch = share(s1buys, (b) => b.id === "launcher");
  console.log(`${launch > 0.6 ? "TRIP " : "WATCH"}  Launcher share of street-1 buys (QA #36)  ${pct(launch)} of ${s1buys.length} (${byItem(s1buys)})  > 60% = one item decides the day; bots buy from fixed wishlists, so the host's own buys are the real read`);
  console.log(`all buys by street: ${[1, 2, 3].map((st) => `${st}: ${byItem(shopped.filter((b) => b.street === st)) || "none"}`).join(" | ")}`);
}
