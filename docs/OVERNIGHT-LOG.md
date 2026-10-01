# Overnight log

Hourly improvement passes on chapter 1, *The Night Desk*, run while the owner is away. Each entry records what changed and why, before/after numbers, what was considered and rejected, and anything to decide in the morning. The routine stops itself after eight passes.

## Pass 1 · 2026-10-01 10:10 UTC · chapter 1

**How it was checked.** Besides the simulated players, this pass played the opening 100 seconds in real time in a headless browser (about four presses a second, buying what was ready, catching the true wire), at 1440 px and 390 px, with screenshots every few seconds. That shows what the simulations can't: what the screen says while you are actually pressing.

**Changed**
- *The top bar said "Filling cartons" for the first minutes*, before any carton or packer existed. It now names what the clip count is working toward ("Working toward wire feeder"), the same unlock the Next line counts down to.
- *Tending floaters read "+1%"* once the meter was nearly full, which looked like a bug. They now show only a meaningful rise (+3% or more); a topped-up meter says so by glowing.
- *Floaters drifted up over the alert slot and then over the button label.* They now rise from the lower right of the button and stay inside it, clear of the label at both widths.

**Numbers** (unchanged; UI only): relaxed 20.6 min with 9 cartons on the van, engaged 15.8 min with all 12. 43 tests pass; no page errors at either width.

**Considered and rejected**
- Rate-limiting the S key's "A carton needs 250 clips" message on stray presses: the message is accurate and brief.
- Making tending harder to hold for very fast clickers (a four-presses-a-second player keeps the meter full): "any clicking speed" was the owner's call, so it stays.

**For the morning**
- Nothing to decide from this pass.

## Pass 2 · 2026-10-01 11:10 UTC · chapter 1

**How it was checked.** Seeded the night to mid-shift with the relaxed simulated player (jig with three stations, the finish choice open), then played a minute by hand in a headless browser at 1440 and 390 px; a second run seeded to the moment the die wore a level.

**Changed**
- *Die wear was invisible from the dock.* Losing a tuning level only played a sound and changed a card further down the panel, so a player watching the bench would just lose output without knowing why. The dock's alert slot now says "The die has worn a level." for twelve seconds, with a one-press *Retune · 20 s* (the gauge's T key works too).
- *Two ways to seal once the packer was in.* "Seal · 250" still taped up desk clips while the packer's own carton sat half full, so the carton strip jumped around and the reserve meant little. After the packer, the button now shows the packer's fill ("Packing · 99/250") and only tapes the packer's full carton; before the packer, sealing from the desk works as before.
- *Finishing with a reserve set.* When nothing is left to buy but the packer is still holding clips back, the Next line now says to lower the reserve so the desk gets packed (otherwise a player could sit waiting with a full desk).

**Numbers** (unchanged): relaxed 20.6 min with 9 cartons on the van, engaged 15.8 min with 12. 43 tests pass (the packer and wear tests now also cover these); no page errors at either width.

**Considered and rejected**
- Auto-retuning after wear as part of the governor: it would quietly undo the speed trade-off that made line speed a decision.
- Moving the tuning gauge into the dock: the dock is already the tallest it should be on phones.

**For the morning**
- Nothing to decide. Chapter 1 has no known bugs left after this pass; the next pass will re-check it once and, if it holds, start the chapter 2 review.

## Pass 3 · 2026-10-01 12:10 UTC · chapter 1 re-check, chapter 2 review begins

**Chapter 1 re-check.** Seeded to the last carton and played the end by hand: final seal, the six quiet seconds, the shift report with the van counts. It holds. One leftover fixed: after the last carton the dock's alert slot kept counting down a clean run behind the report; it now simply says the order is complete and the machines are off. **Chapter 1 is in a good spot**: no known bugs and no clarity or feel problems left that I would ship a fix for. From here, passes work on chapter 2.

### Chapter 2 review (as a player experiences it)

Measured with both simulated players at 1× and looked at in the browser at 1440 and 390 px.

1. **It is far too short.** About 2¾ minutes for a relaxed player and 2 for an engaged one, against the spec's 8–15. After a 20-minute night, the building flashes past.
2. **Heat never matters.** Peak heat was 26 and 32 out of 100; the throttle at 80 never triggers on either route, so the chapter's "cooling and delivery capacity constrain a fast machine" never happens. With the natural upgrade order the plant runs cool before it could ever get hot.
3. **There is almost nothing to decide or do.** Three permits buy the three upgrades in nearly any order, and the bottleneck is labelled for you, so "diagnose the pipeline" is solved before it is posed. Between contracts the player only watches a bar.
4. **The 11th-floor clearing was too generous (fixed this pass).** Sending all three office items gave +42 work, which completed the 40-unit first contract on arrival. Now +2/+4/+8: a head start, never the contract.
5. **The permits were the last card on the panel**, below the fold on desktop and far down on phones, though spending them is the chapter's main decision (fixed this pass: right under Contracts, highlighted when one is waiting).
6. **Schematic labels collided** ("direct ×1.00 (not built)" ran into the bottleneck ring; "night garden" sat on the courtyard route). Fixed this pass.
7. The handover from the night works now that captions clear on chapter change (fixed yesterday); the room's tactile verbs give way to scheduling, as the manifesto intends.
8. On phones the bottom bar (Log, Ledger, Office, Checkpoints, Settings) scrolls sideways in chapter 2 because the Office bookmark joins it. It works, but Settings starts off-screen. Left as is for now (shared across chapters 2–8).

### Changed this pass
- Chapter 1: the dock's alert slot is quiet once the order is complete.
- Chapter 2: clearing work rebalanced (+2/+4/+8 units; a test now guards that clearing the whole floor can't finish the first contract); Permits card moved under Contracts and highlighted when a permit is waiting; schematic labels moved clear of the routes and nodes.

**Numbers.** Chapter 1 unchanged (relaxed 20.6 min, engaged 15.8). Chapter 2: relaxed 165 s (unchanged), engaged 100 → 126 s (contract 1 no longer completes on arrival). 44 tests pass; no page errors at either width.

### For the morning: proposals for chapter 2 (bigger than polish, not built)
- **A. Make heat the real constraint.** Raise heat gain (or contract sizes) so a plant running the faster upgrades does reach the throttle unless cooled; the player then chooses between running hot and pausing, buying cooling early, or running the slower courtyard route cooler. Roof cooling becomes a real choice rather than a formality.
- **B. Give it the length the spec asks for (8–15 min).** More contracts with growing size and one new wrinkle each (a night noise limit that caps throughput after midnight, a rush order with a deadline and a bonus permit, a dock delivery that arrives in batches), so each contract asks a different question of the pipeline.
- **C. Hide the bottleneck until the player has looked.** Show station rates and the flow, but let the player find the slow station (it lights up once they have inspected it, or after the first contract). That restores "diagnose the pipeline."
- **D. A hands-on verb.** The night ended with a tactile ritual (sealing); the building could keep one: load the freight lift by hand until the freight scheduler is bought, or a dispatch button that ships when a pallet is full.

Unless you say otherwise, the next passes will keep to polish and clarity in chapter 2 and leave A–D for your decision.
