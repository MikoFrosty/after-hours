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
