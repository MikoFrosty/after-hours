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

## Pass 4 · 2026-10-01 13:10 UTC · chapter 2

**How it was checked.** Played chapter 2 in real time at 1× in a headless browser the way a person would (accept each inspection, spend each permit on the first upgrade offered), screenshots every ~50 s at 1440 and 390 px, plus seeded heat states.

**A correction to last pass's review.** "Heat never matters" was wrong for a human player. The simulated player happens to buy roof cooling second, so it never overheats; a person who buys the wire draw and then the freight scheduler (the order the panel lists them) reaches 77 heat and throttles to 25% during the third contract. Recovery from 80 to 50 then takes about 100 s while still running, or about 37 s with production stopped, and the only place that said so was the Heat card at the bottom of the panel. So heat does work as a constraint; what was missing was telling the player.

**Changed**
- *Heat said where the player is looking.* Under the throughput line in the Contracts card: when heat is rising toward the throttle, "Heat 62 and rising: the plant throttles to 25% in about 15 s at this rate" (shown only within two minutes of it); once throttled, "Throttled to 25% until heat falls to 50: about 101 s running, about 37 s with production stopped. Roof cooling would keep it from happening again." This turns the throttle from a mystery slowdown into a choice (ride it out, stop and cool, or plan the cooling permit next time), which is the chapter's lesson.
- *Phone records bar.* At 390 px the bottom bar (Log, Ledger, Office, Checkpoints, Settings) scrolled sideways and Settings started off-screen from chapter 2 on. Tighter spacing on phones now fits all five. Shared by chapters 2–8; layout only.

**Numbers.** Chapter 2 unchanged by this pass (relaxed 165 s, engaged 126 s simulated). 44 tests pass; no page errors at either width.

**Considered and rejected**
- Changing heat gain or contract sizes so the simulated players also throttle: that is proposal A from pass 3 and is the owner's call.
- Adding an automatic "stop to cool" suggestion button: the existing Stop production button sits right beside the new note.

**For the morning**
- Proposal A (make heat a real limit) should be read with this correction: heat already bites for players who skip cooling, so A could be lighter than first described, e.g. only making the courtyard-vs-direct and cooling choices matter on every route.

## Pass 5 · 2026-10-01 14:10 UTC · chapter 2

**Focus.** The chapter's one real decision each contract is which upgrade to buy with the permit. The manifesto's lesson is "diagnose the pipeline rather than buy the largest number," but each permit row only described its own station ("Drawing rate 1 → 4"), so a player could spend a permit on the freight scheduler and gain nothing without ever learning why.

**Changed**
- *Each permit row says what it does to the whole plant*: throughput before and after (only the slowest station counts, so "Freight scheduler: throughput stays 0.85 (not the slowest station)" when drawing is the limit), and the heat balance it leads to ("runs cool → heat +0.56/s"). Speed and heat are now visibly the same trade, so roof cooling reads as an answer to a problem the player can see coming.
- *The contract shows time remaining*: "0.7 / 80" and "About 94 s to go at the current rate" under the bar.

Checked at 1440 and 390 px after the first inspection with a permit waiting.

**Numbers.** Chapter 2 unchanged by this pass (relaxed 165 s, engaged 126 s simulated). 44 tests pass; no page errors at either width.

**Considered and rejected**
- Removing the "bottleneck" label so the new rows carry the diagnosis alone (proposal C): that changes how the chapter teaches and is for the owner to decide. With these rows, C would now be easy and safe to do: the player could still find the slowest station from what each permit predicts.
- Showing the countdown in real seconds at 4×: it counts simulated seconds, which is what the contract and the throughput are measured in.

**For the morning**
- No new decisions; proposals A–D from pass 3 still stand, and C has become cheaper (see above).

## Pass 6 · 2026-10-01 15:10 UTC · chapter 2

**Focus.** The inspection after each contract is the chapter's recurring beat (it pauses the plant and awards the permit), but it said the same sentence every time, so it carried no information into the next decision.

**Changed**
- *The inspection is a short report on the contract just delivered*: how long it took, its peak heat, how long the plant ran throttled at 25%, and the size of the next contract. Its advice follows what happened: if the plant throttled, it says so and points at the permit rows' heat figures; otherwise it suggests spending where the plant is slowest. The third inspection keeps the original line about permits never spending material.
- The plant now records each contract's start time, peak heat and throttled time for this report (new optional fields; saves from before simply report from the chapter's start).

Checked in the browser at 1440 px (second inspection: 47 s, peak heat 26, no throttling, next contract 120 units). A new test checks the first inspection's report.

**Numbers.** Chapter 2 unchanged (relaxed 165 s, engaged 126 s simulated). 45 tests pass; no page errors.

**Considered and rejected**
- A per-contract grade or star rating: the game deliberately has no grades (the ending says so), and a score would push toward optimizing rather than diagnosing.

**For the morning**
- No new decisions. Two passes remain tonight; they will stay on chapter 2 polish (likely the mobile schematic's small labels and chapter 2's sound against the spec) unless something more urgent turns up.

## Pass 7 · 2026-10-01 16:10 UTC · chapter 2

**Focus.** The "Clearing the 11th floor" card only offered destruction ("Send to the line…" three times). A player who had already decided to keep the old office had no way to say so; the card sat above Route and Stations for the whole chapter, re-offering the cabinet, lamp and frame on every glance.

**Changed**
- *"Keep them all"* at the foot of the clearing card. It folds the card to one line ("The old office comes along whole: cabinet, lamp, frame." with *Reconsider*), logs the decision once, and leaves the offer open until the third contract as before. Nothing is lost by keeping; reconsidering brings the full card back.
- *Permit rows:* Roof cooling read "runs cool → runs cool" when the plant was already cool; the arrow now appears only when the heat outcome actually changes (a flaw in pass 5's wording).

Checked at 1440 and 390 px: keep, the folded line, reconsider, and the card returning. A new test covers keep/reconsider and that salvage still works after reconsidering.

**Numbers.** Chapter 2 unchanged (relaxed 165 s, engaged 126 s simulated). 46 tests pass; no page errors.

**Considered and rejected**
- Hiding the clearing card automatically after the first contract: that would quietly make the decision for the player.
- Enlarging the schematic's labels on phones with a CSS override: at 390 px the larger labels overlap the nodes, and the Stations card in the panel already carries the same numbers legibly. Left for a proper narrow-screen schematic layout if wanted.

**For the morning**
- No new decisions. One pass remains tonight (17:06 UTC); it will be the eighth and will switch the routine off.
