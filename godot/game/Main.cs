// The night, played in Room 1104: runs the simulation on its fixed 100 ms clock and connects it to the room,
// the player and the interface.
//
// For automated checks: godot --path godot -- --shot=out.png [--at=start|dark|machine|mid|late|done] [--look=yaw,pitch] [--pos=x,z]
// plays the night with the engaged simulated player up to that point, frames the view, saves a screenshot and quits.
using System;
using System.Linq;
using AfterHours.Sim;
using Godot;

namespace AfterHours.Game;

public partial class Main : Node3D
{
    Night night = null!;
    OfficeRoom room = null!;
    Player player = null!;
    Hud hud = null!;
    double acc;
    string? looking;
    bool used;

    // the screenshot harness
    string? shotPath;
    int shotFrames = -1;

    public override void _Ready()
    {
        var cfg = OfficeConfig.Parse(FileAccess.GetFileAsString("res://data/campaign.json"));
        night = new Night(cfg);
        night.OnSignal += OnSignal;

        room = new OfficeRoom();
        AddChild(room);
        player = new Player { Position = new Vector3(0.0f, 0, -0.45f) };
        AddChild(player);
        hud = new Hud();
        hud.Init(night);
        AddChild(hud);
        hud.Command += OnCommand;

        Input.MouseMode = Input.MouseModeEnum.Captured;
        ParseShotArgs();
    }

    void OnSignal(AfterHours.Sim.Signal s)
    {
        if (s.Type == "beat") hud.Caption(s.Title, s.Text);
    }

    public override void _Process(double delta)
    {
        if (shotPath == null)
        {
            // the night's clock: fixed steps, never more than a second of catching up
            acc = Math.Min(acc + delta * 1000, 1000);
            while (acc >= Night.StepMs)
            {
                acc -= Night.StepMs;
                night.Step();
            }
        }
        if (night.ReportPending && !hud.ReportOpen) ShowReport();

        looking = LookingAt();
        hud.SetHover(looking != null ? Label(looking) : null);
        room.Sync(night, delta);
        hud.Sync();

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
            "press" => n.Capped ? null : n.WireGrams == 0 ? "Out of wire" : n.PressYield > 1 ? $"Make clips · +{n.PressYield}" : "Bend a clip",
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

    void Use(string target)
    {
        if (!used)
        {
            used = true;
            hud.HideHint();
        }
        switch (target)
        {
            case "press": MakeClips(); break;
            case "carton": _ = night.Trial == Trial.Open ? night.SendTrial() : night.Pack(); break;
            case "machine": if (night.Jammed) night.Free(); break;
            case "dark": night.Lift(); break;
            case "glint": night.Catch(); break;
            case "monitor": OpenTerminal(true); break;
            case "phone": hud.Caption("The courier", "Press 1 to take the cartons, 2 to let them go."); break;
            case "cabinet": night.TakeSpare(); break;
        }
    }

    void MakeClips()
    {
        var before = night.MadeClips;
        if (night.Make() != null) return;
        room.Press();
        var made = night.MadeClips - before;
        if (made > 0) hud.Floater(made);
    }

    void OpenTerminal(bool open)
    {
        hud.ShowTerminal(open);
        player.Frozen = open;
        Input.MouseMode = open ? Input.MouseModeEnum.Visible : Input.MouseModeEnum.Captured;
    }

    void OnCommand(string cmd)
    {
        if (cmd == "closeTerminal") OpenTerminal(false);
        else if (cmd == "pack") _ = night.Trial == Trial.Open ? night.SendTrial() : night.Pack();
        else if (cmd.StartsWith("buy:")) night.Buy(cmd[4..]);
        else if (cmd.StartsWith("read:")) night.Read(cmd[5..]);
        else if (cmd == "lease" || cmd == "end")
        {
            night.AnswerReport(cmd == "lease");
            hud.ShowReport(
                cmd == "lease"
                    ? "You took the building lease.\n\nThis is as far as the Godot version goes for now: the building comes next."
                    : "The night ended with the order. A trial run, one carton, eleven more. The machines are quiet, and the office is as Mara left it.",
                new[] { ("Quit", "quit") });
        }
        else if (cmd == "quit") GetTree().Quit();
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

    public override void _UnhandledInput(InputEvent e)
    {
        if (e is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left })
        {
            if (Input.MouseMode != Input.MouseModeEnum.Captured && !hud.TerminalOpen && !hud.ReportOpen)
            {
                Input.MouseMode = Input.MouseModeEnum.Captured;
                return;
            }
            if (looking != null && Label(looking) != null) Use(looking);
            return;
        }
        if (e is not InputEventKey { Pressed: true, Echo: false } k) return;
        switch (k.PhysicalKeycode)
        {
            case Key.Escape:
                if (hud.TerminalOpen) OpenTerminal(false);
                else Input.MouseMode = Input.MouseModeEnum.Visible;
                break;
            case Key.Tab:
            case Key.T:
                if (!hud.ReportOpen) OpenTerminal(!hud.TerminalOpen);
                break;
            case Key.E:
                if (looking != null && Label(looking) != null) Use(looking);
                break;
            case Key.B: MakeClips(); break;
            case Key.F: night.Free(); break;
            case Key.C: night.Catch(); break;
            case Key.Space: _ = night.Trial == Trial.Open ? night.SendTrial() : night.Pack(); break;
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

    // ---------- screenshots for automated checks ----------

    void ParseShotArgs()
    {
        var args = OS.GetCmdlineUserArgs();
        string? Arg(string name) => args.FirstOrDefault(a => a.StartsWith($"--{name}="))?.Split('=', 2)[1];
        shotPath = Arg("shot");
        if (shotPath == null) return;
        var at = Arg("at") ?? "start";
        var ap = new Autopilot(engaged: true);
        Func<bool> done = at switch
        {
            "dark" => () => night.SheetReady,
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
            var p = look.Split(',').Select(float.Parse).ToArray();
            player.Yaw = p[0];
            player.Pitch = p[1];
        }
        if (Arg("pos") is string pos)
        {
            var p = pos.Split(',').Select(float.Parse).ToArray();
            player.Position = new Vector3(p[0], 0, p[1]);
        }
        Input.MouseMode = Input.MouseModeEnum.Visible;
        hud.HideHint();
        shotFrames = 24;
    }
}
