// One CSV, one row per event, sparse columns. `event` says which columns apply:
//   second    sled, score_c, score_r
//   throw     kid, team, card, ring_x, ring_y, flight, outcome, target, target_dist,
//             target_front, target_busy, closest (misses only), volley (siege rings)
//   chill     kid, team, by, card (the item: plain/ice/rock/blower/launcher/snowman), dist, volley
//   garage    kid, team, credits (held on arrival), note (item bought or "none"), secs (on screen, human)
//   handoff   kid, target
//   possession kid, team                   (team switch on the sled)
//   bucket    bucket, poss, handoffs       (30s buckets)
//   input     kid, note                    (human: silent handoff presses, wall presses...)
//   porch     note, hover                  (button pressed, hover seconds)
//   siege     team (defenders), kid (carrier), secs, volley (count)   one per siege
//   hold      team, kid, secs              one per continuous crown hold
//   round     winner, score_c, score_r, note (summary)
// Every row carries day (snow day), street (1-3), match and round: gear carries across a whole day.

export const COLUMNS = [
  "day",
  "street",
  "match",
  "round",
  "t",
  "event",
  "kid",
  "team",
  "card",
  "ring_x",
  "ring_y",
  "flight",
  "outcome",
  "target",
  "target_dist",
  "target_front",
  "target_busy",
  "closest",
  "by",
  "dist",
  "sled",
  "score_c",
  "score_r",
  "bucket",
  "poss",
  "handoffs",
  "winner",
  "hover",
  "volley",
  "secs",
  "credits",
  "note",
] as const;

export type Col = (typeof COLUMNS)[number];
export type Row = Partial<Record<Col, string | number | boolean>>;

export class Recorder {
  rows: Row[] = [];
  header: string[] = [];
  day = 0;
  street = 1;
  match = 0;
  round = 0;

  add(event: string, t: number, r: Row = {}) {
    this.rows.push({ day: this.day, street: this.street, match: this.match, round: this.round, t: +t.toFixed(3), event, ...r });
  }

  toCSV() {
    const esc = (x: unknown) => {
      if (x === undefined || x === null) return "";
      const s = typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : String(x);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = this.header.map((h) => `# ${h}`).join("\n");
    const body = this.rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(",")).join("\n");
    return `${head ? head + "\n" : ""}${COLUMNS.join(",")}\n${body}\n`;
  }
}
