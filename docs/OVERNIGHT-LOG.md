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
