# After Hours in Godot

The night desk (stage 1) as a first-person game, built with Godot 4.7 and C#. The web game in the
repository root is unchanged; this folder is a separate project.

## Running it

1. Install **Godot 4.7.2 (.NET)** from godotengine.org and the **.NET SDK**, version 8 or newer (9 works).
2. Open Godot, choose *Import*, and select `godot/project.godot`.
3. Press **F5**. The first run builds the C# code.

## Playing

The night starts at the title screen: **Continue the night** picks up the saved night, **New night** starts over.
The night saves itself every 20 seconds, after every carton and install, and when you pause or quit.

| | |
|---|---|
| Walk / look | WASD (or arrows) / mouse |
| Use what the crosshair is on | Left click or E |
| Pause, settings, save and quit | Esc |
| The terminal: orders, upgrades, files | Tab or T (or click the monitor) |
| Send the trial run / pack a carton | Space (or click the envelope / open carton) |
| Free a snag / grab a speed burst | F / C (or click the machine / the glint on the wire) |
| Answer the courier or the hot machine | 1 / 2 |

**Making clips by hand** takes four steps at the hand bender:

1. Click the **coil of wire** on the desk to pull off a length (enough for ten clips). You hold it in your hand.
2. Click the **bender** to feed the wire in.
3. **Hold the mouse button on the bender and drag down** to pull the lever. Each pull bends a pair of clips.
4. Click again to **snip** them off with the red cutter. They drop into the tray.

**B** does the next step for you when you are standing at the bender.

**Upgrades** are bought at the terminal and build themselves where they go: a beam from the screen, sparks, and the
part fading in until it is installed. The spare coil is in the filing cabinet's bottom drawer, which opens when the
wire runs low; the courier calls on the desk phone.

**Settings** (Esc): mouse sensitivity, brightness, volume (overall, effects, rain and room), 3D resolution,
graphics quality, full screen, inverted mouse look. They are kept in Godot's user folder with the save.

## How it is put together

- `sim/` is the night's rules in plain C# with no Godot dependency: a line-for-line port of the web
  game's `src/game/chapters/c01.ts`, reading the same numbers (`data/campaign.json`, a copy of
  `src/content/campaign.json`). `Autopilot.cs` holds the two simulated players.
- `game/` is the presentation, all built in code: the room is `OfficeRoom.cs` (light and air) with `Room.cs`
  (walls, window, furniture), `Desk.cs` (terminal, lamp, phone), `Workbench.cs` (the hand bender, tray and
  cartons), `Machines.cs` (clip machines and upgrades) and `Outside.cs` (the city). `Build.cs` makes the
  rounded meshes and surface materials. `HandWork.cs` and `Player.cs` are the hands and the first-person
  controller, `Hud.cs` and `Menu.cs` the interface, `Sfx.cs` synthesizes every sound and `Audio.cs` plays
  them, `Settings.cs` holds the settings and the save file, and `Main.cs` runs the night's fixed 100 ms clock
  and connects everything. `shaders/` draws the city's windows and the terminal's glass.

## Tests

```
cd godot/tests && dotnet test
godot --headless --path godot -- --selftest
```

The second runs the game itself without a window and checks its flows: making clips by hand step by step, the
trial run, the lamp, buying and installing an upgrade, saving and loading, the title and pause menus, the
settings, and a whole night through the shift report.

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

plays the night with the engaged simulated player up to a point (`start`, `dark`, `install`, `machine`,
`mid`, `late`, `done`), places the camera (yaw and pitch in radians, position x,z in metres), optionally sets
what is in hand (`--hands=held,loaded,bent` as numbers: clips' worth of wire in hand, clips' worth fed into the
bender, and 1 if a pair is bent and waiting, e.g. `--hands=10,0,0` or `--hands=0,8,1`) or opens the terminal
(`--terminal`), saves a screenshot and quits. The lamp and the overhead light are put straight where the night
has them, so a shot never catches them halfway. Options it cannot read end the run with a message (exit code 2).
`--off=fog,rain,moon,city,glow,ssao,probe` turns parts of the scene off to track down rendering problems.
