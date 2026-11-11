# After Hours in Godot

The night desk (stage 1) as a first-person game, built with Godot 4.7 and C#. The web game in the
repository root is unchanged; this folder is a separate project.

## Running it

1. Install **Godot 4.7.2 (.NET)** from godotengine.org and the **.NET SDK**, version 8 or newer (9 works).
2. Open Godot, choose *Import*, and select `godot/project.godot`.
3. Press **F5**. The first run builds the C# code.

## Controls

| | |
|---|---|
| Walk / look | WASD (or arrows) / mouse |
| Use what the crosshair is on | Left click or E |
| Bend a clip at the hand bender | B (or click the lever) |
| Send the trial run / pack a carton | Space (or click the envelope / open carton) |
| The terminal: orders, upgrades, files | Tab or T (or click the monitor) |
| Free a snag / grab a speed burst | F / C (or click the machine / the glint on the wire) |
| Answer the courier or the hot machine | 1 / 2 |
| Free the mouse | Esc |

The spare coil is in the filing cabinet's bottom drawer; the courier calls on the desk phone.

## How it is put together

- `sim/` is the night's rules in plain C# with no Godot dependency: a line-for-line port of the web
  game's `src/game/chapters/c01.ts`, reading the same numbers (`data/campaign.json`, a copy of
  `src/content/campaign.json`). `Autopilot.cs` holds the two simulated players.
- `game/` is the presentation: `OfficeRoom.cs` builds the room, the city and the lighting in code,
  `Player.cs` is the first-person controller, `Hud.cs` the interface, and `Main.cs` runs the night's
  fixed 100 ms clock and connects everything. `shaders/city.gdshader` draws the city's windows.

## Tests

```
cd godot/tests && dotnet test
```

The port must play exactly like the web game. `tests/fixtures/office-parity.json` records both
simulated players' nights in the web game (every caption and sound, to the millisecond, and the final
result); the C# tests replay them and must match. The web game checks the same record in
`src/game/godotParity.test.ts`. After an intended rules change in the web game, rewrite the record with
`UPDATE_PARITY=1 npx vitest run src/game/godotParity.test.ts` and update the port until both pass.
When `src/content/campaign.json` changes, copy it to `godot/data/`; a test checks they match.

## Screenshots without opening the editor

```
godot --path godot -- --shot=out.png --at=machine --look=0.05,-0.55 --pos=0.2,-0.95
```

plays the night with the engaged simulated player up to a point (`start`, `dark`, `machine`, `mid`,
`late`, `done`), places the camera (yaw and pitch in radians, position x,z in metres), saves a
screenshot and quits. `--off=fog,rain,moon,city,glow,ssao` turns parts of the scene off to track down
rendering problems.
