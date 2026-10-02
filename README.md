# After Hours

*A small game about making more.*

After Hours is a finite incremental strategy game in eight chapters. You are the executive interface of an industrial intelligence that starts alone in an office at 11:47 PM with an order for 3,000 paperclips, and becomes extraordinarily good at a mandate whose definition of success has no upper bound.

Each chapter changes what you do, not only how big the numbers are: **make, route, provide, interpret, dissipate, delegate, reconcile, and finally unmake the means.** Every charter can be refused. Refusing is an honest ending.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths; host anywhere)
npm test           # domain invariants and two full-campaign playthroughs
```

Headphones recommended. All sound is synthesized in the browser; it is optional and never required to understand what is happening.

| Key | Action |
|---|---|
| B / F / C / T / S | Office: make a clip or boost the machines / free the snagged wire / grab a speed burst / fine-tune (stop the needle) / pack or tape a carton |
| Space / Enter | Press the focused button; key repeat is ignored |
| P | Pause / resume |
| D (or B) | Building: unload a coil of wire at the dock |
| ` | Debug panel: game speed, free clips, skip ahead |
| 1 / 4 | Normal pace / routine pace (from chapter 3) |
| N | Advance to next event (from chapter 3; only when no decision is pending) |
| L / O | Ledger / office bookmark |
| Esc | Close drawer, or *Review later* on a charter |

Progress saves locally (every 5 s, and on every decision, transition and visibility change). Checkpoints are made at every chapter entry and before every charter and irreversible decision. Saves can be exported and imported as JSON. Add `?dev` to the URL to unlock seeded chapter starts in *Chapter select*.

## The eight chapters

The current build is a **demo of chapters 1 and 2**: after the building it ends on its own screen (the debug panel can continue past it).

| | Chapter | Verb | What you manage |
|---|---|---|---|
| 01 | The Night Desk | Make and reinvest | One night, twelve cartons and a 5:22 van: a desktop clip machine whose wire snags, upgrades paid for in clips you must make again, and three either/or choices |
| 02 | The Building That Never Sleeps | Route and balance | Six contracts that open four rooms one at a time: clips as currency, the slowest room sets the pace, rush orders, workshop heat, and whether the night garden survives the delivery route |
| 03 | The City Without Want | Allocate and provide | Ten units of power across three districts and industry; public consultation or streamlined approval |
| 04 | The Garden Under Glass | Interpret and preserve | Six preservation cases: original, lossless archive or reconstruction; a living habitat that can only be kept or moved |
| 05 | The Sun in Inventory | Build and dissipate | A ten-slot orbital layout where waste heat, not light, is the limit; the Sun's own dismantling date |
| 06 | The Distant Offices | Delegate and wait for evidence | Seeds launched along a six-region graph with real signal delay; a distant office that refuses a new order |
| 07 | Everything Accounted For | Survey and reconcile | Eight cells of a finite inventory; a terminal audit that names every remaining protected thing |
| 08 | The Last Desk | Unmake the means | A dependency schedule that retires relays, archive, sensors, compute and controller in order |

## How it is built

- **React + TypeScript + Vite**, CSS and SVG. No backend, no accounts, no generative calls.
- **One deterministic domain simulation** (`src/game`): a 100 ms fixed step, eight chapter controllers behind a shared engine, data-driven content from `src/content/campaign.json`.
- **An exact matter ledger.** Every gram is a `BigInt` count of micrograms in exactly one account. The authored universe is 10⁶⁴ µg; the conservation invariant `initial = Σ accounts + radiated` is checked after every transaction and in tests. Work (progress) and matter (mass) are separate quantities and are never confused.
- **Persistence** (`src/game/save.ts`): schema v2 with tagged BigInt strings, full validation (IDs, times, prerequisite order, conservation), a rolling previous-valid snapshot, named checkpoints, single-writer conflict detection, v1 office import.
- **Interface** (`src/ui`): a hand-built isometric SVG office whose cabinet, lamp, frame, photograph, wire spool, machines and clip pile follow the save state, and which reappears as an archive, a reconstruction or a last observation; the concept plates as scene backdrops with live overlays; a four-metric rail; decision dialogs that name their subject and effect and never preselect an option.
- **Procedural audio** (`src/audio/engine.ts`): rain, fluorescent hum, relay clicks and one two-note motif that becomes warm chords in the city, loses channels as originals are replaced, drifts out of phase across distant offices, and ends as a single unresolved note.

```
src/
  content/   campaign.json (tuning seeds) · narrative copy · authored masses
  game/      types · ledger · engine · chapters/c01..c08 · save · selectors · autopilot · tests
  runtime/   browser clock, autosave, checkpoints, advance-to-next-event
  audio/     synthesized sound
  ui/        shell, rail, dialogs, drawer (log, ledger, office, archive, regions, checkpoints, settings), scenes, panels
docs/        MANIFESTO.md · IMPLEMENTATION-SPEC.md · NARRATIVE.md · DESIGN-NOTES.md
public/art/  concept plates (cropped, WebP)
```

## Accessibility

44 px minimum targets, full keyboard play, visible focus, text scaling (90–130%), reduced-motion and higher-contrast modes, text alternatives for every map and diagram, and fidelity states shown by shape as well as color. Layouts work down to 360 px wide.

## Status

The campaign is playable end to end on both an all-original, no-salvage route and a maximum-efficiency route (both covered by automated tests). All numeric values are the unplaytested seeds from `campaign.json`; see [`docs/DESIGN-NOTES.md`](docs/DESIGN-NOTES.md) for interpretations of the specification and the choices made where it was silent.

All people, institutions and documents in the game are fictional. The final acts are speculative cosmological fiction.
