// What sits over the room: the current order, the crosshair and what it points at, captions, prompts,
// the terminal (orders, upgrades, files) and the shift report.
using System;
using System.Collections.Generic;
using System.Linq;
using AfterHours.Sim;
using Godot;

namespace AfterHours.Game;

public partial class Hud : CanvasLayer
{
    Night n = null!;
    HandWork hands = new();
    Label handLine = null!, refusal = null!;
    ulong refusedAt;
    Label order = null!, goal = null!, stats = null!, hover = null!, prompt = null!, hint = null!, captionTitle = null!, captionText = null!;
    PanelContainer captionBox = null!, promptBox = null!;
    Control cross = null!;
    Control floaters = null!;
    PanelContainer terminal = null!, report = null!;
    VBoxContainer upgrades = null!, files = null!;
    Label termOrder = null!, fileView = null!;
    Button termPack = null!;
    readonly Queue<(string Title, string Text, ulong At)> captions = new();
    ulong captionShownAt;
    bool captionUp;
    int seenSerial = -1;
    public bool TerminalOpen => terminal.Visible;
    public bool ReportOpen => report.Visible;
    /// <summary>Asks the game to apply something chosen on the terminal or report.</summary>
    public event Action<string>? Command;

    const ulong MinCaptionMs = 3500, StaleCaptionMs = 8000, CaptionMs = 5500;

    static StyleBoxFlat Panel(float alpha = 0.78f) => new()
    {
        BgColor = new Color(0.035f, 0.045f, 0.05f, alpha),
        BorderColor = new Color(1, 1, 1, 0.07f),
        BorderWidthBottom = 1, BorderWidthTop = 1, BorderWidthLeft = 1, BorderWidthRight = 1,
        CornerRadiusBottomLeft = 9, CornerRadiusBottomRight = 9, CornerRadiusTopLeft = 9, CornerRadiusTopRight = 9,
        ContentMarginLeft = 14, ContentMarginRight = 14, ContentMarginTop = 10, ContentMarginBottom = 10,
    };

    static Label Text(string s, int size, Color c, bool wrap = false)
    {
        var l = new Label { Text = s, AutowrapMode = wrap ? TextServer.AutowrapMode.WordSmart : TextServer.AutowrapMode.Off };
        l.AddThemeFontSizeOverride("font_size", size);
        l.AddThemeColorOverride("font_color", c);
        return l;
    }

    static readonly Color Ink = new(0.91f, 0.89f, 0.84f), Muted = new(0.64f, 0.65f, 0.62f), Accent = new(0.84f, 0.64f, 0.4f), Phosphor = new(0.56f, 0.89f, 0.69f);

    public void Init(Night night, HandWork h)
    {
        n = night;
        hands = h;
        captions.Clear();
        captionUp = false;
        if (captionBox != null) captionBox.Visible = false;
    }

    /// <summary>Say briefly why something cannot be done.</summary>
    public void Refuse(string why)
    {
        refusal.Text = why;
        refusal.Visible = true;
        refusedAt = Time.GetTicksMsec();
    }

    public override void _Ready()
    {
        var root = new Control { MouseFilter = Control.MouseFilterEnum.Ignore };
        root.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        AddChild(root);

        // the order, top left
        var top = new PanelContainer { Position = new Vector2(16, 16), CustomMinimumSize = new Vector2(380, 0), MouseFilter = Control.MouseFilterEnum.Ignore };
        top.AddThemeStyleboxOverride("panel", Panel());
        var tv = new VBoxContainer();
        tv.AddThemeConstantOverride("separation", 4);
        order = Text("", 13, Accent);
        goal = Text("", 17, Ink, true);
        goal.CustomMinimumSize = new Vector2(352, 0);
        stats = Text("", 13, Muted);
        handLine = Text("", 14, new Color(0.62f, 0.86f, 0.72f), true);
        handLine.CustomMinimumSize = new Vector2(352, 0);
        tv.AddChild(order);
        tv.AddChild(goal);
        tv.AddChild(handLine);
        tv.AddChild(stats);
        top.AddChild(tv);
        root.AddChild(top);

        // the crosshair and what it points at
        cross = new ColorRect { Color = new Color(1, 1, 1, 0.55f), Size = new Vector2(4, 4), MouseFilter = Control.MouseFilterEnum.Ignore };
        cross.SetAnchorsPreset(Control.LayoutPreset.Center);
        cross.Position -= new Vector2(2, 2);
        root.AddChild(cross);
        hover = Text("", 16, new Color(0.96f, 0.9f, 0.78f));
        hover.HorizontalAlignment = HorizontalAlignment.Center;
        hover.SetAnchorsPreset(Control.LayoutPreset.Center);
        hover.Size = new Vector2(600, 30);
        hover.Position = new Vector2(-300, 18);
        hover.AddThemeConstantOverride("outline_size", 6);
        hover.AddThemeColorOverride("font_outline_color", new Color(0, 0, 0, 0.8f));
        root.AddChild(hover);
        floaters = new Control { MouseFilter = Control.MouseFilterEnum.Ignore };
        floaters.SetAnchorsPreset(Control.LayoutPreset.Center);
        root.AddChild(floaters);

        // captions, top centre
        captionBox = new PanelContainer { Visible = false, MouseFilter = Control.MouseFilterEnum.Ignore };
        captionBox.AddThemeStyleboxOverride("panel", Panel(0.7f));
        captionBox.SetAnchorsPreset(Control.LayoutPreset.CenterTop);
        captionBox.CustomMinimumSize = new Vector2(560, 0);
        captionBox.Position = new Vector2(-280, 22);
        var cv = new VBoxContainer();
        captionTitle = Text("", 12, Accent);
        captionTitle.HorizontalAlignment = HorizontalAlignment.Center;
        captionText = Text("", 19, Ink, true);
        captionText.HorizontalAlignment = HorizontalAlignment.Center;
        captionText.CustomMinimumSize = new Vector2(530, 0);
        cv.AddChild(captionTitle);
        cv.AddChild(captionText);
        captionBox.AddChild(cv);
        root.AddChild(captionBox);

        // a prompt for what needs an answer, bottom centre
        promptBox = new PanelContainer { Visible = false, MouseFilter = Control.MouseFilterEnum.Ignore };
        promptBox.AddThemeStyleboxOverride("panel", Panel(0.85f));
        promptBox.SetAnchorsPreset(Control.LayoutPreset.CenterBottom);
        promptBox.CustomMinimumSize = new Vector2(620, 0);
        promptBox.Position = new Vector2(-310, -110);
        prompt = Text("", 16, Ink, true);
        prompt.HorizontalAlignment = HorizontalAlignment.Center;
        prompt.CustomMinimumSize = new Vector2(590, 0);
        promptBox.AddChild(prompt);
        root.AddChild(promptBox);

        hint = Text("WASD walk · mouse look · click to use · hold and drag down to pull the lever · Tab terminal · Esc pause", 14, Muted);
        hint.SetAnchorsPreset(Control.LayoutPreset.CenterBottom);
        hint.HorizontalAlignment = HorizontalAlignment.Center;
        hint.Size = new Vector2(900, 24);
        hint.Position = new Vector2(-450, -40);
        root.AddChild(hint);

        refusal = Text("", 15, new Color(1f, 0.72f, 0.6f));
        refusal.SetAnchorsPreset(Control.LayoutPreset.CenterBottom);
        refusal.HorizontalAlignment = HorizontalAlignment.Center;
        refusal.Size = new Vector2(900, 24);
        refusal.Position = new Vector2(-450, -70);
        refusal.AddThemeConstantOverride("outline_size", 6);
        refusal.AddThemeColorOverride("font_outline_color", new Color(0, 0, 0, 0.85f));
        refusal.Visible = false;
        root.AddChild(refusal);

        BuildTerminal(root);
        BuildReport(root);
    }

    void BuildTerminal(Control root)
    {
        terminal = new PanelContainer { Visible = false };
        var style = Panel(0.96f);
        style.BgColor = new Color(0.03f, 0.055f, 0.045f, 0.97f);
        style.BorderColor = new Color(0.5f, 1f, 0.7f, 0.18f);
        terminal.AddThemeStyleboxOverride("panel", style);
        terminal.SetAnchorsPreset(Control.LayoutPreset.Center);
        terminal.CustomMinimumSize = new Vector2(760, 560);
        terminal.Position = new Vector2(-380, -280);
        var v = new VBoxContainer();
        v.AddThemeConstantOverride("separation", 10);
        var head = new HBoxContainer();
        var title = Text("TERMINAL · ROOM 1104", 13, Phosphor);
        title.SizeFlagsHorizontal = Control.SizeFlags.ExpandFill;
        head.AddChild(title);
        var close = new Button { Text = "Close (Tab)" };
        close.Pressed += () => Command?.Invoke("closeTerminal");
        head.AddChild(close);
        v.AddChild(head);

        termOrder = Text("", 16, Ink, true);
        termOrder.CustomMinimumSize = new Vector2(720, 0);
        v.AddChild(termOrder);
        termPack = new Button { Text = "Pack a carton" };
        termPack.Pressed += () => Command?.Invoke("pack");
        v.AddChild(termPack);

        var cols = new HBoxContainer();
        cols.AddThemeConstantOverride("separation", 14);
        cols.SizeFlagsVertical = Control.SizeFlags.ExpandFill;
        var left = new VBoxContainer { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill, SizeFlagsStretchRatio = 1.4f };
        left.AddChild(Text("UPGRADES · paid with clips on the desk", 12, Accent));
        var us = new ScrollContainer { SizeFlagsVertical = Control.SizeFlags.ExpandFill };
        upgrades = new VBoxContainer { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill };
        upgrades.AddThemeConstantOverride("separation", 8);
        us.AddChild(upgrades);
        left.AddChild(us);
        cols.AddChild(left);
        var right = new VBoxContainer { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill };
        right.AddChild(Text("FILES", 12, Accent));
        files = new VBoxContainer();
        right.AddChild(files);
        var fs = new ScrollContainer { SizeFlagsVertical = Control.SizeFlags.ExpandFill };
        fileView = Text("", 13, Phosphor, true);
        fileView.CustomMinimumSize = new Vector2(280, 0);
        fs.AddChild(fileView);
        right.AddChild(fs);
        cols.AddChild(right);
        v.AddChild(cols);
        terminal.AddChild(v);
        root.AddChild(terminal);
    }

    Label reportText = null!;
    VBoxContainer reportButtons = null!;

    void BuildReport(Control root)
    {
        report = new PanelContainer { Visible = false };
        report.AddThemeStyleboxOverride("panel", Panel(0.95f));
        report.SetAnchorsPreset(Control.LayoutPreset.Center);
        report.CustomMinimumSize = new Vector2(600, 0);
        report.Position = new Vector2(-300, -200);
        var v = new VBoxContainer();
        v.AddThemeConstantOverride("separation", 12);
        reportText = Text("", 16, Ink, true);
        reportText.CustomMinimumSize = new Vector2(570, 0);
        v.AddChild(reportText);
        reportButtons = new VBoxContainer();
        v.AddChild(reportButtons);
        report.AddChild(v);
        root.AddChild(report);
    }

    public void ShowTerminal(bool on)
    {
        terminal.Visible = on;
        seenSerial = -1;
    }

    public void Caption(string title, string text)
    {
        captions.Enqueue((title, Wording.InRoom(text), Time.GetTicksMsec()));
        while (captions.Count > 2) captions.Dequeue();
    }

    public void Floater(int made)
    {
        var l = Text($"+{made}", 18, new Color(1f, 0.85f, 0.56f));
        l.Position = new Vector2(10, -16);
        floaters.AddChild(l);
        var tw = CreateTween();
        tw.TweenProperty(l, "position:y", -54f, 0.8f);
        tw.Parallel().TweenProperty(l, "modulate:a", 0f, 0.8f);
        tw.TweenCallback(Callable.From(l.QueueFree));
    }

    public void HideHint() => hint.Visible = false;

    public void SetHover(string? label) => hover.Text = label ?? "";

    public void ShowReport(string text, (string Label, string Command)[] buttons)
    {
        report.Visible = true;
        reportText.Text = text;
        foreach (var c in reportButtons.GetChildren()) c.QueueFree();
        foreach (var (label, cmd) in buttons)
        {
            var b = new Button { Text = label };
            b.Pressed += () => Command?.Invoke(cmd);
            reportButtons.AddChild(b);
        }
    }

    public void HideReport()
    {
        if (report != null) report.Visible = false;
    }

    public void Sync()
    {
        order.Text = (n.Trial != Trial.Approved ? "ORDER 1 OF 3 · TRIAL RUN" : n.Sealed == 0 ? "ORDER 2 OF 3 · FIRST CARTON" : $"ORDER 3 OF 3 · {n.BigPacked} OF 11 CARTONS");
        goal.Text = n.NextGoal();
        // the hands: what the bender needs next, until the machine takes over the work
        var busy = hands.Held > 0 || hands.Loaded > 0 || hands.Bent;
        handLine.Visible = !n.Capped && (!n.Owns("calibrate") || busy);
        handLine.Text = hands.Next switch
        {
            HandWork.Step.Pull => "By hand: pull a length of wire off the coil.",
            HandWork.Step.Feed => "By hand: feed the wire into the bender.",
            HandWork.Step.Bend => $"By hand: pull the lever down to bend a pair · wire for {hands.Loaded} more",
            _ => "By hand: snip them off with the red cutter.",
        };
        if (refusal.Visible && Time.GetTicksMsec() - refusedAt > 2400) refusal.Visible = false;
        var rate = n.MachineRate;
        var forecast = n.VanForecast();
        stats.Text = $"{n.Loose:N0} clips on the desk{(rate > 0 ? $" · {rate / 1000.0:0.0}/s" : "")} · {n.Clock()}{(forecast != null ? $" · van at 5:22 takes ~{forecast}" : "")}";

        // captions: each stays a moment; one that waited too long is dropped
        var now = Time.GetTicksMsec();
        if (captionUp && now - captionShownAt > CaptionMs && captions.Count == 0)
        {
            captionUp = false;
            captionBox.Visible = false;
        }
        while (captions.Count > 0 && now - captions.Peek().At > StaleCaptionMs) captions.Dequeue();
        if (captions.Count > 0 && (!captionUp || now - captionShownAt >= MinCaptionMs))
        {
            var (t, x, _) = captions.Dequeue();
            captionTitle.Text = t.ToUpperInvariant();
            captionText.Text = x;
            captionBox.Visible = true;
            captionUp = true;
            captionShownAt = now;
        }

        // what needs an answer right now
        string? p = null;
        if (n.Courier?.Phase == CourierPhase.Offer) p = $"The phone is ringing: a courier can take two more cartons in the next minute, for {n.Cfg.CourierBonus} clips.\n[1] Take it    [2] Let them go";
        else if (n.Hot?.Phase == HotPhase.Offer) p = "The clip machine is running hot.\n[1] Let it cool for a few seconds    [2] Keep going and hope it holds";
        else if (n.Jammed) p = "The wire snagged. Click the clip machine (or press F) to free it.";
        else if (n.BurstReady) p = "The wire is running perfectly straight. Click the glint on the wire (or press C).";
        else if (n.SpareOffered && n.WireGrams < 800) p = "The wire is running low. The spare coil is in the filing cabinet's bottom drawer.";
        else if (n.Courier?.Phase == CourierPhase.Run) p = $"The courier is waiting: {Math.Max(0, n.Courier.Goal - n.Sealed)} more carton(s) · {Math.Max(0, (n.Courier.UntilMs - n.SimMs) / 1000)} s";
        else if (n.Installing != null) p = $"Installing the {n.Project(n.Installing.Id).Name.ToLowerInvariant()} · {Math.Max(0, (n.Project(n.Installing.Id).InstallMs - n.Installing.Ms) / 1000.0):0} s";
        promptBox.Visible = p != null && !terminal.Visible && !report.Visible;
        prompt.Text = p ?? "";
        cross.Visible = hover.Visible = !terminal.Visible && !report.Visible;

        if (terminal.Visible && n.EventSerial + n.Loose / 10 != seenSerial)
        {
            seenSerial = n.EventSerial + n.Loose / 10;
            SyncTerminal();
        }
    }

    void SyncTerminal()
    {
        var l = n.Loose;
        var lines = new List<string> { $"{order.Text}", n.NextGoal() };
        var horizon = n.PaybackHorizon();
        var forecast = n.VanForecast();
        if (forecast != null) lines.Add($"If you stop buying and pack everything, the 5:22 van takes {forecast} of 11.");
        lines.Add($"{l:N0} clips on the desk · machines {n.SteadyRate / 1000.0:0.0}/s · wire left {n.WireGrams:N0} g");
        termOrder.Text = string.Join("\n", lines);
        termPack.Visible = !n.Capped;
        termPack.Text = n.Trial == Trial.Open ? $"Send the trial run ({Math.Min(l, n.Cfg.TrialClips)}/{n.Cfg.TrialClips})" : n.Trial == Trial.Sent ? "Waiting to hear back about the trial" : $"Pack a carton ({Math.Min(l, n.Cfg.BoxSize)}/{n.Cfg.BoxSize})";
        termPack.Disabled = n.Trial == Trial.Sent || l < (n.Trial == Trial.Open ? n.Cfg.TrialClips : n.Cfg.BoxSize);

        foreach (var c in upgrades.GetChildren()) c.QueueFree();
        var offered = n.Uncovered && !n.Capped ? n.Offered() : new List<OfficeProject>();
        var best = offered.Count > 1 ? n.BestUpgrade() : null;
        // before anything is on offer, say what opens the first upgrade, so the empty list is a goal and not a dead end
        if (offered.Count == 0)
            upgrades.AddChild(Text(
                n.Uncovered ? "Nothing more on offer right now."
                : n.Trial != Trial.Approved ? "Nothing yet. Upgrades open once the customer approves the trial run."
                : n.SheetReady ? "Nothing yet. Something sits at the dark end of the desk: turn the lamp toward it."
                : "Nothing yet. Keep making clips by hand.",
                14, Muted, true));
        if (n.Owned.Count > 0)
            upgrades.AddChild(Text("Installed: " + string.Join(", ", n.Owned.Select(id => n.Project(id).Name.ToLowerInvariant())), 12, Muted, true));
        foreach (var p in offered)
        {
            var row = new PanelContainer();
            row.AddThemeStyleboxOverride("panel", Panel(0.5f));
            var h = new HBoxContainer();
            var info = new VBoxContainer { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill };
            info.AddChild(Text(p.Name + (best?.Id == p.Id ? "  · best value" : ""), 15, best?.Id == p.Id ? Accent : Ink));
            info.AddChild(Text(Wording.InRoom(p.Short), 13, Muted, true));
            var gain = n.RateGain(p);
            var pay = n.PaybackSeconds(p);
            var detail = gain > 0 ? $"+{gain / 1000.0:0.0}/s · pays for itself in {Night.FmtTime(pay!.Value)}" : Wording.InRoom(p.Text);
            if (horizon != null && pay != null && !n.PaysInTime(p)) detail += $" · not before {horizon.Value.Until}";
            info.AddChild(Text(detail, 12, Phosphor, true));
            h.AddChild(info);
            var reason = n.CanStart(p.Id);
            var buy = new Button { Text = $"Buy · {p.CostClips}", Disabled = reason != null, TooltipText = reason ?? "" };
            var id = p.Id;
            buy.Pressed += () => Command?.Invoke($"buy:{id}");
            h.AddChild(buy);
            row.AddChild(h);
            upgrades.AddChild(row);
        }

        foreach (var c in files.GetChildren()) c.QueueFree();
        foreach (var (id, state) in n.Files)
        {
            var f = OfficeText.Files[id];
            var b = new Button { Text = (state == "unread" ? "● " : "  ") + f.Name, Alignment = HorizontalAlignment.Left, Flat = true };
            b.Pressed += () =>
            {
                fileView.Text = string.Join("\n\n", f.Lines);
                Command?.Invoke($"read:{id}");
            };
            files.AddChild(b);
        }
        if (n.Log.Count > 0)
        {
            var notes = n.Log.Where(e => e.Kind == "note").ToList();
            foreach (var note in notes)
            {
                var b = new Button { Text = "  Note from Mara", Alignment = HorizontalAlignment.Left, Flat = true };
                var text = note.Text;
                b.Pressed += () => fileView.Text = text;
                files.AddChild(b);
            }
        }
    }
}
