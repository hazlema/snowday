import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import { DT, SIEGE } from "../sim/const";
import { HILL_A, HILLS, type Hill } from "../sim/hill";
import { Recorder } from "../sim/log";
import { add, fromAngle, mul, norm, sub, type V } from "../sim/math";
import { inPlay } from "../sim/query";
import { botShop, buy, canBuy, defaultKit, item, ITEMS, owns, worthBuying, type ItemId } from "../sim/shop";
import type { GameEvent, HumanInput, Kit, Role, SiegeCfg, Team, World } from "../sim/types";
import { createRound, step } from "../sim/world";
import { boutBot, createBout, FROSTY, stepBout, type Bout, type BoutEvent } from "../sim/boss";
import { boutFx, drawBout } from "./boutRender";
import { Sfx } from "./audio";
import { H, isoV, pickGround, W } from "./iso";
import { Input, moveToWorld } from "./input";
import { CHESTNUT_PAL, draw, drawBlockout, fx, RIVAL_PALS, scoreSpark, tickFx } from "./render";
import { prebake } from "./terrain";

// ------------------------------------------------------------------ session ladder (rule 10)

const STD: Role[] = ["beanie", "pockets", "brick", "copycat"];
const STREETS: { reaction: number; mix: Role[]; siege: SiegeCfg }[] = [
  { reaction: 0.6, mix: STD, siege: SIEGE.streets[0] },
  { reaction: 0.5, mix: STD, siege: SIEGE.streets[1] },
  { reaction: 0.45, mix: ["beanie", "pockets", "pockets", "brick"], siege: SIEGE.streets[2] },
];

const params = new URLSearchParams(location.search);
const botsOnly = params.has("bots"); // watch 8 bots (human slot = stand-in)
const speed = Math.max(0.1, +(params.get("speed") ?? 1));
const reactionOverride = params.get("reaction");
let seed = +(params.get("seed") ?? Math.floor(Math.random() * 1e6));

const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d")!;
const input = new Input(canvas);
const sfx = new Sfx();
const log = new Recorder();
log.header = [`Snow Day greybox — human session`, `seed ${seed}${botsOnly ? " (bots only)" : ""}`, new Date().toISOString()];

type Mode = "porch" | "play" | "roundEnd" | "blockout" | "bout";
let mode: Mode = "porch";
let street = Math.min(2, Math.max(0, +(params.get("street") ?? 1) - 1));
let matchNo = 0;
let round = 0;
let roundsWon: [number, number] = [0, 0];
let roundWinners: Team[] = [];
let world: World | null = null;
let roundEndT = 0;
let light = { from: 0, to: 0, k: 1, lamps: 0, lampsT: -1 };
let debug = false;
let paused = false;
let aim: V | null = null;
let stepDist = 0;
let sessionT = 0;
let blockHill: Hill = HILLS.B;
let blockDusk = 0;
// Frosty's bout: a bonus after a match; his pot hats stay on the porch for the rest of the snow day
let bout: Bout | null = null;
let boutThen: (() => void) | null = null;
let boutNo = 0;
let hats = 0;
let lastBoutWon = false;
let boutCard = ""; // 'Snowballs only': shown as the bout opens, before your first throw
// the garage: gear and unspent credits last the whole snow day (all 3 streets), bots too.
// Only 'New snow day' wipes them (rule 4).
let day = 0;
let kits: Kit[] = Array.from({ length: 8 }, defaultKit);
let credits: number[] = Array(8).fill(0);
let humanLast: ItemId | null = null; // Copycat copies your last buy of the day
const KID_NAMES = ["You", "Pip", "Scoop", "Waffle"];
// testing: ?kit=launcher,rock,melter,snowman starts you with gear; ?credits=30 with money
function startKit(): Kit {
  let k = defaultKit();
  for (const id of (params.get("kit") ?? "").split(",").filter(Boolean)) if (ITEMS.some((i) => i.id === id)) k = buy(k, id as ItemId);
  return k;
}
kits[0] = startKit();
credits[0] = +(params.get("credits") ?? 0);

const rivalPal = () => RIVAL_PALS[street];

// ------------------------------------------------------------------ porch screen: the only text in the game

const porch = document.getElementById("porch")!;
const l1 = document.getElementById("l1")!;
const l2 = document.getElementById("l2")!;
const btns = document.getElementById("btns")!;

// beside 'New snow day', before the click, always visible; never on 'Next street' (Art)
const RESET_NOTE = "Fresh snow, fresh start — your gear and credits reset.";

const POT_SVG = `<svg viewBox="0 0 34 26"><path d="M5 22 L8 6 L26 6 L29 22 Z" fill="#6f655c"/><ellipse cx="17" cy="6" rx="9" ry="2.6" fill="#8a7f74"/><ellipse cx="17" cy="22" rx="14" ry="3" fill="#5a524b"/><path d="M28 10 L33 11" stroke="#4b443e" stroke-width="2.5" stroke-linecap="round"/><rect x="11" y="10" width="4" height="3" fill="#965028" opacity="0.6"/></svg>`;

function showPorch(context: string, line1: string, line2: string, buttons: { label: string; note?: string; go: () => void }[]) {
  l1.textContent = line1;
  l2.textContent = line2;
  // Frosty's pot hats beside your street's name, for the rest of the snow day
  hatsEl.classList.toggle("hidden", hats === 0);
  hatsEl.innerHTML = hats ? `Chestnut Street ${POT_SVG.repeat(hats)}${lastBoutWon ? " · You melted Frosty" : ""}` : "";
  btns.innerHTML = "";
  const shownAt = performance.now();
  const hover = new Map<string, number>();
  const enter = new Map<string, number>();
  for (const b of buttons) {
    const el = document.createElement("button");
    el.textContent = b.label;
    hover.set(b.label, 0);
    const start = () => enter.set(b.label, performance.now());
    const stop = () => {
      const s = enter.get(b.label);
      if (s !== undefined) hover.set(b.label, hover.get(b.label)! + (performance.now() - s) / 1000), enter.delete(b.label);
    };
    el.addEventListener("mouseenter", start);
    el.addEventListener("focus", start);
    el.addEventListener("mouseleave", stop);
    el.addEventListener("blur", stop);
    el.addEventListener("click", () => {
      stop();
      // QA #24: which button, and how long they hovered each before pressing
      const others = buttons.filter((o) => o.label !== b.label).map((o) => `${o.label}=${hover.get(o.label)!.toFixed(1)}s`).join(" ");
      log.add("porch", sessionT, {
        note: `${context}: pressed '${b.label}' after ${((performance.now() - shownAt) / 1000).toFixed(1)}s on screen${others ? `; other hover ${others}` : ""}`,
        hover: +hover.get(b.label)!.toFixed(2),
      });
      sfx.unlock();
      porch.classList.add("hidden");
      garage.classList.add("hidden");
      garageShop?.();
      garageShop = null;
      b.go();
    });
    // the notice sits under its own button; every button stays identical (QA #24)
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.appendChild(el);
    if (buttons.some((o) => o.note)) {
      const n = document.createElement("div");
      n.className = "note";
      n.textContent = b.note ?? "";
      slot.appendChild(n);
    }
    btns.appendChild(slot);
  }
  porch.classList.remove("hidden");
  mode = "porch";
}

// ------------------------------------------------------------------ garage

const garage = document.getElementById("garage")!;
const hatsEl = document.getElementById("hats")!;

function kitNames(kit: Kit): string[] {
  return ITEMS.filter((i) => owns(kit, i.id)).map((i) => i.name);
}

/** Between rounds: spend credits on upgrades. Bots shop when you continue (Copycat copies you). */
function showGarage() {
  const boughtNow: ItemId[] = [];
  const shownAt = performance.now();
  const held = [...credits];
  // nothing affordable on the shelf: lead with 'Your gear is ready', one Continue click to the next hill
  const ready = worthBuying(kits[0], credits[0]).length === 0;
  const render = () => {
    const c = credits[0];
    const rivals = world!.kids
      .filter((k) => k.team === 1 && kitNames(kits[k.id]).length)
      .map((k) => `${k.name}: ${kitNames(kits[k.id]).join(", ")}`);
    const allies = world!.kids
      .filter((k) => k.team === 0 && !k.isHuman && kitNames(kits[k.id]).length)
      .map((k) => `${KID_NAMES[k.id]}: ${kitNames(kits[k.id]).join(", ")}`);
    garage.innerHTML = `
      ${ready ? `<div class="ready">Your gear is ready</div>` : ""}
      <div class="wallet">The garage · you have <b>❄ ${c}</b> · ${boughtNow.length ? "that's your one buy this visit" : ready ? "nothing new you can afford yet" : "one buy per visit"}</div>
      <div class="shop">${ITEMS.map((i) => {
        const own = owns(kits[0], i.id);
        const swap = (i.id === "ice" || i.id === "rock") && kits[0].ball !== "plain" && !own;
        return `<div class="item ${own ? "owned" : ""}">
          <div class="name">${i.name}</div>
          <div class="blurb">${i.blurb}${swap ? ` <i>(replaces your ${kits[0].ball} snowballs)</i>` : ""}</div>
          ${own ? `<div class="own">Owned — lasts this snow day</div>` : `<button data-id="${i.id}" ${boughtNow.length || !canBuy(kits[0], c, i.id) ? "disabled" : ""}>❄ ${i.price}</button>`}
        </div>`;
      }).join("")}</div>
      ${allies.length ? `<div class="who">Your street has — ${allies.join(" · ")}</div>` : ""}
      ${rivals.length ? `<div class="who">${rivalPal().name} has — ${rivals.join(" · ")}</div>` : ""}`;
    garage.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.id as ItemId;
        if (boughtNow.length || !canBuy(kits[0], credits[0], id)) return;
        kits[0] = buy(kits[0], id);
        credits[0] -= item(id).price;
        boughtNow.push(id);
        humanLast = id;
        log.add("shop", sessionT, { kid: 0, team: 0, note: id });
        sfx.unlock();
        sfx.coin();
        render();
      }),
    );
  };
  garageShop = () => {
    // one row per kid per visit: credits held, item or none (and your seconds on screen)
    log.add("garage", sessionT, { kid: 0, team: 0, credits: held[0], note: boughtNow[0] ?? "none", secs: +((performance.now() - shownAt) / 1000).toFixed(1) });
    // everyone else shops after you; Copycat copies your last buy of the day
    for (let i = 1; i < 8; i++) {
      const k = world!.kids[i];
      const res = botShop(k.role, kits[i], credits[i], k.role === "copycat" ? humanLast : null);
      kits[i] = res.kit;
      credits[i] = res.credits;
      for (const id of res.bought) log.add("shop", sessionT, { kid: i, team: k.team, note: id });
      log.add("garage", sessionT, { kid: i, team: k.team, credits: held[i], note: res.bought[0] ?? "none" });
    }
  };
  render();
  garage.classList.remove("hidden");
}

let garageShop: (() => void) | null = null;

// ------------------------------------------------------------------ title: a demo match plays behind the logo

const titleEl = document.getElementById("title")!;
let attract: World | null = null;
let attractN = 0;

function newAttract() {
  // all bots, its own throwaway log, a little gear so the demo shows off the garage
  const demoKits = Array.from({ length: 8 }, (_, i) => {
    let k = defaultKit();
    const wish: ItemId[][] = [["launcher"], ["ice"], ["snowman"], ["melter"], ["rock"], ["launcher"], ["melter"], ["ice"]];
    for (const id of wish[(i + attractN) % 8]) k = buy(k, id);
    return k;
  });
  attract = createRound(
    { seed: 900 + attractN * 17, round: 1, hill: HILL_A, reaction: 0.5, rival: STD, humanBot: true, kits: demoKits, credits: Array(8).fill(0), siege: SIEGE.streets[0] },
    new Recorder(),
  );
  attractN++;
}

function title() {
  mode = "porch";
  world = null;
  newAttract();
  document.getElementById("titleTag")!.innerHTML =
    `<b>${rivalPal().name}</b> is on your hill. Get the toboggan to the top<br>and hold it there till the streetlights come on.`;
  titleEl.classList.remove("hidden");
  const shownAt = performance.now();
  const go = document.getElementById("goOutside") as HTMLButtonElement;
  go.onclick = () => {
    log.add("porch", sessionT, { note: `title: pressed 'Go outside' after ${((performance.now() - shownAt) / 1000).toFixed(1)}s on screen` });
    titleEl.classList.add("hidden");
    attract = null;
    startRound();
  };
  go.focus({ preventScroll: true });
}

function grudge(winner: Team): string {
  const prev = roundWinners.length > 1 ? roundWinners[roundWinners.length - 2] : -1;
  const rival = rivalPal().name;
  if (winner === 1) return prev === 0 ? `${rival} took it back` : `${rival} took your hill`;
  return prev === 1 ? "Chestnut took it back" : "Chestnut held the hill";
}

function afterRound(winner: Team) {
  roundsWon[winner]++;
  roundWinners.push(winner);
  const score = `Chestnut ${roundsWon[0]} – ${roundsWon[1]} ${rivalPal().name}`;
  if (roundsWon[0] < 2 && roundsWon[1] < 2) {
    showPorch(`after round ${round + 1}`, grudge(winner), score, [
      {
        label: "Continue",
        go: () => {
          round++;
          startRound();
        },
      },
    ]);
    showGarage();
    return;
  }
  const rival = rivalPal().name;
  const line1 = roundsWon[0] === 2 ? `Chestnut Street beat ${rival}` : `${rival} beat Chestnut Street`;
  const last = street === STREETS.length - 1;
  // equal weight, win or lose: a tour, not a gate. Next is never styled nicer than Finish.
  showPorch(`match end (street ${street + 1}, ${roundsWon[0] === 2 ? "won" : "lost"})`, line1, score, [
    {
      label: last ? "New snow day" : "Next street",
      note: last ? RESET_NOTE : undefined,
      // 'Next street' / 'New snow day' plays Frosty's bout, then the next whistle; 'Finish' skips it.
      // On 'New snow day' the bout plays BEFORE the wipe, so the old day's porch card gets its result.
      go: () =>
        startBout(last ? "Snowballs only" : "Snowballs only — your gear waits in the garage", () => {
          if (!last) {
            street++;
            newMatch();
            return;
          }
          // after street 3 the hat shows on the porch before the new snow day starts clean
          showPorch("snow day done", lastBoutWon ? "You melted Frosty" : "Frosty's still standing", "A new snow day starts clean.", [
            { label: "Go outside", go: newDay },
          ]);
        }),
    },
    { label: "Finish snow day", go: finished },
  ]);
}

function finished() {
  showPorch("finished", "Snow day's over.", "Everyone's inside with cocoa.", [{ label: "New snow day", note: RESET_NOTE, go: newDay }]);
}

/** 'New snow day': everyone back to plain snowballs and no credits; hats and streets start over. */
function newDay() {
  day++;
  kits = Array.from({ length: 8 }, defaultKit);
  credits = Array(8).fill(0);
  kits[0] = startKit();
  credits[0] = +(params.get("credits") ?? 0);
  humanLast = null;
  hats = 0;
  lastBoutWon = false;
  street = 0;
  newMatch();
}

/** The next street's match. Gear and credits carry over: only newDay() wipes them. */
function newMatch() {
  matchNo++;
  round = 0;
  roundsWon = [0, 0];
  roundWinners = [];
  startRound();
}

// ------------------------------------------------------------------ Frosty's bout

function startBout(card: string, then: () => void) {
  sfx.unlock();
  boutNo++;
  boutCard = card;
  log.day = day;
  log.street = street + 1;
  log.match = matchNo;
  bout = createBout(HILL_A, seed + boutNo * 97, log);
  boutThen = then;
  world = null;
  mode = "bout";
  sfx.frostyWake();
}

function handleBoutEvents(b: Bout, events: BoutEvent[]) {
  for (const e of events) {
    boutFx(e, b);
    switch (e.type) {
      case "throw":
        if (e.kind === "blower") sfx.blower(panOf(e.p));
        else sfx.release(panOf(e.p));
        break;
      case "frostyHit":
        sfx.frostyHit(panOf(e.p));
        break;
      case "kidHit":
        sfx.impact(panOf(e.p));
        break;
      case "splat":
        sfx.splat(panOf(e.p));
        break;
      case "miss":
        sfx.missPlop(panOf(e.p));
        break;
      case "sweep":
        sfx.sweep();
        break;
      case "swirl":
        sfx.swirl(e.step);
        break;
      case "burst":
        sfx.burst();
        break;
      case "dizzy":
        sfx.dizzy();
        break;
      case "tick":
        sfx.tick(e.left);
        break;
      case "over":
        if (e.outcome === "melted") {
          hats++;
          lastBoutWon = true;
          sfx.boutWin();
        } else {
          lastBoutWon = false;
          sfx.boutLose();
        }
        break;
    }
  }
}

function boutInput(b: Bout): HumanInput {
  const f = input.poll();
  const k = b.kid;
  if (f.aimScreen) aim = pickGround(b.hill, f.aimScreen.x, f.aimScreen.y);
  else if (f.aimStick) aim = add(k.pos, f.aimStick);
  else aim = add(k.pos, fromAngle(k.facing, 6));
  let move = moveToWorld(f.moveScreen);
  if (f.moveToAim && !move.x && !move.y) {
    const to = sub(aim, k.pos);
    const d = Math.hypot(to.x, to.y);
    if (d > 0.15) move = mul(norm(to), Math.min(1, d / 0.6));
  }
  if (f.throwEdge || f.moveToAim) sfx.unlock(); // ?boss=1 starts without a click on the porch
  // your build button does nothing in the bout: the moving mounds are the only cover
  return { move, aim, throwPressed: f.throwEdge, throwHeld: f.throwHeld, wallPressed: false };
}

// ------------------------------------------------------------------ rounds

function startRound() {
  sfx.unlock();
  const s = STREETS[street];
  log.day = day;
  log.street = street + 1;
  log.match = matchNo;
  world = createRound(
    {
      seed: seed + matchNo * 31 + round,
      round,
      hill: HILL_A,
      reaction: reactionOverride ? +reactionOverride : s.reaction,
      rival: s.mix,
      humanBot: botsOnly,
      kits,
      credits,
      roundLen: params.get("round") ? +params.get("round")! : undefined,
      siege: s.siege,
    },
    log,
  );
  log.add("round_start", 0, { note: `street ${street + 1} (${rivalPal().name}), round ${round + 1}, reaction ${world.cfg.reaction}s, mix ${s.mix.join("+")}, volley ${s.siege.cadence}s` });
  light = { from: 0, to: 0, k: 1, lamps: 0, lampsT: -1 }; // lighting resets between rounds, never mid-play
  handleEvents(world, world.events);
  world.events.length = 0;
  mode = "play";
}

const panOf = (p: V) => (isoV(p).x - W / 2) / (W / 2);

function handleEvents(w: World, evs: GameEvent[]) {
  for (const e of evs) {
    fx(e, w);
    switch (e.type) {
      case "whistle":
        sfx.whistle();
        break;
      case "throw": {
        const p = panOf(e.p);
        if (e.kind === "blower") sfx.blower(p);
        else if (e.pellet) sfx.pellet(p);
        else sfx.release(p);
        break;
      }
      case "melt":
        sfx.melt(panOf(e.p));
        break;
      case "thaw":
        sfx.thaw(panOf(w.kids[e.kid].pos));
        break;
      case "snowman":
        sfx.plant(panOf(w.kids[e.kid].pos));
        break;
      case "snowmanBreak":
        sfx.wallBreak(panOf(e.p));
        break;
      case "crownSecond":
        sfx.tock(e.team);
        scoreSpark(w, e.team);
        break;
      case "hit":
        sfx.impact(panOf(e.p));
        break;
      case "splat":
        sfx.splat(panOf(e.p));
        break;
      case "miss":
        sfx.missPlop(panOf(e.p));
        break;
      case "grab":
        sfx.grab(panOf(w.kids[e.kid].pos));
        break;
      case "drop":
        sfx.drop(panOf(w.kids[e.kid].pos));
        break;
      case "handoff":
        sfx.handoff(panOf(w.kids[e.to].pos));
        break;
      case "plant":
        sfx.plant(panOf(w.kids[e.kid].pos));
        break;
      case "wallBreak":
        sfx.wallBreak(panOf(e.p));
        break;
      case "duskStep":
        light = { ...light, from: light.to, to: e.step, k: 0 };
        break;
      case "tick":
        sfx.tick(e.left);
        break;
      case "lights":
        sfx.lights();
        light = { ...light, from: light.to, to: 4, k: 0, lampsT: 0 };
        break;
      case "suddenDeath":
        sfx.whistle();
        break;
      case "roundOver":
        credits = w.kids.map((k) => k.credits);
        mode = "roundEnd";
        roundEndT = 0;
        break;
    }
  }
}

function humanInput(w: World): HumanInput {
  const f = input.poll();
  const hu = w.kids[0];
  if (f.aimScreen) aim = pickGround(w.hill, f.aimScreen.x, f.aimScreen.y);
  else if (f.aimStick) aim = add(hu.pos, f.aimStick);
  else aim = add(hu.pos, fromAngle(hu.facing, 6));
  let move = moveToWorld(f.moveScreen);
  if (f.moveToAim && !move.x && !move.y) {
    // right mouse held: walk toward the cursor, easing in so you stop on it instead of jittering
    const to = sub(aim, hu.pos);
    const d = Math.hypot(to.x, to.y);
    if (d > 0.15) move = mul(norm(to), Math.min(1, d / 0.6));
  }
  return { move, aim, throwPressed: f.throwEdge, throwHeld: f.throwHeld, wallPressed: f.wallEdge };
}

// ------------------------------------------------------------------ keys (designer/QA only; testers never need them)

input.onKey = (code) => {
  if (code === "Backquote") debug = !debug;
  else if (code === "KeyL") downloadLog();
  else if (code === "KeyM") sfx.muted = !sfx.muted;
  else if (code === "KeyP" && (mode === "play" || mode === "bout")) paused = !paused;
  else if (mode === "blockout") {
    if (code === "Digit1") blockHill = HILLS.A;
    if (code === "Digit2") blockHill = HILLS.B;
    if (code === "Digit3") blockHill = HILLS.park;
    if (code === "KeyD") blockDusk = (blockDusk + 1) % 5;
  }
};

function downloadLog() {
  const blob = new Blob([log.toCSV()], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `snowday-session-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------------ loop

let last = performance.now();
let acc = 0;

function frame(now: number) {
  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sessionT += dt;
  tickFx(dt);

  if (light.k < 1) light.k = Math.min(1, light.k + dt / 3);
  if (light.lampsT >= 0) {
    light.lampsT += dt;
    // flicker on
    const t = light.lampsT;
    light.lamps = t > 0.9 ? 1 : [0.1, 0.25, 0.4, 0.55, 0.7].some((x) => t > x && t < x + 0.07) ? 1 : 0.15;
  }

  if (mode === "blockout") {
    drawBlockout(ctx, { w: null, hill: blockHill, pals: [CHESTNUT_PAL, rivalPal()], aim: null, light: { from: blockDusk, to: blockDusk, k: 1, lamps: blockDusk === 4 ? 1 : 0 }, time: now / 1000, roundsWon, debug: false });
    prebake(HILL_A);
// canvas text waits for the webfont so the HUD never flashes in a fallback face
void document.fonts.load("700 20px Fredoka").catch(() => {});
requestAnimationFrame(frame);
    return;
  }

  if (bout && mode === "bout") {
    if (!paused) {
      acc += dt * speed;
      let first = true;
      while (acc >= DT) {
        acc -= DT;
        const hi = params.get("boss") === "bot" ? (input.poll(), boutBot(bout)) : boutInput(bout);
        if (!first && params.get("boss") !== "bot") hi.throwPressed = false;
        first = false;
        const before = { ...bout.kid.pos };
        stepBout(bout, hi);
        stepDist += Math.hypot(bout.kid.pos.x - before.x, bout.kid.pos.y - before.y);
        if (stepDist > 0.85) (stepDist = 0), sfx.crunch(panOf(bout.kid.pos));
        handleBoutEvents(bout, bout.events);
        // a beat to watch him slump (or your snowdrift) before moving on
        if (bout.over && bout.t - bout.overAt > 3.2) {
          const then = boutThen;
          bout = null;
          boutThen = null;
          acc = 0;
          then?.();
          break;
        }
      }
    } else input.poll();
    if (bout) {
      const b = bout;
      drawBout(ctx, {
        b,
        hill: b.hill,
        rival: rivalPal(),
        aim: b.over ? null : aim,
        time: now / 1000,
        card: boutCard,
        debug: debug
          ? [
              `bout t ${b.t.toFixed(1)}  hits ${b.hits}/${FROSTY.hp}  lives ${b.lives}  phase ${b.special ? `${b.special.kind} +${(b.t - b.special.start).toFixed(1)}` : b.t < b.dizzyUntil ? "dizzy" : "normal"}`,
              `throw cd ${b.kid.throwCd.toFixed(1)}  windup ${b.windup.toFixed(2)}  next volley ${(b.nextVolley - b.t).toFixed(1)}   [\`] debug  [L] save CSV  [M] mute  [P] pause`,
            ]
          : null,
      });
      if (paused) {
        ctx.fillStyle = "rgba(20,25,45,0.35)";
        ctx.fillRect(0, 0, W, H);
      }
    }
    prebake(HILL_A);
// canvas text waits for the webfont so the HUD never flashes in a fallback face
void document.fonts.load("700 20px Fredoka").catch(() => {});
requestAnimationFrame(frame);
    return;
  }

  if (world && mode === "play" && !paused) {
    acc += dt * speed;
    let first = true;
    while (acc >= DT) {
      acc -= DT;
      const hi = world.kids[0].bot ? null : humanInput(world);
      if (hi && !first) hi.throwPressed = hi.wallPressed = false;
      first = false;
      const hu = world.kids[0];
      const before = { ...hu.pos };
      step(world, hi);
      // footstep crunch for your kid
      if (inPlay(hu)) {
        stepDist += Math.hypot(hu.pos.x - before.x, hu.pos.y - before.y);
        if (stepDist > 0.85) (stepDist = 0), sfx.crunch(panOf(hu.pos));
      }
      handleEvents(world, world.events);
      if (mode !== "play") break;
    }
  } else if (world && mode === "play" && paused) input.poll();

  if (world && mode === "roundEnd") {
    roundEndT += dt;
    if (roundEndT > 2.6) {
      mode = "porch";
      afterRound(world.winner as Team);
    }
  }

  if (world) {
    const w = world;
    const hu = w.kids[0];
    draw(ctx, {
      w,
      hill: w.hill,
      pals: [CHESTNUT_PAL, rivalPal()],
      aim: mode === "play" ? aim : null,
      light,
      time: now / 1000,
      roundsWon,
      debug,
      debugText: debug
        ? [
            `t ${w.t.toFixed(1)}  phase ${w.phase}${w.phase === "sudden" ? ` sd ${w.sdT.toFixed(1)} hold ${w.sdHold.t.toFixed(1)}` : ""}  score ${w.score[0].toFixed(1)} / ${w.score[1].toFixed(1)}  street ${street + 1} reaction ${w.cfg.reaction}`,
            `sled ${w.sled.carrier >= 0 ? w.kids[w.sled.carrier].name : "free"}  poss ${w.stats.possChanges.reduce((a, b) => a + b, 0)}  handoffs ${w.stats.handoffs.reduce((a, b) => a + b, 0)}  longest hold ${w.stats.longestHold.toFixed(1)}s`,
            `you: out ${w.stats.humanOut.toFixed(1)}s  first touch ${w.stats.humanFirstTouch.toFixed(1)}  silent handoff presses ${w.stats.silentPressesTotal}  wall presses ${w.stats.wallPresses} (cooldown ${w.stats.wallPressesCooldown})`,
            `chills ${w.kids.map((k) => `${k.name}:${k.chills}`).join(" ")}`,
            `wall cd ${hu.wallCd.toFixed(1)}  throw cd ${hu.throwCd.toFixed(1)}   [\`] debug  [L] save CSV  [M] mute  [P] pause`,
          ]
        : undefined,
    });
    if (paused) {
      ctx.fillStyle = "rgba(20,25,45,0.35)";
      ctx.fillRect(0, 0, W, H);
    }
  } else if (attract) {
    const a = attract;
    input.poll(); // clicks on the demo never carry into your first round
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      step(a, null);
      for (const e of a.events) fx(e, a);
    }
    if (a.phase === "over") newAttract();
    draw(ctx, { w: a, hill: HILL_A, pals: [CHESTNUT_PAL, rivalPal()], aim: null, light: { from: 1, to: 1, k: 1, lamps: 0 }, time: now / 1000, roundsWon, debug: false, attract: true });
  } else {
    draw(ctx, { w: null, hill: HILL_A, pals: [CHESTNUT_PAL, rivalPal()], aim: null, light: { from: 0, to: 0, k: 1, lamps: 0 }, time: now / 1000, roundsWon, debug: false });
  }
  prebake(HILL_A);
// canvas text waits for the webfont so the HUD never flashes in a fallback face
void document.fonts.load("700 20px Fredoka").catch(() => {});
requestAnimationFrame(frame);
}

// The game is laid out in 1280x720; the backing store follows the real screen pixels so it stays crisp.
let pxScale = 1;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
  // overlays (the title) size themselves to the picture, not the window
  document.documentElement.style.setProperty("--cw", `${W * s}px`);
  document.documentElement.style.setProperty("--ch", `${H * s}px`);
  pxScale = Math.min(3, Math.max(1, s * (devicePixelRatio || 1)));
  canvas.width = Math.round(W * pxScale);
  canvas.height = Math.round(H * pxScale);
}
window.addEventListener("resize", fit);
fit();

if (params.get("view") === "blockout") {
  mode = "blockout";
  blockHill = params.get("hill") === "park" ? HILLS.park : params.get("hill") === "A" ? HILLS.A : HILLS.B;
} else if (params.has("boss")) {
  // testing: ?boss=1 goes straight to Frosty's bout, then back to the title
  startBout("Snowballs only", title);
} else if (botsOnly) {
  seed = +(params.get("seed") ?? 1);
  startRound();
} else title();

prebake(HILL_A);
// canvas text waits for the webfont so the HUD never flashes in a fallback face
void document.fonts.load("700 20px Fredoka").catch(() => {});
requestAnimationFrame(frame);
