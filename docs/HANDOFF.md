# Handoff: where the project stands

For a new session picking this up. Work happens on branch `claude/creative-project-implementation-av6jz7`.

## Two versions of the game

- **The web game** (repo root, React + TypeScript + Vite): stages 1 and 2 of After Hours, then a demo end screen.
  The rules live in `src/game` (a deterministic 100 ms step engine with an exact clip/wire ledger), stage 1 is
  `src/game/chapters/c01.ts`, numbers in `src/content/campaign.json`. `npm test` runs 52 tests. A published build
  is at https://claude.ai/artifact/AeWMtigq6n3Zthx9pNwxDb.
- **The Godot version** (`godot/`, Godot 4.7.2 .NET, C#): stage 1 as a first-person game. This is where the work is
  going. Read `godot/README.md` for how to run it, the controls and the layout of the code.

## The Godot version

- `godot/sim/` is stage 1's rules ported line for line to C#. It must play exactly like the web game: both test
  suites check a recorded run of two simulated players (`godot/tests/fixtures/office-parity.json`). Change rules
  in the web game first, re-record (`UPDATE_PARITY=1 npx vitest run src/game/godotParity.test.ts`), then port.
- `godot/game/` builds everything in code: the room, models, materials, lighting, sound (synthesized at startup),
  the interface and menus. There are no imported assets yet, because the asset sites were unreachable from the
  cloud environment.
- Checks: `cd godot/tests && dotnet test` (rules, saving) and `godot --headless --path godot -- --selftest`
  (22 checks of the game's own flows). `godot --path godot -- --shot=out.png --at=machine --look=0.05,-0.55
  --pos=0.2,-0.95` renders a screenshot at a point in the night (see the README for all options).

## What the player asked for, and the latest feedback

The aim is a moody, first-person optimization game in the spirit of Schedule 1 and Find the Needle: hands-on
work (wire from the coil, feed the bender, pull the lever, snip), upgrades bought at the terminal that appear in
the room, a dark rainy city outside, sound, saving and settings. All of that exists now.

Latest feedback: "a big step in the right direction, but every aspect is still falling short". The previous
session could only see slow software-rendered stills and could not hear the sound or feel the controls. The
next steps it proposed:

1. Play and screenshot the game on the player's own machine (computer use in the Claude desktop app).
2. Use real CC0 assets (Poly Haven textures and HDRIs, Kenney models and sounds) instead of models built in code.
3. Add a playtest recorder: time per step, what was looked at but not used, stalls, an F12 screenshot with a note.
4. Ask the player for the single worst thing in each area (controls, the hand-work loop, looks, sound, pacing)
   and for reference images of what "good" looks like to them.

## Conventions

- Commit messages end with the co-author and session trailers used throughout the history.
- Plain, concrete language in player-facing text; no model names in code or docs.
- Keep `godot/data/campaign.json` identical to `src/content/campaign.json` (a test checks it).
