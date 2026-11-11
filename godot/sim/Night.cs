// The night desk: a trial run of 100 loose clips, then one carton of 250, then eleven more cartons.
// A line-for-line port of the web game's src/game/chapters/c01.ts and the parts of its engine the night uses.
// It must play exactly like the web game: tests/OfficeParityTests.cs replays both simulated players against
// a run recorded from it (tests/fixtures/office-parity.json).
using System;
using System.Collections.Generic;
using System.Linq;

namespace AfterHours.Sim;

/// <summary>Something the room, the sound and the captions react to.</summary>
public readonly record struct Signal(string Type, string Id, string Title = "", string Text = "");

public sealed record LogEntry(string Id, string Kind, string Title, string Text, long SimMs);

public enum Trial { Open, Sent, Approved }
public enum HotPhase { Offer, Cooling, Stalled }
public enum CourierPhase { Offer, Run }
public enum NightMode { Playing, Choice, Done }

public sealed record Hot(HotPhase Phase, long UntilMs);
public sealed record Courier(CourierPhase Phase, long UntilMs, int Goal);
public sealed record Installing(string Id, long Ms);

public sealed class Night
{
    public const int StepMs = 100;
    /// <summary>A time long before the night began: for moments that have not happened yet.</summary>
    public const long Never = -1_000_000_000_000;
    public const int Cartons = 12;
    /// <summary>The big order: the eleven cartons after the first.</summary>
    public const int BigOrder = Cartons - 1;

    public OfficeConfig Cfg { get; }

    // ---------- state ----------
    public long SimMs;
    public double StorySeconds;
    public NightMode Mode = NightMode.Playing;
    /// <summary>The building lease: taken, declined, or not decided yet.</summary>
    public bool? LeaseTaken;
    public int MadeClips;
    public long RateResidue;
    public readonly List<string> Owned = new();
    public Installing? Installing;
    public bool Jammed;
    public int SinceJam;
    public int Jams;
    public int Sealed;
    public int? VanCartons;
    public bool SpareTaken;
    public int HandPresses;
    public long NextBurstMs;
    public long BurstReadyUntilMs;
    public long BurstUntilMs;
    public int BurstsCaught;
    public Trial Trial = Trial.Open;
    public long TrialAtMs;
    public int TrialClips;
    public bool SheetLifted;
    public long LastFileMs;
    /// <summary>Terminal files: "unread" or "read".</summary>
    public readonly Dictionary<string, string> Files = new();
    public Courier? Courier;
    public int CourierCartons;
    public int CourierBonus;
    public Hot? Hot;
    public bool Capped;
    public bool ReportShown;
    public long LifetimeMade;

    // the monitor, the milestone pulse and other moments the room shows
    public string Screen = "";
    public long ScreenAt = Never;
    public long MilestoneAt = Never;
    public long CappedAt = Never;
    public double? CappedStory;
    public long? VanAt;
    public int EventSerial;

    public readonly List<LogEntry> Log = new();
    readonly HashSet<string> fired = new();

    // the ledger, in clips (one gram of wire makes one clip): nothing is made or lost, only moved
    readonly Dictionary<string, long> accounts = new();
    readonly long total;

    public event Action<Signal>? OnSignal;

    public Night(OfficeConfig cfg)
    {
        Cfg = cfg;
        accounts["office.wire"] = cfg.WireClips;
        accounts["office.spare"] = cfg.SpareClips;
        accounts["clips"] = 0;
        accounts["office.machines"] = 0;
        total = accounts.Values.Sum();
    }

    void Emit(Signal s) => OnSignal?.Invoke(s);
    void Sound(string id) => Emit(new Signal("sound", id));
    void Beat(string title, string text) => Emit(new Signal("beat", "", title, text));
    void Bump() => EventSerial++;

    public bool HasFired(string id) => fired.Contains(id);
    bool Once(string id) => fired.Add(id);

    void AddLog(string id, string kind, string title, string text)
    {
        if (Log.Any(l => l.Id == id)) return;
        Log.Add(new LogEntry(id, kind, title, text, SimMs));
    }

    void Move(string from, string to, long n)
    {
        if (accounts[from] < n) throw new InvalidOperationException($"Not enough {from}");
        accounts[from] -= n;
        accounts[to] += n;
    }

    /// <summary>Null when every clip and every gram of wire is accounted for.</summary>
    public string? CheckInvariant() => accounts.Values.Sum() == total && accounts.Values.All(v => v >= 0) ? null : "The ledger does not balance.";

    public long Account(string id) => accounts[id];

    // ---------- reading the night ----------

    public bool Owns(string id) => Owned.Contains(id);
    public OfficeProject Project(string id) => Cfg.Projects.First(p => p.Id == id);
    /// <summary>Clips that have left the desk: the trial run and every sealed carton.</summary>
    public int Packed => TrialClips + Sealed * Cfg.BoxSize;
    /// <summary>Clips on the desk: the only clips that can be spent or packed.</summary>
    public int Loose => (int)Math.Max(0, accounts["clips"] - Packed);
    public int WireGrams => (int)accounts["office.wire"];
    long NightMs => SimMs;
    public bool Uncovered => SheetLifted || Owns("calibrate");
    public bool SheetReady => !Uncovered && Trial == Trial.Approved && MadeClips >= Cfg.SheetAfterClips && NightMs >= Cfg.SheetAfterMs;
    public int BigPacked => Math.Max(0, Sealed - 1);

    static long MulMilli(long a, long b) => (long)Math.Floor(a * (double)b / 1000);

    long RateFor(IEnumerable<string> owned)
    {
        long add = 0, mult = 1000, rack = 0, line = 1000;
        foreach (var id in owned)
        {
            var p = Cfg.Projects.FirstOrDefault(q => q.Id == id);
            if (p == null) continue;
            add += p.AddedRate;
            mult = MulMilli(mult, p.Multiplier);
            rack += p.RackRate;
            line = MulMilli(line, p.LineMultiplier);
        }
        return MulMilli(MulMilli(add, mult) + rack, line);
    }

    /// <summary>What the machines make in a steady minute: no burst, no snag (milli-clips per second).</summary>
    public long SteadyRate => RateFor(Owned);
    public bool BurstReady => BurstReadyUntilMs > SimMs;
    public bool BurstRunning => BurstUntilMs > SimMs;
    public bool MachinesHalted => Hot != null && Hot.Phase != HotPhase.Offer && Hot.UntilMs > SimMs;

    /// <summary>What the machines are making right now (milli-clips per second).</summary>
    public long MachineRate
    {
        get
        {
            if (Jammed || Capped || MachinesHalted) return 0;
            var r = SteadyRate;
            return BurstRunning ? MulMilli(r, Cfg.BurstMultiplier) : r;
        }
    }

    /// <summary>Clips per press: the hands, plus a moment of the machines with the foot pedal.</summary>
    public int PressYield
    {
        get
        {
            int hands = Cfg.HandClips;
            double pedal = 0;
            foreach (var id in Owned)
            {
                var p = Project(id);
                hands = Math.Max(hands, p.HandClips);
                pedal += p.PedalSeconds;
            }
            return hands + (int)Math.Floor(MachineRate * pedal / 1000);
        }
    }

    /// <summary>Small clip machines on the side-table rack (0, 3 or 6).</summary>
    public int RackMachines => (Owns("jig") ? 3 : 0) + (Owns("station6") ? 3 : 0);

    // ---------- upgrades ----------

    public bool Unlocked(OfficeProject p)
    {
        if (p.Id == "calibrate" && !Uncovered) return false;
        if (p.UnlockAfter != null && !Owns(p.UnlockAfter)) return false;
        if (p.UnlockMade is int m && MadeClips < m) return false;
        if (p.UnlockJams is int j && Jams < j) return false;
        if (p.UnlockBoxes is int b && Sealed < b) return false;
        return true;
    }

    /// <summary>An either/or pair is decided once one of them is bought or being installed.</summary>
    public bool ForkTaken(OfficeProject p) =>
        p.Exclusive != null && Cfg.Projects.Any(q => q.Exclusive == p.Exclusive && q.Id != p.Id && (Owns(q.Id) || Installing?.Id == q.Id));

    public List<OfficeProject> Offered() => Cfg.Projects.Where(p => !Owns(p.Id) && Unlocked(p) && !ForkTaken(p)).ToList();

    public string? CanStart(string id)
    {
        var p = Cfg.Projects.FirstOrDefault(q => q.Id == id);
        if (p == null) return "Not available.";
        if (Capped) return "The order is complete.";
        if (Owns(id)) return "Already bought.";
        if (!Unlocked(p)) return "Not available yet.";
        if (ForkTaken(p)) return "The other one was chosen.";
        if (Installing != null) return $"Installing the {Project(Installing.Id).Name.ToLowerInvariant()}.";
        if (Loose < p.CostClips) return $"Needs {p.CostClips} clips on the desk.";
        return null;
    }

    /// <summary>How much faster the machines would run with this upgrade (milli-clips per second).</summary>
    public long RateGain(OfficeProject p) => RateFor(Owned.Append(p.Id)) - RateFor(Owned);

    /// <summary>Simulated seconds until the 5:22 van, or null once it has been.</summary>
    public double? SecondsToVan()
    {
        if (VanCartons != null) return null;
        var story = Cfg.VanMinute * 60 - StorySeconds;
        return Math.Max(0, story * 1000 / Cfg.StoryPerSecond);
    }

    /// <summary>Seconds for an upgrade's extra output to make back its price, or null when it adds no machine output.</summary>
    public double? PaybackSeconds(OfficeProject p)
    {
        var gain = RateGain(p);
        if (gain <= 0) return null;
        return p.CostClips * 1000.0 / gain;
    }

    /// <summary>Cartons of the big order on the 5:22 van if nothing more is bought and everything is packed.</summary>
    public int? VanForecast()
    {
        var left = SecondsToVan();
        if (left == null || Sealed == 0 || Capped) return null;
        var clips = Loose + SteadyRate * left.Value / 1000;
        return Math.Min(BigOrder - CourierCartons, BigPacked - CourierCartons + (int)Math.Floor(clips / Cfg.BoxSize));
    }

    /// <summary>The upgrade most worth buying next: the best payback among those on offer.</summary>
    public OfficeProject? BestUpgrade()
    {
        var offered = Offered().Where(p => p.Id != "tensioner").ToList();
        if (offered.Count == 0) return null;
        return offered
            .Select(p => (p, t: PaybackSeconds(p) ?? (p.Kind == "hands" ? p.CostClips / 2.0 : double.PositiveInfinity)))
            .OrderBy(x => x.t)
            .First().p;
    }

    /// <summary>Seconds until the whole order is made at the machines' steady pace.</summary>
    public double SecondsToFinish()
    {
        var need = Math.Max(0, (Cartons - Sealed) * Cfg.BoxSize - Loose);
        var rate = SteadyRate;
        return rate > 0 ? need * 1000.0 / rate : double.PositiveInfinity;
    }

    /// <summary>How long an upgrade has to pay for itself: until the van while it is coming, never past the end of the order.</summary>
    public (double Seconds, string Until)? PaybackHorizon()
    {
        if (Sealed == 0 || Capped) return null;
        var finish = SecondsToFinish();
        var van = SecondsToVan();
        if (van != null && van.Value < finish) return (van.Value, "the van");
        return (finish, "the order is done");
    }

    /// <summary>Whether saving up for an upgrade and then paying it back both fit before the horizon.</summary>
    public bool PaysInTime(OfficeProject p)
    {
        var h = PaybackHorizon();
        var t = PaybackSeconds(p);
        if (h == null || t == null) return true;
        var rate = SteadyRate;
        var saving = rate > 0 ? Math.Max(0, p.CostClips - Loose) * 1000.0 / rate : double.PositiveInfinity;
        return saving + t.Value <= h.Value.Seconds;
    }

    public static string FmtTime(double sec)
    {
        var m = (int)Math.Floor(sec / 60);
        var ss = (int)Math.Round(sec % 60);
        return m > 0 ? $"{m}:{ss:00}" : $"{Math.Round(sec)} s";
    }

    /// <summary>One short line: the single most useful next step.</summary>
    public string NextGoal()
    {
        var l = Loose;
        if (Capped) return "Every carton is packed. The machines are off.";
        if (MadeClips == 0) return "Pull the lever on the hand bender to make a clip from the coil of wire.";
        if (Jammed) return "The wire snagged and the clip machine stopped. Free it.";
        if (Trial == Trial.Open)
            return l >= Cfg.TrialClips ? "The trial run is ready. Send it." : $"Make {Cfg.TrialClips - l} more clip{(Cfg.TrialClips - l == 1 ? "" : "s")} for the trial run.";
        if (Trial == Trial.Sent) return "Waiting to hear back. Keep making clips: you will need them.";
        if (!Uncovered) return "Something sits at the dark end of the desk.";
        if (Installing != null) return $"Installing the {Project(Installing.Id).Name.ToLowerInvariant()}…";
        if (Sealed == 0)
        {
            if (!Owns("calibrate")) return l >= 100 ? "Buy the clip machine at the terminal: it makes clips while you do other things." : $"Save {100 - l} more clips for the clip machine.";
            if (l >= Cfg.BoxSize) return "You have 250 clips. Pack the carton.";
            var best = BestUpgrade();
            if (best != null && l >= best.CostClips) return $"You can buy the {best.Name.ToLowerInvariant()} now, or keep filling the carton.";
            return $"Keep making clips: {Cfg.BoxSize - l} more fill the carton.";
        }
        if (Courier is { Phase: CourierPhase.Run } c)
        {
            var left = Math.Max(0, c.Goal - Sealed);
            return $"The courier is waiting: {left} more carton{(c.Goal - Sealed == 1 ? "" : "s")} to go.";
        }
        if (l >= Cfg.BoxSize) return "You can pack a carton, or keep the clips for an upgrade.";
        return $"{Cfg.BoxSize - l} more clips for the next carton.";
    }

    /// <summary>The spare coil can be taken once the inventory has been read, or as soon as wire runs low.</summary>
    public bool SpareOffered => !SpareTaken && accounts["office.spare"] > 0 && ((Files.TryGetValue("inventory", out var f) && f == "read") || WireGrams < 800);

    /// <summary>Clips the building starts with: the van's early-delivery bonus and the courier's.</summary>
    public int VanBonus => (VanCartons ?? 0) * Cfg.VanBonusPerCarton + CourierBonus;
    public int EarlyCartons => (VanCartons ?? 0) + CourierCartons;

    public string Grade(double seconds)
    {
        var early = EarlyCartons;
        if (early >= BigOrder) return seconds <= 360 ? "S" : "A";
        if (early >= 8) return "B";
        if (early >= 5) return "C";
        return "D";
    }

    /// <summary>Story minutes since 11:47 PM.</summary>
    public double Minute => StorySeconds / 60;

    /// <summary>The night's clock, e.g. "12:42 AM".</summary>
    public string Clock()
    {
        var total = (int)Math.Floor(StorySeconds / 60) + 23 * 60 + 47;
        var h = total / 60 % 24;
        var m = total % 60;
        var h12 = h % 12 == 0 ? 12 : h % 12;
        return $"{h12}:{m:00} {(h < 12 ? "AM" : "PM")}";
    }

    void SetScreen(string a, string b)
    {
        Screen = $"{a}|{b}";
        ScreenAt = SimMs;
    }

    // ---------- making clips ----------

    int Make(int n)
    {
        var k = Math.Min(n, WireGrams);
        if (k <= 0) return 0;
        Move("office.wire", "clips", k);
        MadeClips += k;
        LifetimeMade += k;
        return k;
    }

    void SealCarton()
    {
        Sealed += 1;
        Sound("tape");
        Bump();
    }

    void FinishInstall(string id)
    {
        Installing = null;
        Owned.Add(id);
        if (id == "feeder")
        {
            Jammed = false;
            SinceJam = 0;
        }
        var speed = $"{Math.Round(SteadyRate / 1000.0, MidpointRounding.AwayFromZero)} clips a second";
        var milestone = id switch
        {
            "feeder" => ("Wire feeder", $"The machine pulls its own wire now, and it never snags. {speed}."),
            "die2" => ("Second bending arm", $"Two arms on the machine, bending in turn. {speed}."),
            "jig" => ("Side-table rack", $"Three small machines start up beside the big one. {speed}."),
            "station6" => ("The rack is full", $"Six small machines and the big one, all running. {speed}."),
            "governor" => ("Overnight mode", $"The machines are set to run unattended. {speed}."),
            "pedal" => ("Foot pedal", "Every press now runs every machine for a moment."),
            _ => ((string, string)?)null,
        };
        if (milestone is var (t, x))
        {
            Beat(t, x);
            MilestoneAt = SimMs;
        }
        if (id == "feeder")
        {
            SetScreen("TARGET REVISED", "UPWARD");
            AddLog("c01.terminal.target", "system", "Terminal", "Throughput target revised upward. Revised by: this terminal.");
            Beat("Terminal", "Throughput target revised upward. Revised by: this terminal.");
        }
        if (id == "jig") SetScreen("OPERATOR: NONE", "NOT REQUIRED");
        Sound("install");
        if (id is "calibrate" or "feeder" or "jig") Sound("motif");
        if (id is "station6" or "jig") Sound("fullSpeed");
        Bump();
    }

    /// <summary>Keep hot machines running: about half the time the bending arm seizes for a while.</summary>
    void PushOn()
    {
        var seized = SimMs / 100 % 2 == 0;
        if (seized)
        {
            Hot = new Hot(HotPhase.Stalled, SimMs + Cfg.HotStallMs);
            AddLog("c01.hot.stalled", "system", "Running hot", $"The bending arm seized. It takes {Cfg.HotStallMs / 1000} seconds to free it.");
            Beat("Running hot", "The bending arm seized. Everything stops while it is freed.");
            Sound("jam");
        }
        else
        {
            Hot = null;
            AddLog("c01.hot.held", "system", "Running hot", "The machines ran hot and held.");
            Beat("Running hot", "The machines ran hot, and held.");
        }
        Bump();
    }

    int JamInterval => Owns("feeder") ? 0 : Owns("tensioner") ? Cfg.TensionedJamInterval : Cfg.JamInterval;

    // ---------- the fixed step ----------

    /// <summary>One 100 ms step: rates and transactions, then milestones.</summary>
    public void Step()
    {
        if (Mode != NightMode.Playing) return;
        SimMs += StepMs;
        StepRules(StepMs);
        Events();
        if (ReportPending && Mode == NightMode.Playing) Mode = NightMode.Choice;
    }

    void StepRules(long dt)
    {
        var night = Cfg.NightStorySeconds;
        if (Capped)
        {
            var from = CappedStory ?? night;
            StorySeconds = Math.Min(night, Math.Max(StorySeconds, StorySeconds + Math.Max(1, (night - from) / 50)));
            return;
        }
        var target = Math.Min(Math.Floor(night * 0.985), Math.Floor(NightMs * (double)Cfg.StoryPerSecond / 1_000_000));
        StorySeconds = Math.Max(StorySeconds, target);

        if (Installing != null)
        {
            Installing = Installing with { Ms = Installing.Ms + dt };
            if (Installing.Ms >= Project(Installing.Id).InstallMs) FinishInstall(Installing.Id);
        }

        // Speed bursts: once the clip machine runs, now and then the wire runs perfectly straight.
        if (Owns("calibrate"))
        {
            if (NextBurstMs == 0) NextBurstMs = SimMs + Cfg.BurstFirstAfterMs;
            if (BurstReadyUntilMs != 0 && SimMs >= BurstReadyUntilMs)
            {
                BurstReadyUntilMs = 0;
                Bump();
            }
            if (BurstReadyUntilMs == 0 && !BurstRunning && SimMs >= NextBurstMs)
            {
                BurstReadyUntilMs = SimMs + Cfg.BurstWindowMs;
                long n = BurstsCaught * 7 + SimMs / 1000;
                NextBurstMs = BurstReadyUntilMs + Cfg.BurstRunMs + Cfg.BurstEveryMs + n * 7919 % Math.Max(1, Cfg.BurstSpreadMs / 1000) * 1000;
                Sound("glint");
                Bump();
            }
        }
        // The late-night events run on their own clocks.
        if (Courier != null && SimMs >= Courier.UntilMs)
        {
            if (Courier.Phase == CourierPhase.Run)
            {
                AddLog("c01.courier.missed", "system", "Courier", "The courier could not wait any longer and drove on. The cartons stay for the van.");
                Beat("Courier", "The courier could not wait any longer and drove on.");
            }
            Courier = null;
            Bump();
        }
        if (Hot != null && SimMs >= Hot.UntilMs)
        {
            if (Hot.Phase == HotPhase.Offer) PushOn();
            else
            {
                Hot = null;
                Sound("free");
                Bump();
            }
        }
        if (BurstUntilMs != 0 && SimMs >= BurstUntilMs)
        {
            BurstUntilMs = 0;
            Sound("cleanEnd");
            Bump();
        }

        var rate = MachineRate;
        if (rate > 0)
        {
            // rate (milli-clips/s) × dt (ms) is exactly micro-clips.
            RateResidue += rate * dt;
            var whole = RateResidue / 1_000_000;
            RateResidue -= whole * 1_000_000;
            if (whole > 0)
            {
                var made = Make((int)whole);
                var interval = JamInterval;
                if (interval > 0 && made > 0)
                {
                    SinceJam += made;
                    if (SinceJam >= interval)
                    {
                        SinceJam = 0;
                        Jams += 1;
                        Jammed = true;
                        RateResidue = 0;
                        Sound("jam");
                        Bump();
                    }
                }
            }
        }
    }

    void BeatNow(int index)
    {
        if (!Once($"beat.01.{index}")) return;
        var (title, text) = Cfg.Beats[index];
        AddLog($"beat.01.{index}", "beat", title, text);
        Beat(title, text);
        Sound("motif");
        Bump();
    }

    void Note(Note n, bool caption)
    {
        AddLog(n.Id, "note", "Mara Venn", n.Text);
        if (caption)
        {
            Beat("A saved note from Mara", n.Text);
            Bump();
        }
    }

    /// <summary>The shift report and the building lease are waiting for an answer.</summary>
    public bool ReportPending { get; private set; }

    void Events()
    {
        if (Once("c01.mara.wire")) Note(OfficeText.MaraWire, false);
        if (MadeClips >= 1) BeatNow(0);
        if (Owns("calibrate"))
        {
            BeatNow(1);
            if (Once("c01.mara.home")) Note(OfficeText.MaraHome, true);
        }

        if (Trial == Trial.Sent && SimMs - TrialAtMs >= Cfg.TrialReplyMs)
        {
            Trial = Trial.Approved;
            Beat("Sample approved", "The customer liked the trial run. Next: one carton of 250.");
            Bump();
        }
        if (SheetReady && Once("c01.sheetNoticed"))
        {
            Beat("On the desk", "Something sits at the far end of the desk, out of the lamp's light.");
            Sound("notice");
            Bump();
        }
        if (Sealed >= 2 && !Capped && VanCartons == null && Minute >= Cfg.CourierAtMinute && Once("c01.courierOffered"))
        {
            Courier = new Courier(CourierPhase.Offer, SimMs + Cfg.CourierOfferMs, 0);
            Beat("A courier", $"A courier is passing. Two more cartons in the next minute go with them, for a bonus of {Cfg.CourierBonus} clips.");
            Sound("phone");
            Bump();
        }
        if (Courier is { Phase: CourierPhase.Run } run && Sealed >= run.Goal)
        {
            Courier = null;
            CourierCartons += Cfg.CourierCartons;
            CourierBonus += Cfg.CourierBonus;
            AddLog("c01.courier.done", "system", "Courier", $"The courier took two cartons. {Cfg.CourierBonus} clips for the building.");
            Beat("Courier", $"Two cartons gone with the courier. +{Cfg.CourierBonus} clips for the building.");
            Sound("van");
            Bump();
        }
        if (!Capped && SteadyRate >= Cfg.HotAtRate && Hot == null && Once("c01.hotOffered"))
        {
            Hot = new Hot(HotPhase.Offer, SimMs + Cfg.HotOfferMs);
            Beat("Running hot", "The clip machine is running hot. Let it cool for a few seconds, or keep going and hope it holds.");
            Sound("jam");
            Bump();
        }
        if (MadeClips >= 1 && Once("c01.screen.first")) SetScreen("OUTPUT LOGGED", "OPERATOR: ?");
        if (Sealed >= 1 && !Capped && Once("c01.bigOrder"))
            Beat("A bigger order", "Eleven more cartons, by morning. A van stops across the street at 5:22.");

        // The orders arrive the moment they are placed; other files appear one at a time and never two close together.
        var orders = new (string, bool)[] { ("order", MadeClips >= 1), ("order2", Trial == Trial.Approved), ("order3", Sealed >= 1) };
        foreach (var (id, ok) in orders)
        {
            if (ok && !Files.ContainsKey(id))
            {
                Files[id] = "unread";
                LastFileMs = SimMs;
                Sound("file");
                Bump();
            }
        }
        var fileRules = new (string, bool)[]
        {
            ("contract", MadeClips >= 15),
            ("manual", Uncovered),
            ("inventory", Owns("calibrate") && MadeClips >= 300),
            ("ticket", MadeClips >= 600),
            ("memo", Owns("feeder")),
        };
        if (SimMs - LastFileMs >= Cfg.FileGapMs)
        {
            foreach (var (id, ok) in fileRules)
            {
                if (ok && !Files.ContainsKey(id))
                {
                    Files[id] = "unread";
                    LastFileMs = SimMs;
                    Sound("file");
                    Bump();
                    break;
                }
            }
        }

        foreach (var p in Offered())
        {
            if (Once($"c01.offer.{p.Id}"))
            {
                Sound("notice");
                Bump();
            }
        }

        if (Owns("jig") && Once("c01.mara.photograph")) Note(OfficeText.MaraPhotograph, true);

        foreach (var ev in OfficeText.NightEvents)
        {
            if (Minute >= ev.AtMinute && Once(ev.Id))
            {
                if (ev.Id == "night.van")
                {
                    VanCartons = BigPacked - CourierCartons;
                    VanAt = SimMs;
                    var rest = BigOrder - CourierCartons - VanCartons.Value;
                    var text = Sealed == 0
                        ? "A delivery van waited across the street, then left. Nothing was ready for it."
                        : rest == 0
                            ? $"The delivery van took all eleven cartons. The customer adds {VanBonus} clips for the early delivery."
                            : VanCartons == 0
                                ? "The delivery van waited a minute across the street, then left empty. The order goes on the 7:00 run."
                                : $"The delivery van took {VanCartons} carton{(VanCartons == 1 ? "" : "s")}, with {VanBonus} clips added for the early delivery. The other {rest} go on the 7:00 run.";
                    AddLog(ev.Id, "system", ev.Title, text);
                    if (!Capped) Beat(ev.Title, text);
                    Sound("van");
                    Bump();
                }
                else
                {
                    AddLog(ev.Id, "system", ev.Title, ev.Text);
                    if (!Capped) Beat(ev.Title, ev.Text);
                }
            }
        }

        if (Sealed >= Cartons && !Capped)
        {
            Capped = true;
            CappedAt = SimMs;
            CappedStory = StorySeconds;
            if (VanCartons == null) VanCartons = BigOrder - CourierCartons;
            Courier = null;
            Hot = null;
            SetScreen("CLAUSE 9", "RENEWAL: AUTO");
            Jammed = false;
            Installing = null;
            BurstReadyUntilMs = 0;
            BeatNow(2);
            Sound("orderComplete");
        }
        // A quiet moment first: the machines have stopped and it is getting light.
        var settled = SimMs - CappedAt >= 6000;
        if (Capped && settled && LeaseTaken == null && !HasFired("c01.report.declined") && Once("c01.report"))
        {
            ReportShown = true;
            ReportPending = true;
            Sound("choice");
            Bump();
        }
    }

    // ---------- what the player does ----------

    /// <summary>Apply an action; returns why it was refused, or null. Milestones are evaluated right after.</summary>
    string? Do(Func<string?> action)
    {
        if (Mode == NightMode.Done) return "The night is over.";
        if (Mode == NightMode.Choice) return "A decision is pending.";
        var err = action();
        if (err == null)
        {
            Events();
            if (ReportPending && Mode == NightMode.Playing) Mode = NightMode.Choice;
        }
        return err;
    }

    public string? Make() => Do(() =>
    {
        if (Capped) return "The order is complete.";
        if (Make(PressYield) == 0) return "There is no wire left on the coil.";
        HandPresses += 1;
        Sound("bend");
        return null;
    });

    public string? Catch() => Do(() =>
    {
        if (!BurstReady) return "The moment has passed.";
        BurstReadyUntilMs = 0;
        BurstUntilMs = SimMs + Cfg.BurstRunMs;
        BurstsCaught += 1;
        Jammed = false;
        Sound("catch");
        Bump();
        return null;
    });

    public string? AnswerCourier(bool accept) => Do(() =>
    {
        if (Courier?.Phase != CourierPhase.Offer) return "The courier has gone.";
        if (!accept)
        {
            Courier = null;
            AddLog("c01.courier.declined", "system", "Courier", "You let the courier go. The cartons wait for the van.");
            Bump();
            return null;
        }
        Courier = new Courier(CourierPhase.Run, SimMs + Cfg.CourierRunMs, Sealed + Cfg.CourierCartons);
        Sound("switch");
        Bump();
        return null;
    });

    public string? AnswerHot(bool cool) => Do(() =>
    {
        if (Hot?.Phase != HotPhase.Offer) return null;
        if (cool)
        {
            Hot = new Hot(HotPhase.Cooling, SimMs + Cfg.HotCoolMs);
            AddLog("c01.hot.cooled", "system", "Running hot", "You let the machines cool for a few seconds.");
            Sound("switch");
            Bump();
        }
        else PushOn();
        return null;
    });

    public string? SendTrial() => Do(() =>
    {
        if (Trial != Trial.Open) return "The trial run has gone.";
        if (Loose < Cfg.TrialClips) return $"The trial run is {Cfg.TrialClips} clips.";
        Trial = Trial.Sent;
        TrialAtMs = SimMs;
        TrialClips = Cfg.TrialClips;
        AddLog("c01.trial", "system", "Trial run", $"{Cfg.TrialClips} clips in an envelope, left at the front desk for the courier.");
        Beat("Trial run sent", $"{Cfg.TrialClips} clips in an envelope, left at the front desk for the courier.");
        Sound("tape");
        Bump();
        return null;
    });

    public string? Lift() => Do(() =>
    {
        if (Uncovered) return null;
        if (!SheetReady) return "Not yet.";
        SheetLifted = true;
        AddLog("c01.sheet", "system", "The lamp", "In the lamp's light: a small desktop clip machine, switched off, with its manual tucked under it.");
        Sound("install");
        Bump();
        return null;
    });

    public string? Buy(string id) => Do(() =>
    {
        var err = CanStart(id);
        if (err != null) return err;
        Move("clips", "office.machines", Project(id).CostClips);
        Installing = new Installing(id, 0);
        Sound("startInstall");
        Bump();
        return null;
    });

    public string? Free() => Do(() =>
    {
        if (!Jammed) return null;
        Jammed = false;
        Sound("free");
        return null;
    });

    public string? Pack() => Do(() =>
    {
        if (Capped || Sealed >= Cartons) return "Every carton is packed.";
        if (Trial != Trial.Approved) return "There is no carton order yet.";
        if (Loose < Cfg.BoxSize) return $"A carton needs {Cfg.BoxSize} clips on the desk.";
        SealCarton();
        return null;
    });

    public string? Read(string file) => Do(() =>
    {
        if (!Files.ContainsKey(file)) return "No such file.";
        Files[file] = "read";
        return null;
    });

    public string? TakeSpare() => Do(() =>
    {
        if (!SpareOffered) return "Not available.";
        Move("office.spare", "office.wire", accounts["office.spare"]);
        SpareTaken = true;
        AddLog("c01.spare", "system", "Spare coil", "The spare coil from the cabinet’s bottom drawer is on the spindle.");
        Sound("install");
        Bump();
        return null;
    });

    /// <summary>Answer the shift report: take the building lease, or end the night here.</summary>
    public void AnswerReport(bool takeLease)
    {
        if (!ReportPending) return;
        ReportPending = false;
        Mode = NightMode.Playing;
        if (takeLease)
        {
            LeaseTaken = true;
            Sound("charter");
        }
        else
        {
            LeaseTaken = false;
            Once("c01.report.declined");
        }
        Events();
        if (Sealed >= Cartons && LeaseTaken != null) Mode = NightMode.Done;
    }
}
