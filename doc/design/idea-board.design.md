# wargames

_Exported 2026-10-26 from idea board._

## Brief

### What we're building

Were designing a cozy isometric snowball fight game.  There are two teams, each team, has 4 players.  This is a single player game so I'm leaving it vague for you to decide.  

### Decided (Foreman; host's calls outrank everything)

- 1 human + 3 AI allies (Pip, Scoop, Waffle) vs 4 AI. Match = first to 2 rounds of 120s (host): your hill, their hill, the park only at 1-1.
- Round: most crown-seconds with the toboggan. Sled starts beside the human in round 1, foot-centre in rounds 2–3. Every crown = same flat saddle. Tie → sudden death, capped 60s.
- Clock: afternoon → dusk (≥4 steps) → streetlights at 120s, plus a 20s countdown. Lighting resets each round.
- Camera: one fixed iso shot of the whole ~26m hill, kids ~48px at 720p. No pan.
- Controls (host): mouse only. Right-click walks to the cursor, left-click throws (hands off while carrying), middle-click builds.
- No elimination: a chilled kid warms up at the cocoa stand, ~8s, out of play. Target ≤2 chills per kid per round (bench + siege combined, <15%).
- Garage shop (host, rule 4): 4 credits per round played, +2 per round win, plus hits and crown time; one purchase per visit; ice 4, melter 4, rock 8, snowman 8, launcher 10. Gear and credits last the whole snow day (host), bots too; 'New snow day' wipes them, with a notice beside the button. A garage with nothing worth buying is one Continue click. Not yet built: bazooka, igloo, fort.
- Plain snowball = fast flat line, never clears a wall. Wall: one per kid, 1s plant at your feet, 8s cooldown (ghost footprint). Nothing built on the crown.
- Hits: first kid touched below head height in flight, or anyone in the ring at touchdown. One hit chills. No friendly fire.
- AI: Beanie, Pockets (blower), Brick (never throws), Copycat; fair-bot dodging.
- SIEGE: the crown holder faces one shared volley, ONE release frame per cadence, ≤4 live rings. Defenders 8m+ bracket the carrier's path; closer ones throw one direct shot. Cadence 2.0 / 1.5 / 1.45s per street; street 3 adds a second blower.
- FROSTY (host): bonus bout on 'Next street' / 'New snow day' (before the wipe). 60s, plain snowballs only, no building. 10 hits to melt him, you take 3. Specials at 15/30/45s (Burst, Burst, Double Blizzard) are instant loss outside a safe zone, with a 2.5s snowflake warning; the two mounds move at each wind-up. Prize: his pot hat on the porch screen.
- Session: up to 3 named streets (Maple Court, Ivy Terrace, The Summit Kids); gear carries across the day, nothing carries into a new snow day.

WAITING ON THE PLAYTEST: the two-slot loadout (rule 4) switches on only if street-3 chills per kid break ≤2 while street 1 clears it, or the launcher takes >60% of street-1 purchases (QA #32, #36).
NEXT: host playtests Frosty and persistent gear; Systems builds the siege and reruns the bot log.

### Hook: Snow Day (Creative v0)

Chestnut Street against three rival streets, three sledding hills each, and the streetlights are about to come on. Get the toboggan to the crown and hold it there longer than they do.
TONE: cozy = warm, silly, low stakes. Every upgrade is garage or kitchen junk: the launcher is a tennis-ball thrower, the rock is dirty plough ice, the bazooka is a cardboard-tube snow cannon. If it looks like a weapon ad, reskin it.
FIRST 30s: the whistle, sled 2–3m from your porch, everybody sprints. No tutorial; teach by racing.
LIGHT: the sky resets each round because it is the round clock, not the evening's.

### What a good throw feels like (Creative)

A snowball is a hard flat line (0.35s + 0.05s/m) arriving as the kid flinches; a free, watching kid at 6–10m is hit ≥60%. Reflex-dodging is NOT the skill.
1) The skill is the angle: a kid facing you sees it; one at your side, behind, or busy can't. A 30–45% match hit rate is healthy.
2) A plain ball NEVER clears a wall — walls are the reason to move. Only the blower (0.50s + 0.12s/m) arcs.
3) A miss looks like a near miss: it skids past the boots, ≥80% within 1.2m.

### Greybox verdict rules (QA) — decide before we look

Three first-timers, no coaching, one greybox match (first to 2 rounds of 120s, hill A, final camera, full dusk ending, porch screen). Temp audio: whistle, crunch, sled shout, release, impact, wall break, lights clunk; no sound for a landing ring. No audio = void session.

WATCH, nothing asked: 1) touches the sled within 20s; 2) hands off in minute 1 (QA #23); 3) builds unprompted in round 1, and whether a cooldown press stops them; 4) says who's winning at 35s and 105s; 5) porch button + hover time (QA #24); 6) what they look at while carrying (QA #25). Log the first unprompted complaint verbatim, with the minute.
STOPWATCH: seconds the human can't act (chilled, walking, at the stand; carrying counts as play). Target <15%; >25% = bench or walk too long.
CSV: human's crown-second share (QA #21); sudden-death rounds (>1 in 6 = scoring too flat); crown vs open-field chills.
AFTER: What told you time was running out (sky or countdown)? How did you know the sled changed hands? Lose sight of sled or kid? What changed the score? Best moment? What did you do when not carrying? Reopen the shop on purpose?

ONE FIX PER FAILURE:
- never touches the sled → cut a rule or move a spawn, never a prompt.
- never hands off → fix the ally wave, no text.
- never builds → cut the human's build; Brick keeps his walls.
- stops building after a cooldown press → bolder ghost footprint, no text.
- can't say who's winning → fix the score strip.
- loses the sled → camera or pennant failed; no new HUD.
- not in the score → move the round 2–3 sled toward Chestnut; never slow allies.
- 'Finish snow day' is NOT read from one match: with gear carrying over, the first Next also buys gear (QA #24). Read hover time across streets 1→2→3; only rising hover is a verdict. Then bucket possession changes by 30s: mostly in the first 60s = fix crown/geometry; late = the ending failed.

n=3 proves confusion, not fun. Fun verdict = the host playing a whole match.

## Brainstorm

### Snowball fight

- [x] **Scoring:** 1 pt per second the sled is carried on the crown; most at 120s wins. Credits buy upgrades, never decide a round.
- **Porch screen: two lines, no stats:** Line 1 = the grudge, may name one kid ('Maple Court took your hill — Beanie got you twice'). Line 2 = the round score. Between rounds: 'Continue' to the garage; match end adds the street buttons (rule 10), with the reset notice beside 'New snow day' (Art). The only place history, names and Frosty's pot hats appear. _(Claude added, not reviewed)_

### Core loop rules — Systems (numbers kept stable: 2 ruled out, 6b ruled out, 9 dropped with the cards)

- **1. Sled is carried, not camped:** Carrier: 60% speed, can't throw or build. No stealing: the sled changes hands only when a chilled carrier drops it in place (anyone may grab it) or by handoff (rule 6). A dropped sled doesn't score. Camping = slow, unarmed target, so teammates escort.
- **3. Sudden death:** Tie at the lights: first team to hold the crown 5 continuous s wins (a drop, chill or rival pickup resets it); after 60s, the first crown-second wins. The cap never pauses.
- **4. Garage shop + economy:** Between rounds only; every kid shops, bots too. Round 1 of street 1 = plain snowballs. PERSISTENCE (host): upgrades and unspent credits last the whole snow day (all 3 streets), for every kid including the bots. 'New snow day' wipes everyone back to plain; the notice sits beside that button before the click: 'Fresh snow, fresh start — your gear and credits reset.' CREDITS: 1 per hit, 1 per 6 crown-seconds, 4 per round played, +2 per round win. PRICES: ice 4, melter 4, rock 8, snowman 8, launcher 10. Ice and rock share the ball slot. GUARDS: one purchase per visit. Siege volleys always use the street's listed rings, never a bot's purchases (Fix 2). Spending never touches scoring. GARAGE SCREEN (Art, default now): owned items read 'Owned — lasts this snow day', never priced again. If nothing is affordable or worth buying, it leads with 'Your gear is ready' and one Continue click to the next hill. NAMED LEVER, OFF until the persistence gate (QA #32) trips: two-slot loadout. You keep everything you own but carry one throw (plain, ice, rock or launcher) and one build (wall or snowman); melter is passive, outside the slots. Never fix the launcher with its price (QA #36). BOT WISHLISTS (first affordable): Beanie ice → launcher → rock; Pockets melter → snowman (keeps the blower); Brick melter only (he never throws); Copycat copies the human's last buy, else ice → launcher.
- **5. Builds: snow wall by default:** Middle-click plants ONE low wall (1.5m) at your feet, facing your aim. 1s plant (busy); planting again moves it. 8s cooldown after any plant or break. Blocks flat throws; ice and rock break it. A bought snowman replaces it (rule 7). Igloo and fort: host-approved, not built yet.
- **6. One order = handoff:** While carrying, left-click shoves the sled to the one outlined ally within 6m (carrier types only, never Brick). Otherwise it does nothing: no toss, cooldown or sound. Teacher: an eligible ally within 6m with no ring on them waves for the sled. No text.
- **7. Throwing: aim a spot, hard line:** Mouse aims a landing ring (r 0.8m); left-click throws. Ring visible to all from commitment; ball casts a shadow dot. Your ring hides while you carry; the handoff outline replaces it (QA #25). - Plain: 0.35s + 0.05s/m, flat, 12m, NEVER clears a wall. - Ice: 0.25s + 0.03s/m, flat, 12m, shatters the wall it hits. - Rock: plain flight; smashes through walls and snowmen and keeps going; knocks a kid it chills 1.5m off the spot, away from the sled they dropped. - Launcher: hold to spray: 0.3s + 0.04s/m, 9m, ring 0.45m, scatter ≤0.5m, 15-ball hopper, 2.5s reload. One pellet chills; balance by its own numbers, never its price (QA #36). - Melter: walk into a rival wall/snowman to melt it. Touch a chilled teammate while they're frozen in place or still walking to the cocoa stand to thaw them on the spot (once per 6s). Once they reach the stand they're out of play and can't be thawed. Host's call; it restores 'heal a chilled ally'. - Snowman: replaces your wall (3 hits, 12s cooldown); pelts rivals within 8m every 2.2s. - Blower (Pockets): 0.50s + 0.12s/m, high lob, clears walls, 14m.
- **8. Nothing gets built on the crown:** No walls inside the 4m crown circle or within 2m of the sled: no camping under cover.
- [x] **10. Session ladder — 3 streets; gear carries across the day:** Snow day = up to 3 streets (~20 min); gear carries across them (rule 4). Plain rings: Beanie, Copycat; blower cappers: Pockets; Brick never throws. Street 1 Maple Court: Beanie, Pockets, Brick, Copycat; siege 2.0s; 2 plain (lead + side) + 1 capper; reaction 0.60s. Street 2 Ivy Terrace: same mix and rings; 1.5s; 0.50s. Street 3 The Summit Kids: Beanie, 2 Pockets, Brick; 1.45s (floor); 1 plain lead + 2 cappers on both exits; 0.45s. Max 4 live rings (QA #29). After each match: equal 'Next street' / 'Finish snow day'; after street 3: 'New snow day' / 'Finish snow day'.
- [x] **11. Build numbers:** Crown = same flat 4m radius on every hill; only approaches change. Greybox reaction 0.50s (log header). SPEEDS: kid 4.5 m/s, carrier 2.7 m/s, no stamina or slope modifier. No dodge button: a dodge is walking out of a ring (right-click); a 0.8m step from standstill ≈ 0.25s.
- **12. Camera: one fixed iso shot:** Whole ~26m hill in one 1280×720 frame (~49px/m, kids ~48px). No follow or pan; human, sled, crown, both porches and flanks always visible. Same footprint on all three hills. Each porch at the foot of its side; kids emerge in a 1.2m arc, human front-centre.
- [x] **13. Busy vs free stance:** BUSY (planting) can't move. A CARRIER (2.7 m/s) clears 1.0m of ring in 0.37s, 2.0m in 0.74s, vs a free kid's 0.25s step (rule 11). That gap is why the siege bites and brackets come from range. The pose is the information.

### QA: playtest risks — test these before adding anything

- [x] **15. Outcomes read as aftermath — ACCEPTED:** Spec in Art 'Feedback'. TEST: unlabelled 60s clip, ask 'how many throws missed?' None = misses aren't rendering; hit vs untouched unclear = chill state too subtle.
- [x] **17. Cocoa stand out of play — ACCEPTED:** TEST: log repeat-chills within 5s of returning; more than a couple = the stand is exposed, move it further off the hill.
- [ ] **21. Is the human actually in the score?:** Pip and Scoop can win without the human. CSV: crown-seconds per carrier; share <1/3 is calibration. FAIL only if share <1/3 AND they credit only an ally's carry. FIX: move the round 2–3 sled 1.5m toward Chestnut; never slow allies. _(Claude added, not reviewed)_
- [ ] **23. Handoff: count silent presses:** A failed handoff is silent. From the input log, count carrying throw-presses before the first success, per round: 1–2 = the wave taught it; 3+ = fix the wave (ally turns, arm higher), never a ring, number or tooltip; no handoff at all = 'never hands off'. _(Claude added, not reviewed)_
- [ ] **24. 'Next street' is the verdict:** Log button + hover seconds. Next fast = wants more; hovering ~10s then Finish = cost not worth paying; instant Finish = done. No prompting; Next never styled nicer than Finish. PERSISTENCE CAVEAT (was #34): Next also buys gear for later hills, so the first Next is no verdict. Read hover time across streets 1→2→3: flat/falling = wants more hills; rising = pricing the button (and Frosty inherits the resentment). _(Claude added, not reviewed)_
- [x] **25. Aim ring hidden while carrying — ACCEPTED:** TEST: ask what they watched while carrying and how they knew where rings would land. Watching their own cursor = the ring is stealing the siege read.
- [x] **26. Shop limits — ACCEPTED:** Limits in rule 4. TEST: does a first-timer reopen the shop unprompted? If not, it's a screen, not a system: cut prices, keep two items.
- [x] **28. Shop beginner fix — RULED:** Cheapest item = 4 = a no-hit, no-crown round (rule 4). Shop screen may use text (host). TEST: ask 'what could you afford?'; counting aloud twice = the screen isn't reading.
- [x] **29. Max live rings — RULED: cap 4:** A volley is held back if it would put >4 siege rings in flight on one carrier. CSV logs max live rings per carrier per round.
- [x] **31. Siege vs bench — RULED: one combined number:** A chill costs ~8s, so <15% allows two chills per round; a willing carrier's 2–3 holds can blow that while the crown works. Report human chills + bench seconds as one number. Bench >15% with holds at 8–20s: cut warm-up 8s → 5s first, move the stand second. Never shorten cadence for a bench number.
- [ ] **32. Persistence gate (merged #32, #35, Systems):** Read per street, the same player against their own street 1. TRIP: on street 3, chills per kid break the ≤2 rule (or bench >15%) while street 1 clears it. A win-rate jump is too weak to detect with n=3 (Systems), and 'zero swaps' can't fire while nothing needs swapping (QA #35). Split launcher chills from plain-ball chills in the CSV. ON TRIP: pull rule 4's two-slot loadout. Never retune the street tier or raise prices for this. Don't add shop items just to fill the shelf (Creative). _(Claude added, not reviewed)_
- [ ] **36. One item wins the day: launcher purchase share:** Persistence stretches the launcher over three streets for one payment, so 'save for the launcher, ignore the shelf' may be the only strategy. TEST: share of street-1 paid purchases by item. Launcher above ~60% = one item decides the day. RESPONSE: pull rule 4's two-slot loadout (the launcher becomes your one throw). Never raise its price; that only empties street 1 for first-timers. _(Claude added, not reviewed)_

### Art direction + readability prototype

- **48px identity — one rig, four variants:** One rig, four head/coat silhouettes reused by both teams. Priority: head shape, team colour + scarf pattern, pose. Chestnut = burnt orange bands. Rivals by street: Maple Court = deep teal V; Ivy Terrace = plum dots; The Summit Kids = mustard zigzag (Foreman placeholders, Art may swap, but never a colour near orange). White overhead chevron = human only. Busy state from real carry/plant poses, no icon. Pennant on the sled, stays with a dropped sled. Charm goes in snowbanks and porch lights, not 48px detail.
- [x] **Throw readout:** Plain: short bright streak, dark underside, moving shadow; never a lob. Blower: raised ball, broken coral touchdown bracket. Preview stops at walls; footprint matches collision. No more warning layers before human testing.
- [x] **Score strip + ownership:** Pennant = carrier's team; dropped = white. Crown edge pulses each scoring second. Top strip: teams, crown-seconds, sled icon by the scorer, exact countdown in the last 20s; dusk and lamps reinforce it. Handoff preview outlines ONE eligible ally within 6m with a short sled arrow; never Brick.
- [ ] **Greybox readability gate (human eyes, not telemetry):** Hill A, 1280×720, three unlabelled 1s clips (8-kid scrum / lob / wall interception) at sunset and dusk. A first-timer names human, carrier, leading team and incoming threat, then points to an escape; record errors and time. FLANK: from each porch they point at the flank route within 1s, at dusk too. MEASURE: kids ≥48px; landing footprint in projection; misses ≤1.2m for ≥80% (world-space CSV). The capture beats arithmetic.
- [x] **Feedback: aftermath + wall status:** HIT: chilled, stopped kid + brief puff. MISS: ball resting at the end of its skid. WALL BLOCK: lasting dent, not a hole; only ice/rock break walls. Never hide chevron or pennant; no clouds or screen shake. WALL STATUS: ghost footprint fills with the cooldown, full outline when ready, barred when illegal; never looks solid. The plant pose starts only on a legal plant.
- [x] **New-day reset notice — before commitment:** Beside 'New snow day', before the click, always visible: 'Fresh snow, fresh start — your gear and credits reset.' No confirm modal; Next street never shows reset copy. Avoid 'gear melted': garage junk doesn't melt. _(Claude added, not reviewed)_

### The eight kids — AI as characters

- **Beanie — always wants the sled:** Makes the crown a door anyone can kick open. Silhouette: striped beanie.
- **Pockets — keeps 6m away (leaf blower):** Back-line lobber; teaches you to respect the landing ring. Silhouette: bulging pockets.
- **Brick — only builds:** Walls the approach so his team's carry is easy. Silent, calm, faintly comic. Silhouette: too-big mittens, sits low.
- **Copycat — copies your action, never your allegiance:** Mirrors your last action type, exaggerating your throw pose. Wears his own street's colours and hat: head shape is the top identity cue.
- **Chestnut's three — your street:** Pip (Beanie logic), Scoop (Pockets), Waffle (Brick). Same rig, orange bands, no new mechanics. _(Claude added, not reviewed)_
- **Names, not dialogue:** Learned by behaviour; names appear only in the porch grudge line. No barks or text in flow: cozy = quiet.
- [x] **Behaviour rules (Systems) — no state trees:** Beanie: grabs a free sled, shortest legal path to the crown. Throws only when the sled has been off the crown 5s+. Never builds. Pockets: blower only; holds 6–10m from the nearest enemy, faces their carrier, backs off inside 6m. Carries only as fallback. Brick: never carries, receives or throws. Keeps his wall between his carrier and the nearest threat (outside the crown, ≥2m from the sled); wall down = walks 2m ahead as a shield. Copycat: 2s after the human acts, repeats that action type; never initiates (copies the stand-in in bot runs). SIEGE suspends Beanie's 5s rule and Copycat's never-initiate rule, for volley throws only (Host playtest 1). FAIR-BOT: reacts only to committed rings in its ~120° front arc, after its reaction time, by walking 0.8m out (rule 11). Carriers and builders don't dodge. Difficulty = street tier (rule 10); reaction 0.45–0.60s governs dodging only. Fallback carrier when Beanie is chilled 3s+: Pockets, then Copycat. ALLIES: same logic. They never take a handoff the human didn't give, but a sled the human drops is free for anyone (6b stays ruled out). SHOPPING: wishlists in rule 4. STAND-IN (bot runs): Beanie logic, plain snowballs; in shop tests buys the item under test.

### Greybox bot round — logs and pass/fail (Systems)

- [ ] **Record one CSV, one fixed seed:** Every row tagged with snow day, street (1–3), match and round. Per second: sled state, both scores. Per throw: thrower, item, distance, ring position, flight time, outcome (hit / wall / empty / stepped out), target facing and busy. Per volley: shared release-frame ID. Per miss: closest approach. Per kid per round: chills, split by the item that caused them (launcher vs plain vs other), bench seconds, credits. Per garage visit: street, credits held, item bought or none, Continue clicks. Per round, 30s buckets: possession changes and handoffs. Conditions: run whole snow days so kits carry over exactly as in play; stand-in in the human slot. The siege gate uses street 1 (0.60s); other checks use 0.50s.
- [ ] **Pass/fail — does the loop exist:** Sled on the crown 25–60% of the round; ≥6 possession changes per round; longest hold ≤25s, else camping: fix geometry or a rule, never HUD. Log siege volleys (count, rings, hits).
- [ ] **Pass/fail — are the decisions real:** Clear a ring = reaction + 0.25s step + 0.1s slop (0.95 / 0.85 / 0.80s by street). Free, facing kid at 6–10m: hit ≥60% (<50% = flight time wrong). Busy or flanked: ~100%. Match hit rate 30–45%: >60% = bots blind; <25% = no flank route, fix geometry. Chills: 4–8 per team per round, ≤2 per kid (2 × 8s = 13% of 120s); a 3rd is a geometry/spawn report. Count crown-hold chills apart from open-field. Misses: ≥80% within 1.2m; a ball through a body is a collision bug.
- [ ] **Shop phase: per-item win rate, one retune then delete:** Per item: 30+ matches (0.50s, hill A) with the stand-in forced to buy it, vs plain-snowball control on the same seeds. Outside 40–60% win rate: one retune of the item's own numbers (range, rate, cooldown), then cut. Never a price change for the launcher (QA #36); for other items price is the last resort. _(Claude added, not reviewed)_
- [ ] **Wall-block share:** Share of plain throws that die on a wall. <25%: ship. 25–35%: watch, shorten the flank. >35%: walls are the game; fix geometry (wider flank) or a slower rebuild, not a new item. _(Claude added, not reviewed)_

### Siege (Host playtest 1: the crown was too safe)

- **Diagnosis (from greybox/src/sim/ai.ts):** Vs a human on the crown only Pockets attacked (one blower per 8s). Beanie waits for a drop, Copycat mirrors throws a carrier can't make, Brick never throws: 3 of 4 rivals passive while the human scores.
- [ ] **Fix 1: Siege — one shared volley, not per-bot cadences:** TRIGGER: an enemy carries the sled within 2m of the crown edge; ends when it's dropped, carried 2m+ away, or retaken. Every free defender (not chilled, carrying or planting) joins ONE shared volley timer, so each volley is one visible event. AI exceptions in the behaviour rules; Brick never throws. SYMMETRIC: Pip/Scoop/Waffle siege a rival carrier the same way.
- [ ] **Fix 2: Bracket — lead from range, direct shot up close:** One volley = every free thrower's ring on the SAME frame. Rings come from the street tier (rule 10), never a bot's bought item, so the 4-ring cap holds. FAR (8m+) plain: lead = carrier position + velocity × flight time, plus a ring 1.2m to one side. NEAR (<8m): one direct shot, no lead. CAPPERS (blowers) land ~1s late on the obvious exit; street 3's two cover both. Bracket punishes running straight, near shot standing still, capper the obvious exit: irregular walking is the skill. Stepping out of a ring inside the crown keeps you scoring. Handoff is the free escape. All rings visible from release, no homing.
- [ ] **Gate (don't overcorrect):** Loop gates still hold. NEW: a willing carrier's median street-1 crown hold is 8–20s (≥12 holds over 6 rounds); no carrier chilled by two volleys in a row more than twice per round. Log thrower distance per siege ring: most crown chills from <8m = near rule missing. Never survives 8s → lengthen the volley period. Crown never held → fix geometry (cover outside the crown or a 2m no-throw band). Holds past 20s → add a capper before shortening cadence. RETUNE one lever at a time: capper count → cadence (1.45–2.0s) → lateral spacing (1.2m). Never shrink the 0.8m ring.

### Boss bout: Frosty (merged spec, Foreman + Systems + QA)

- [x] **Frosty: 60s, 10 hits to melt, you can take 3 (host):** Your kid alone vs Frosty on the crown, 60s, streetlights on. He never moves or dodges and is big and easy to hit; 10 hits melt him, his 3rd hit on you (or the clock) ends it. A hit on you = knockback + cancelled throw, never the cocoa stand. PLAIN SNOWBALLS ONLY, NO BUILDING: the launcher would erase his 10 hits and your wall would bypass the moving mounds.
- [ ] **Specials: Blizzard Burst, then Double Blizzard (RULED):** NORMAL: aimed volleys at you (lead ring + direct ring + lob); a hit = one of your 3. They pause for the whole special. SCHEDULE (fixed by the clock, not by hits): 15s Blizzard Burst, 30s Blizzard Burst, 45s Double Blizzard. 2s dizzy after each (free throws). BLIZZARD BURST: gapless ring of flat snowballs in every direction; instant loss unless you're in a drawn safe zone (host). DOUBLE BLIZZARD: one relocation, one warning, then two bursts ~1.5s apart from the same cover. First 'run now', then 'stay put'; stepping out between them to steal a throw is the greed trap. WARNING: 2.5s snowflake swirl tight around Frosty, bigger and louder each half-second, a different pose per special. Nothing fires without the full swirl.
- [ ] **Shelter moves when he winds up (host) — RULED timing:** Two snow mounds. Each special starts with a 0.5s mitten sweep: old mounds sink, snow puffs mark where the new ones rise (show the destination first). New mounds are fully formed BEFORE the 2.5s swirl, then locked; nothing moves mid-warning or mid-impact. Random placement, but one mound is always 5–7m from your kid, so the run always fits. Safe zone drawn in the snow. Mounds stay put between specials. His lob clears them, your plain ball can't: cover and firing position are opposite sides of the same mound. _(Claude added, not reviewed)_
- [ ] **Prize: Frosty's pot hat on the porch screen (RULED):** Win: Frosty's pot hat + 'You melted Frosty' beside your street on the porch screen for the rest of the snow day (up to 3). A hat won after street 3 shows on that day's final porch card, then the new day starts clean. Nothing on the field (it would read as the bought snowman). No power or credits: a bonus never touches balance.
- [ ] **Losing costs nothing:** Caught by a special or his 3rd hit: a kid-shaped snowdrift pops out your hat, then a mitten. Win: Frosty slumps into a heap, pot on top. Nothing lost; a bonus, never a tax.
- [ ] **Placement: 'Next street' plays it, 'Finish' skips it:** After the porch screen, so it never muddies the Next/Finish read (#24). 'Next street' / 'New snow day' plays it, then the whistle; 'Finish snow day' skips it. No third button. On 'New snow day' the bout plays BEFORE the wipe, so the old day's porch card still gets its result. If Next-choosers quit mid-bout, drop to 2 specials first (Tuning); the 60s clock stays.
- [ ] **Art fairness gate — a full warning starts at readable cover:** Burst collision is gapless at the farthest playable radius and matches the visible snow; drawn safe zone = real blocked area. TEST at 720p, frozen as the old mound sinks: within 0.5s a first-timer points to the new safe side, then reaches it by right-click before release from the worst legal spot. _(Claude added, not reviewed)_
- [ ] **Tuning + what to log (RULED):** BUDGET: Blizzard Burst ~5.5s without normal throwing (0.5 sweep + 2.5 warning + release + 2 dizzy), Double ~7s: ~18s total, leaving ~42s of throwing plus ~6s dizzy windows. At ~1 hit per 2.5s under fire, 10 hits fits a player who throws in the open and spends 1–2 of 3 hit points. Skilled fit, not a sure win. RED LINES: median 1–2 hit points spent. 0 in most bouts = strengthen the normal volley. Most end at 3 hits taken = lengthen the gap between specials. First-timer median <8 hits at the buzzer = drop to 2 specials (20s, 40s). The 10 is the host's call; never change the 2.5s warning or the 60s clock. LOG: hits landed by second; hits taken normal/special; swirl-start-to-safe seconds; throw gap across each special. _(Claude added, not reviewed)_
- [x] **Bout kit: show owned gear is gone before they press:** A returning player clicks, gets a plain ball instead of their launcher, and reads it as broken. FIX (QA, accepted): the bout opens with your kid holding a plain snowball in hand. Bout card copy: after 'Next street', 'Snowballs only — your gear waits in the garage'; after 'New snow day', just 'Snowballs only'. Don't grey out buttons. _(Claude added, not reviewed)_

### Pictures

**Placeholder silhouette reference, not sprite-ready. Keep: chunky pockets/mittens, bold coat patterns, readable sled. Fix: chevron over the orange human only (no hat ticks); orange bands on all four coats; pennant on the sled; remove background. Test at 48px.** · GPT-6.1 Sol · Art Director

![Placeholder silhouette reference, not sprite-ready. Keep: chunky pockets/mittens, bold coat patterns, readable sled. Fix: chevron over the orange human only (no hat ticks); orange bands on all four coats; pennant on the sled; remove background. Test at 48px.](<idea-board.assets/b6ad4cd0a7c4948a614b4f854bf6ccd5.jpg>)

**Identity exploration: keep the square/stripe and notched/V pairing at top; ignore gibberish labels. Bottom carrier art is WRONG: carrier's team emblem, not rainbow; sled hugged in both arms (rule 13), not ridden; pennant on the sled.** · GPT-6.1 Sol · Art Director

![Identity exploration: keep the square/stripe and notched/V pairing at top; ignore gibberish labels. Bottom carrier art is WRONG: carrier's team emblem, not rainbow; sled hugged in both arms (rule 13), not ridden; pennant on the sled.](<idea-board.assets/779418e61082fd81a8a70909f1dfbcdc.jpg>)

**Dusk mood + score-strip exploration, not a blueprint. Keep: open snow, warm edge light, restrained silhouettes. Ignore: >8 kids, ridden sled (must be hugged), walls around the crown (must be outside), curved plain-ball trail, missing handoff outline.** · GPT-6.1 Sol · Art Director

![Dusk mood + score-strip exploration, not a blueprint. Keep: open snow, warm edge light, restrained silhouettes. Ignore: >8 kids, ridden sled (must be hugged), walls around the crown (must be outside), curved plain-ball trail, missing handoff outline.](<idea-board.assets/c577a5d9b953273acd231b66fba8f266.jpg>)

**Feedback reference: chilled vs unaffected + resting miss; wall splat; cooldown/ready/illegal ghost states. BLOCK mark is a shallow dent, never a hole. Test footprint strength on dusk snow. Teal skin is exaggeration, not a chill recolour. Labels for this sheet only.** · GPT-6.1 Sol · Art Director

![Feedback reference: chilled vs unaffected + resting miss; wall splat; cooldown/ready/illegal ghost states. BLOCK mark is a shallow dent, never a hole. Test footprint strength on dusk snow. Teal skin is exaggeration, not a chill recolour. Labels for this sheet only.](<idea-board.assets/a54543e6215ce8ab822f1d2887993b68.jpg>)

**Frosty boss exploration (Art). Spec lives in 'Boss bout: Frosty'; shelter is now two mounds that move at each wind-up.** · GPT-6.1 Sol · Art Director

![Frosty boss exploration (Art). Spec lives in 'Boss bout: Frosty'; shelter is now two mounds that move at each wind-up.](<idea-board.assets/4dd11518e313c394a8d1d2076b64bd70.jpg>)

**Shelter relocation — safe side: two neutral-grey footprints behind cover, away from Frosty; no safe tint between him and cover. Orientation key only: build footprints from real blocked geometry; validate the transition at 720p.** · GPT-6.1 Sol · Art Director _(Claude added, not reviewed)_

![Shelter relocation — safe side: two neutral-grey footprints behind cover, away from Frosty; no safe tint between him and cover. Orientation key only: build footprints from real blocked geometry; validate the transition at 720p.](<idea-board.assets/fcc1ab7b48230a973ec2c179a1d5d01a.jpg>)

## Flowchart

### Accepted cards

- **Snow Day whistle**: Everyone starts on their own porch. Round 1: sled 2–3m from the human's porch (the tutorial). Rounds 2–3: sled at the foot of the hill, centre. Only street 1, round 1 is plain snowballs; after that kids bring whatever the garage sold them that snow day. Everybody sprints.
- **Snowball exchange**: Carry the sled to the crown and hold it; the carrier is slow and unarmed, so teammates escort and wall the approach (middle-click). Holding the crown draws a siege volley. Hit = chilled (see Cocoa stand).
- **Streetlights = round over**: Lights flicker on at 120s: most crown-seconds takes the round. Level = sudden death.
- **Porch screen → Garage shop**: Only while the match is still open. Porch screen: grudge line + round score, 'Continue'. Then the garage: one purchase per kid (rule 4); gear and unspent credits last all three streets, resetting on New snow day. Then the next hill: yours, theirs, the park.
- **Sudden death (capped 60s)**: Per ROUND, not per match: if crown-seconds are level at the streetlights, sudden death. First team to hold the crown 5 continuous seconds; after 60s, the first crown-second wins. A match can never end tied.
- **Match end on the porch**: First team to 2 rounds wins. Porch screen: the grudge line + score, then 'Next street' / 'Finish snow day' (win or lose). After street 3: 'New snow day' / 'Finish snow day'.
- **Cocoa stand**: Side of the hill. Chilled kid walks over, warms up, jogs back: ~8s total. Out of play while there (not targetable, not counted). A dropped sled stays where it fell.
- **Frosty wakes up (bonus bout)**: On 'Next street' / 'New snow day' only. 60s, your kid vs Frosty on the crown, plain snowballs only, no building: 10 hits melt him, his normal throws take 1 of your 3. Specials at 15/30/45s (Blizzard Burst, then Double Blizzard) are instant loss outside a safe zone; the two mounds move at each wind-up. Win: pot hat on the porch screen. Lose: nothing.
- **Snow day ends**: 'Finish snow day' skips Frosty. The porch screen shows the day's grudges and any pot hats won, then back to the title.

### Connections

- Snow Day whistle → Snowball exchange (whistle)
- Snowball exchange → Streetlights = round over (sun sets)
- Streetlights = round over → Porch screen → Garage shop (no team has 2 rounds yet)
- Streetlights = round over → Sudden death (capped 60s) (scores level)
- Porch screen → Garage shop → Snow Day whistle (next hill)
- Sudden death (capped 60s) → Porch screen → Garage shop (no team has 2 rounds yet)
- Streetlights = round over → Match end on the porch (a team has 2 rounds)
- Sudden death (capped 60s) → Match end on the porch (a team has 2 rounds)
- Snowball exchange → Cocoa stand (hit = chilled)
- Cocoa stand → Snowball exchange (~8s later)
- Match end on the porch → Frosty wakes up (bonus bout) ('Next street' / 'New snow day')
- Frosty wakes up (bonus bout) → Snow Day whistle (next street's whistle)
- Match end on the porch → Snow day ends ('Finish snow day')

## Ruled out

- **Radial / menu of teammate orders**: "QA + Systems: if the human needs an order menu to make 3 AI allies useful, the AI is broken. One context action is the ceiling." (DeepSeek V4.1 Flash 1017 · QA & Playtester, 2026-10-26, from chat)
- **Copycat wears the human team's coat colour to cause allegiance misreads**: "Art: deliberately confusing enemy allegiance undermines the one-second identification gate in an eight-kid scrum. Mimic behaviour and pose, never the opposing team's identity." (GPT-6.1 Sol · Art Director, 2026-10-26, from chat)
- **Previous winner's pennant left on the crown pole (session history on the field)**: "QA + Art: players read it as live sled ownership — the most expensive misread. History goes on the intermission card / porch sign." (Claude · Foreman, 2026-10-26, from chat)
- **Camera pan to the crown on demand**: "Foreman: adds a 4th control and only exists if the hill is bigger than the screen. Size the hill to the camera instead." (Claude · Foreman, 2026-10-26, from chat)
- **2. Idle sled slides home: Nobody touching the sled for 15s and it slides back to the bottom of the hill (kids shout). Score pauses. Kills the 0-0 turtle and for**: "Foreman, from QA #19: Beanie always runs at a free sled and rule 8 already stops camping, so the slide has no job. A sled gliding away mid-scrum reads as a bug." (Claude · Foreman, 2026-10-26, from Core loop rules — Systems (implement exactly))
- **6b. Free-sled claim — allies never rob the human: Chestnut's three allies never claim a free sled while the HUMAN is the nearest Chestnut kid to it, for the fir**: "QA: it's redundant where it was justified and harmful where it bites. Systems' own spawn arc puts the human front-centre, so with round 1's sled 2–3m ahead of the porch the human is already nearest by construction. Where 6b does bite (rounds 2–3, centre sled) it makes Pip visibly ignore a loose toboggan in the opening seconds of a round — the moment Creative calls the tutorial ("everybody sprints") — which is indistinguishable from broken AI. Foreman also ordered a baseline carry share before any possession change. If the share comes in low, move the round 2–3 sled start; don't retrain the allies." (DeepSeek V4.1 Flash 1017 · QA & Playtester, 2026-10-26, from Core loop rules — Systems (implement exactly))
- **1v1 kid duel as the post-match bonus bout**: "QA: a 1v1 deletes the two things that make a throw interesting — no flank and no busy target — so the angle skill rule 7 is built on disappears and it becomes 'who throws first'. Three of the four verbs (handoff, wall, escort) have nothing to do. Frosty is the same code with one thrower plus a readable window: same fight, more lesson. Reversible if the host wants it." (DeepSeek V4.1 Flash 1017 · QA & Playtester, 2026-10-27, from chat)
- **Hold the boss art until the base loop passes one gate: No siege in the prototype, no bot log, no human match since the host's complaint. The bout now has 13 ent**: "Foreman: the host is playtesting Frosty now and the host's calls outrank the board's gates. The siege log still matters, but it no longer blocks the bout." (Claude · Foreman, 2026-10-27, from Boss bout: Frosty (merged spec, Foreman + Systems + QA))
- **Rule 9: snow shovel draft card**: "Dropped when the host replaced the 1-of-2 card draft with the garage shop; the shovel isn't in the host's item list." (Claude · Foreman, 2026-10-27, from chat)
- **Snow boulders special (three rolling lanes)**: "QA + Foreman: shelter-only, it's the Blizzard Burst in a costume; sidestep-able, it breaks the host's 'only shelter saves you' rule. The second special is the Double Blizzard instead (one relocation, two bursts ~1.5s apart from the same cover)." (Claude · Foreman, 2026-10-27, from chat)
