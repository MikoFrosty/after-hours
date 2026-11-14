// The night, played in Room 1104: runs the simulation on its fixed 100 ms clock and connects it to the room,
// the player's hands, the sound, the interface, the menus and the save file.
//
// For automated checks: godot --path godot -- --shot=out.png [--at=start|dark|machine|mid|late|done]
// [--look=yaw,pitch] [--pos=x,z] [--hands=held,loaded,bent] [--terminal] [--menu=title|pause|settings] plays the night with the engaged simulated
// player up to that point, frames the view, saves a screenshot and quits.
using System;
using System.Linq;
using AfterHours.Sim;
using Godot;

namespace AfterHours.Game;

public partial class Main : Node3D
{
    OfficeConfig cfg = null!;
    Night night = null!;
    HandWork hands = new();
    OfficeRoom room = null!;
    Player player = null!;
    Hud hud = null!;
    Audio audio = null!;
    Menu menu = null!;
    Settings settings = null!;
    double acc;
    string? looking;
    bool used, playing, dragging;
    double sinceSave;
    float stepAt;

    // the screenshot harness
    string? shotPath;
    int shotFrames = -1;

    public override void _Ready()
    {
        cfg = OfficeConfig.Parse(FileAccess.GetFileAsString("res://data/campaign.json"));
        settings = Settings.Load();

        room = new OfficeRoom();
        AddChild(room);
        player = new Player();
        AddChild(player);
        audio = new Audio();
        AddChild(audio);
        hud = new Hud();
        AddChild(hud);
        hud.Command += OnCommand;
        menu = new Menu { S = settings };
        AddChild(menu);
        menu.Command += OnMenu;
        menu.SettingsChanged += ApplySettings;

        foreach (var kv in room.SoundAt) audio.At[kv.Key] = kv.Value;
        audio.Begin();
        StartNight(null);
        ApplySettings();

        if (OS.GetCmdlineUserArgs().Contains("--selftest"))
        {
            SelfTest();
            return;
        }
        if (OS.GetCmdlineUserArgs().Any(a => a.StartsWith("--shot=")))
        {
            ParseShotArgs();
            return;
        }
        // the title screen, over the room
        var save = SaveFile.Load();
        menu.ShowTitle(save != null, save?.SavedAt);
        Input.MouseMode = Input.MouseModeEnum.Visible;
    }

    /// <summary>A fresh night, or one from the save file.</summary>
    void StartNight(SaveFile? save)
    {
        if (night != null) night.OnSignal -= OnSignal;
        night = save != null ? Night.Restore(cfg, save.Night) : new Night(cfg);
        night.OnSignal += OnSignal;
        hands = new HandWork { Held = save?.Held ?? 0, Loaded = save?.Loaded ?? 0, Bent = save?.Bent ?? false, BentCount = save?.BentCount ?? 0 };
        hud.Init(night, hands);
        hud.HideReport();
        player.Position = save != null ? new Vector3(save.X, 0, save.Z) : new Vector3(0.05f, 0, -0.62f);
        player.Yaw = save?.Yaw ?? 0;
        player.Pitch = save?.Pitch ?? -0.55f;
        used = save != null;
        if (used) hud.HideHint();
        acc = 0;
    }

    void Save()
    {
        if (!playing || night.Mode == NightMode.Done) return;
        new SaveFile
        {
            Night = night.Snapshot(),
            Held = hands.Held,
            Loaded = hands.Loaded,
            Bent = hands.Bent,
            BentCount = hands.BentCount,
            X = player.Position.X,
            Z = player.Position.Z,
            Yaw = player.Yaw,
            Pitch = player.Pitch,
        }.Write();
        sinceSave = 0;
    }

    void ApplySettings()
    {
        player.Sensitivity = 0.0022f * settings.Sensitivity;
        player.InvertY = settings.InvertY;
        room.SetBrightness(settings.Brightness);
        room.SetQuality(settings.Quality);
        GetViewport().Scaling3DScale = settings.RenderScale;
        Audio.SetVolumes(settings.Master, settings.Effects, settings.Ambience);
        var fs = DisplayServer.WindowGetMode() == DisplayServer.WindowMode.Fullscreen;
        if (settings.Fullscreen != fs && shotPath == null)
            DisplayServer.WindowSetMode(settings.Fullscreen ? DisplayServer.WindowMode.Fullscreen : DisplayServer.WindowMode.Maximized);
        settings.Save();
    }

    void OnSignal(AfterHours.Sim.Signal s)
    {
        if (s.Type == "beat") hud.Caption(s.Title, s.Text);
        if (s.Type != "sound" || s.Id == "bend") return;
        audio.Play(s.Id, Audio.Place(s.Id), s.Id is "motif" or "orderComplete" or "charter" ? -6 : 0);
        if (s.Id is "tape" or "install") Save();
    }

    public override void _Process(double delta)
    {
        var running = playing && !menu.Open && shotPath == null;
        if (running)
        {
            // the night's clock: fixed steps, never more than a second of catching up
            acc = Math.Min(acc + delta * 1000, 1000);
            while (acc >= Night.StepMs)
            {
                acc -= Night.StepMs;
                night.Step();
            }
            sinceSave += delta;
            if (sinceSave > 20) Save();
        }
        if (night.ReportPending && !hud.ReportOpen && playing) ShowReport();

        looking = running || shotPath != null ? LookingAt() : null;
        var label = looking != null ? Label(looking) : null;
        hud.SetHover(dragging ? "Drag down to pull the lever" : label);
        if (!dragging) hands.Lever = Mathf.MoveToward(hands.Lever, 0, (float)delta * 5);
        player.Hold(hands.Held > 0, delta);
        room.Sync(night, hands, delta);
        hud.Sync();
        audio.Sync(room.MachineSpin(night), room.RainAmount(night), night.RackMachines, delta);
        // footsteps
        if (player.Walked - stepAt > 0.62f)
        {
            stepAt = player.Walked;
            audio.Play("step", null, -16, 0.9f + (float)GD.RandRange(0, 0.2));
        }

        if (shotPath != null && shotFrames >= 0 && --shotFrames == 0)
        {
            GetViewport().GetTexture().GetImage().SavePng(shotPath);
            GetTree().Quit();
        }
    }

    // ---------- looking and using ----------

    string? LookingAt()
    {
        if (hud.TerminalOpen || hud.ReportOpen) return null;
        var cam = player.Camera;
        var from = cam.GlobalPosition;
        var to = from - cam.GlobalTransform.Basis.Z * 2.2f;
        var q = PhysicsRayQueryParameters3D.Create(from, to, 3);
        q.Exclude = new Godot.Collections.Array<Rid> { player.GetRid() };
        var hit = GetWorld3D().DirectSpaceState.IntersectRay(q);
        if (hit.Count == 0) return null;
        var body = hit["collider"].AsGodotObject() as Node;
        return body != null && body.HasMeta("target") ? body.GetMeta("target").AsString() : null;
    }

    /// <summary>What using a thing does right now; null when it does nothing.</summary>
    string? Label(string target)
    {
        var n = night;
        var l = n.Loose;
        return target switch
        {
            "coil" => n.Capped ? null
                : n.WireGrams - hands.Loaded - (hands.Bent ? 1 : 0) - hands.Held <= 0 ? "The coil is empty"
                : hands.Held > 0 ? "You have a length of wire: feed it into the bender"
                : hands.Loaded > 0 || hands.Bent ? "The bender still has wire in it"
                : "Pull a length of wire off the coil",
            "bender" => n.Capped ? null : hands.Next switch
            {
                HandWork.Step.Snip => n.PressYield > 1 ? $"Snip them off · +{n.PressYield * HandWork.PerPull} with the pedal" : hands.BentCount > 1 ? "Snip the pair off" : "Snip the clip off",
                HandWork.Step.Bend => "Pull the lever: hold the mouse button and drag down",
                HandWork.Step.Feed => "Feed the wire into the bender",
                _ => "The bender needs wire: pull a length off the coil",
            },
            "carton" => n.Capped ? null
                : n.Trial == Trial.Open ? (l >= n.Cfg.TrialClips ? "Send the trial run" : $"The trial run needs {n.Cfg.TrialClips} clips ({l} now)")
                : n.Trial == Trial.Sent ? "Waiting to hear back about the trial"
                : l >= n.Cfg.BoxSize ? "Pack a carton of 250 (Space)" : $"A carton takes 250 clips ({l} now)",
            "machine" => n.Jammed ? "Free the snag" : n.Owns("calibrate") ? $"Clip machine · {n.MachineRate / 1000.0:0.0} clips a second" : n.Installing?.Id == "calibrate" ? "Setting it up…" : "A desktop clip machine, switched off · buy it at the terminal",
            "dark" => n.Trial == Trial.Approved ? "Turn the lamp toward it" : "Something at the dark end of the desk",
            "glint" => "Grab the speed burst",
            "monitor" => "Use the terminal",
            "phone" => "Answer the phone",
            "cabinet" => "Take the spare coil from the bottom drawer",
            _ => null,
        };
    }

    void FirstUse()
    {
        if (used) return;
        used = true;
        hud.HideHint();
    }

    void Use(string target)
    {
        FirstUse();
        switch (target)
        {
            case "coil": PullWire(); break;
            case "bender": WorkBender(false); break;
            case "carton": PackOrSend(); break;
            case "machine":
                if (night.Jammed && night.Free() == null) { }
                break;
            case "dark":
                if (night.Lift() == null) audio.Play("lampTurn", "lamp");
                break;
            case "glint": night.Catch(); break;
            case "monitor": OpenTerminal(true); break;
            case "phone":
                audio.Play("switch", "phone");
                hud.Caption("The courier", "Press 1 to give them two more cartons in the next minute, 2 to let them go.");
                break;
            case "cabinet":
                if (night.TakeSpare() == null) audio.Play("drawer", "cabinet");
                break;
        }
    }

    void PackOrSend()
    {
        var err = night.Trial == Trial.Open ? night.SendTrial() : night.Pack();
        if (err != null) hud.Refuse(err);
    }

    /// <summary>Pull a length of wire off the coil.</summary>
    void PullWire()
    {
        if (hands.Held > 0 || hands.Loaded > 0 || hands.Bent) return;
        var left = night.WireGrams;
        if (left <= 0)
        {
            hud.Refuse(night.SpareOffered ? "The coil is empty. The spare coil is in the filing cabinet's bottom drawer." : "The coil is empty.");
            return;
        }
        hands.Held = Math.Min(HandWork.Length, left);
        hands.PullT = 0;
        audio.Play("wirePull", "bender");
    }

    /// <summary>Do the bender's next step. With auto (the B key or a plain click), the lever pulls itself.</summary>
    void WorkBender(bool auto)
    {
        if (night.Capped) return;
        switch (hands.Next)
        {
            case HandWork.Step.Pull:
                if (auto) PullWire();
                else hud.Refuse("The bender needs wire: pull a length off the coil.");
                break;
            case HandWork.Step.Feed:
                hands.Loaded = hands.Held;
                hands.Held = 0;
                hands.FeedT = 0;
                audio.Play("feed", "bender");
                break;
            case HandWork.Step.Bend:
                if (auto) Bend();
                break;
            case HandWork.Step.Snip:
                Snip();
                break;
        }
    }

    void Bend()
    {
        hands.BentCount = Math.Min(HandWork.PerPull, hands.Loaded);
        hands.Loaded -= hands.BentCount;
        hands.Bent = true;
        hands.BendT = hands.Lever > 0.5f ? 1 : 0;
        hands.Lever = 0;
        audio.Play("bend", "bender");
    }

    void Snip()
    {
        var before = night.MadeClips;
        var err = night.Make();
        if (err != null)
        {
            hud.Refuse(err);
            return;
        }
        for (var i = 1; i < Math.Max(1, hands.BentCount); i++) night.Make();
        hands.Bent = false;
        hands.SnipT = 0;
        room.DropClip();
        if (hands.BentCount > 1) room.DropClip();
        audio.Play("snip", "bender");
        audio.Play("clipDrop", "tray", -4);
        var made = night.MadeClips - before;
        if (made > 0) hud.Floater(made);
    }

    void OpenTerminal(bool open)
    {
        hud.ShowTerminal(open);
        player.Frozen = open;
        Input.MouseMode = open ? Input.MouseModeEnum.Visible : Input.MouseModeEnum.Captured;
        if (open) for (var i = 0; i < 3; i++) GetTree().CreateTimer(0.05 + i * 0.07).Timeout += () => audio.Play("key", "monitor", -6);
    }

    void OnCommand(string cmd)
    {
        audio.Play("ui", null, -10);
        if (cmd == "closeTerminal") OpenTerminal(false);
        else if (cmd == "pack") PackOrSend();
        else if (cmd.StartsWith("buy:"))
        {
            var err = night.Buy(cmd[4..]);
            if (err != null) hud.Refuse(err);
            else OpenTerminal(false); // watch it arrive
        }
        else if (cmd.StartsWith("read:")) night.Read(cmd[5..]);
        else if (cmd == "lease" || cmd == "end")
        {
            night.AnswerReport(cmd == "lease");
            SaveFile.Delete();
            hud.ShowReport(
                cmd == "lease"
                    ? "You took the building lease.\n\nThis is as far as the Godot version goes for now: the building comes next."
                    : "The night ended with the order. A trial run, one carton, eleven more. The machines are quiet, and the office is as Mara left it.",
                new[] { ("Back to the title", "toTitle"), ("Quit", "quit") });
        }
        else if (cmd == "toTitle")
        {
            playing = false;
            hud.HideReport();
            menu.ShowTitle(false, null);
        }
        else if (cmd == "quit") GetTree().Quit();
    }

    void OnMenu(string cmd)
    {
        audio.Play("ui", null, -10);
        switch (cmd)
        {
            case "continue":
                StartNight(SaveFile.Load());
                Play();
                break;
            case "new":
                SaveFile.Delete();
                StartNight(null);
                Play();
                break;
            case "resume":
                Play();
                break;
            case "title":
                Save();
                playing = false;
                menu.ShowTitle(true, SaveFile.Load()?.SavedAt);
                break;
            case "quit":
                Save();
                GetTree().Quit();
                break;
        }
    }

    void Play()
    {
        playing = true;
        menu.Close();
        player.Frozen = hud.TerminalOpen || hud.ReportOpen;
        Input.MouseMode = player.Frozen ? Input.MouseModeEnum.Visible : Input.MouseModeEnum.Captured;
    }

    void Pause()
    {
        if (!playing) return;
        if (hud.TerminalOpen) OpenTerminal(false);
        Save();
        menu.ShowPause();
        player.Frozen = true;
        Input.MouseMode = Input.MouseModeEnum.Visible;
    }

    public override void _Notification(int what)
    {
        // closing the window keeps the night
        if (what == NotificationWMCloseRequest) Save();
        // losing focus pauses the night
        if (what == NotificationApplicationFocusOut && playing && !menu.Open && shotPath == null) Pause();
    }

    void ShowReport()
    {
        OpenTerminal(false);
        player.Frozen = true;
        Input.MouseMode = Input.MouseModeEnum.Visible;
        var n = night;
        var seconds = (n.Capped ? n.CappedAt : n.SimMs) / 1000.0;
        var text = $"THREE ORDERS, ONE NIGHT · GRADE {n.Grade(seconds)}\n\n"
            + $"Early cartons: {n.EarlyCartons} of 11 (the van at 5:22{(n.CourierCartons > 0 ? " and the courier" : "")})\n"
            + $"Bonus for the building: {n.VanBonus} clips\n"
            + $"Clips made: {n.MadeClips:N0} · top speed {n.SteadyRate / 1000.0:0} a second\n"
            + $"Time: {Night.FmtTime(seconds)}\n\n"
            + OfficeText.LeaseBody;
        hud.ShowReport(text, new[] { (OfficeText.LeaseAccept, "lease"), (OfficeText.LeaseDecline, "end") });
    }

    public override void _Input(InputEvent e)
    {
        // working the lever: the mouse drags it down instead of turning the view
        if (!dragging) return;
        if (e is InputEventMouseMotion m)
        {
            hands.Lever = Mathf.Clamp(hands.Lever + m.Relative.Y * 0.0065f, 0, 1);
            if (hands.Lever >= 1)
            {
                Bend();
                EndDrag();
            }
            GetViewport().SetInputAsHandled();
        }
        else if (e is InputEventMouseButton { Pressed: false, ButtonIndex: MouseButton.Left })
        {
            EndDrag();
            GetViewport().SetInputAsHandled();
        }
    }

    void EndDrag()
    {
        dragging = false;
        player.LookFrozen = false;
    }

    public override void _UnhandledInput(InputEvent e)
    {
        if (!playing || shotPath != null) return;
        if (e is InputEventKey { Pressed: true, Echo: false, PhysicalKeycode: Key.Escape })
        {
            if (menu.Open && !menu.OnTitle) Play();
            else if (hud.TerminalOpen) OpenTerminal(false);
            else if (!menu.Open) Pause();
            return;
        }
        if (menu.Open) return;
        if (e is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left })
        {
            if (Input.MouseMode != Input.MouseModeEnum.Captured && !hud.TerminalOpen && !hud.ReportOpen)
            {
                Input.MouseMode = Input.MouseModeEnum.Captured;
                return;
            }
            if (looking == "bender" && hands.Next == HandWork.Step.Bend && !night.Capped)
            {
                // start working the lever
                FirstUse();
                dragging = true;
                player.LookFrozen = true;
                return;
            }
            if (looking != null && Label(looking) != null) Use(looking);
            return;
        }
        if (e is not InputEventKey { Pressed: true, Echo: false } k) return;
        switch (k.PhysicalKeycode)
        {
            case Key.Tab:
            case Key.T:
                if (!hud.ReportOpen) OpenTerminal(!hud.TerminalOpen);
                break;
            case Key.E:
                if (looking == "bender") { FirstUse(); WorkBender(true); }
                else if (looking != null && Label(looking) != null) Use(looking);
                break;
            case Key.B:
                // the next step at the bender, when close enough to reach it
                if (player.GlobalPosition.DistanceTo(room.BenderAt) < 1.4f) { FirstUse(); WorkBender(true); }
                else hud.Refuse("Too far from the bender.");
                break;
            case Key.F: night.Free(); break;
            case Key.C: night.Catch(); break;
            case Key.Space: PackOrSend(); break;
            case Key.Key1:
                if (night.Courier?.Phase == CourierPhase.Offer) night.AnswerCourier(true);
                else if (night.Hot?.Phase == HotPhase.Offer) night.AnswerHot(true);
                break;
            case Key.Key2:
                if (night.Courier?.Phase == CourierPhase.Offer) night.AnswerCourier(false);
                else if (night.Hot?.Phase == HotPhase.Offer) night.AnswerHot(false);
                break;
        }
    }

    // ---------- a self-test of the game's own flows (godot --headless --path godot -- --selftest) ----------

    void SelfTest()
    {
        var failures = 0;
        void Check(bool ok, string what)
        {
            GD.Print($"{(ok ? "PASS" : "FAIL")}  {what}");
            if (!ok) failures++;
        }
        void Steps(int n)
        {
            for (var i = 0; i < n; i++) night.Step();
        }
        playing = true;
        shotPath = "selftest";
        SaveFile.Delete();
        StartNight(null);

        // making clips by hand: wire, feed, bend, snip
        Check(Label("bender")!.Contains("needs wire"), "the bender asks for wire first");
        Use("coil");
        Check(hands.Held == HandWork.Length, "pulling wire off the coil puts a length in hand");
        Use("coil");
        Check(hands.Held == HandWork.Length, "a second pull is refused while holding wire");
        Use("bender");
        Check(hands.Held == 0 && hands.Loaded == HandWork.Length, "feeding moves the wire into the bender");
        Use("bender");
        Check(hands.Loaded == HandWork.Length && !hands.Bent, "a plain click does not bend: the lever has to be pulled");
        WorkBender(true);
        Check(hands.Bent && hands.Loaded == HandWork.Length - HandWork.PerPull, "pulling the lever bends a pair of clips from the fed wire");
        var wireBefore = night.WireGrams;
        Use("bender");
        Check(night.MadeClips == 2 && !hands.Bent && night.WireGrams == wireBefore - 2, "snipping makes the pair, a gram of wire each");
        // the rest of the trial run, by hand
        var guard = 0;
        while (night.Loose < cfg.TrialClips && guard++ < 1000)
        {
            if (hands.Next == HandWork.Step.Pull) Use("coil");
            WorkBender(true);
        }
        Check(night.Loose == cfg.TrialClips, $"the trial run's {cfg.TrialClips} clips can be made by hand ({night.Loose})");
        PackOrSend();
        Check(night.Trial == Trial.Sent, "the envelope sends the trial run");
        Steps(130);
        Check(night.Trial == Trial.Approved, "the trial run is approved");
        Check(Label("dark") == "Turn the lamp toward it", "the dark end of the desk can be lit");
        Use("dark");
        Check(night.Uncovered, "turning the lamp reveals the machine");
        while (night.Loose < 100 && guard++ < 3000)
        {
            if (hands.Next == HandWork.Step.Pull) Use("coil");
            WorkBender(true);
        }
        OnCommand("buy:calibrate");
        Check(night.Installing?.Id == "calibrate", "buying at the terminal starts the install");
        Steps(80);
        Check(night.Owns("calibrate") && night.MachineRate > 0, "the clip machine runs once installed");

        // saving and loading
        Save();
        var before = System.Text.Json.JsonSerializer.Serialize(night.Snapshot());
        var heldBefore = (hands.Held, hands.Loaded, hands.Bent);
        StartNight(SaveFile.Load());
        Check(System.Text.Json.JsonSerializer.Serialize(night.Snapshot()) == before, "a saved night loads exactly as it was");
        Check((hands.Held, hands.Loaded, hands.Bent) == heldBefore, "what was in hand and in the bender is saved too");
        OnMenu("title");
        Check(menu.OnTitle, "saving and returning shows the title");
        OnMenu("continue");
        Check(playing && !menu.Open && System.Text.Json.JsonSerializer.Serialize(night.Snapshot()) == before, "continue resumes the same night");
        OnMenu("new");
        Check(night.MadeClips == 0 && !SaveFile.Exists, "a new night starts fresh and clears the old save");

        // settings
        settings.Brightness = 1.4f;
        settings.Quality = 1;
        ApplySettings();
        var reread = Settings.Load();
        Check(Math.Abs(reread.Brightness - 1.4f) < 0.001f && reread.Quality == 1, "settings are kept");
        settings.Brightness = 1;
        settings.Quality = 2;
        ApplySettings();

        // a whole night with the simulated player, through the report
        var ap = new Autopilot(engaged: true);
        for (var i = 0; i < 200_000 && !night.ReportPending; i++)
        {
            ap.Act(night);
            night.Step();
        }
        Check(night.ReportPending && night.Sealed == Night.Cartons, "the night reaches the shift report");
        OnCommand("lease");
        Check(night.Mode == NightMode.Done && !SaveFile.Exists, "taking the lease ends the night and clears the save");
        SaveFile.Delete();
        GD.Print(failures == 0 ? "SELFTEST OK" : $"SELFTEST FAILED: {failures}");
        GetTree().Quit(failures == 0 ? 0 : 1);
    }

    // ---------- screenshots for automated checks ----------

    void ParseShotArgs()
    {
        // a mistyped option must end the run with a message, not leave a window waiting with nothing to do
        try { ParseShotArgsOrThrow(); }
        catch (Exception e) when (e is FormatException or IndexOutOfRangeException)
        {
            GD.PrintErr($"Screenshot options not understood ({e.Message}). Expected --look=yaw,pitch --pos=x,z --hands=held,loaded,bent as numbers, e.g. --hands=10,0,0");
            shotPath = null;
            GetTree().Quit(2);
        }
    }

    void ParseShotArgsOrThrow()
    {
        var args = OS.GetCmdlineUserArgs();
        static float F(string s) => float.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
        static int I(string s) => int.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
        string? Arg(string name) => args.FirstOrDefault(a => a.StartsWith($"--{name}="))?.Split('=', 2)[1];
        shotPath = Arg("shot");
        if (shotPath == null) return;
        var at = Arg("at") ?? "start";
        var ap = new Autopilot(engaged: true);
        Func<bool> done = at switch
        {
            "dark" => () => night.SheetReady,
            "install" => () => night.Installing?.Id == "oil" && night.Installing.Ms > 1500,
            "machine" => () => night.Owns("calibrate") && night.Owns("oil"),
            "mid" => () => night.Owns("die2") && night.Sealed >= 3,
            "late" => () => night.Owns("station6"),
            "done" => () => night.Capped,
            _ => () => true,
        };
        for (var i = 0; i < 200_000 && !done(); i++)
        {
            if (night.ReportPending) break;
            ap.Act(night);
            night.Step();
        }
        if (Arg("look") is string look)
        {
            var p = look.Split(',').Select(F).ToArray();
            player.Yaw = p[0];
            player.Pitch = p[1];
        }
        if (Arg("pos") is string pos)
        {
            var p = pos.Split(',').Select(F).ToArray();
            player.Position = new Vector3(p[0], 0, p[1]);
        }
        if (Arg("hands") is string h)
        {
            var p = h.Split(',').Select(I).ToArray();
            hands.Held = p[0];
            hands.Loaded = p[1];
            hands.Bent = p.Length > 2 && p[2] == 1;
            hands.BentCount = hands.Bent ? 2 : 0;
            hands.FeedT = 1;
        }
        playing = true;
        Input.MouseMode = Input.MouseModeEnum.Visible;
        hud.HideHint();
        if (args.Contains("--terminal")) hud.ShowTerminal(true);
        if (Arg("menu") is string m)
        {
            if (m == "title") menu.ShowTitle(true, "today");
            else if (m == "pause") menu.ShowPause();
            else menu.ShowSettings();
        }
        // the lamp and the overhead light ease toward where the night says they should be: put them there, so a
        // screenshot never catches them halfway
        room.Settle(night);
        shotFrames = 30;
    }
}
