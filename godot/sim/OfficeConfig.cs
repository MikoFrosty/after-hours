// The night's numbers, read from the same campaign.json the web game uses (copied to godot/data).
// Rates and multipliers are kept in thousandths, as in the web game, so both play out identically.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace AfterHours.Sim;

public sealed record OfficeProject(
    string Id,
    string Name,
    string Short,
    string Text,
    int CostClips,
    int InstallMs,
    string Kind,
    long AddedRate,
    long Multiplier,
    long RackRate,
    long LineMultiplier,
    int HandClips,
    double PedalSeconds,
    string? Exclusive,
    string? UnlockAfter,
    int? UnlockMade,
    int? UnlockJams,
    int? UnlockBoxes);

public sealed class OfficeConfig
{
    public int BoxSize { get; init; }
    public long WireClips { get; init; }
    public long SpareClips { get; init; }
    public int NightStorySeconds { get; init; }
    public long StoryPerSecond { get; init; }
    public int VanMinute { get; init; }
    public int VanBonusPerCarton { get; init; }
    public int HandClips { get; init; }
    public int JamInterval { get; init; }
    public int TensionedJamInterval { get; init; }
    public long BurstFirstAfterMs { get; init; }
    public long BurstEveryMs { get; init; }
    public long BurstSpreadMs { get; init; }
    public long BurstWindowMs { get; init; }
    public long BurstRunMs { get; init; }
    public long BurstMultiplier { get; init; }
    public int CourierAtMinute { get; init; }
    public long CourierOfferMs { get; init; }
    public long CourierRunMs { get; init; }
    public int CourierCartons { get; init; }
    public int CourierBonus { get; init; }
    public long HotAtRate { get; init; }
    public long HotOfferMs { get; init; }
    public long HotCoolMs { get; init; }
    public long HotStallMs { get; init; }
    public int TrialClips { get; init; }
    public long TrialReplyMs { get; init; }
    public long SheetAfterMs { get; init; }
    public int SheetAfterClips { get; init; }
    public long FileGapMs { get; init; }
    public IReadOnlyList<OfficeProject> Projects { get; init; } = Array.Empty<OfficeProject>();
    public IReadOnlyList<(string Title, string Text)> Beats { get; init; } = Array.Empty<(string, string)>();

    /// <summary>One gram of wire makes one clip.</summary>
    public const long ClipMicrograms = 1_000_000;

    static long Milli(double units) => (long)Math.Round(units * 1000);

    public static OfficeConfig Parse(string campaignJson)
    {
        using var doc = JsonDocument.Parse(campaignJson);
        var root = doc.RootElement;
        var o = root.GetProperty("office");
        long Micro(string name) => long.Parse(o.GetProperty(name).GetString()!);
        JsonElement P(JsonElement e, string name) => e.GetProperty(name);
        double Num(JsonElement e, string name, double fallback = 0) => e.TryGetProperty(name, out var v) ? v.GetDouble() : fallback;
        int? OptInt(JsonElement e, string name) => e.TryGetProperty(name, out var v) ? v.GetInt32() : null;
        string? OptStr(JsonElement e, string name) => e.TryGetProperty(name, out var v) ? v.GetString() : null;

        var bursts = P(o, "bursts");
        var ev = P(o, "events");
        var courier = P(ev, "courier");
        var hot = P(ev, "hot");
        var projects = P(o, "projects").EnumerateArray().Select(p =>
        {
            var u = P(p, "unlock");
            return new OfficeProject(
                P(p, "id").GetString()!,
                P(p, "name").GetString()!,
                P(p, "short").GetString()!,
                P(p, "text").GetString()!,
                P(p, "costClips").GetInt32(),
                (int)(Num(p, "installSeconds") * 1000),
                P(p, "kind").GetString()!,
                Milli(Num(p, "addedRate")),
                Milli(Num(p, "multiplier", 1)),
                Milli(Num(p, "rackRate")),
                Milli(Num(p, "lineMultiplier", 1)),
                (int)Num(p, "handClips"),
                Num(p, "pedalSeconds"),
                OptStr(p, "exclusive"),
                OptStr(u, "after"),
                OptInt(u, "made"),
                OptInt(u, "jams"),
                OptInt(u, "boxes"));
        }).ToList();
        var chapter = root.GetProperty("chapters").EnumerateArray().First(c => c.GetProperty("id").GetString() == "01");
        var beats = chapter.GetProperty("initialBeats").EnumerateArray().Select(b => (b[0].GetString()!, b[1].GetString()!)).ToList();

        return new OfficeConfig
        {
            BoxSize = P(o, "boxSize").GetInt32(),
            WireClips = Micro("wireMicrograms") / ClipMicrograms,
            SpareClips = Micro("spareWireMicrograms") / ClipMicrograms,
            NightStorySeconds = P(o, "nightStorySeconds").GetInt32(),
            StoryPerSecond = Milli(Num(o, "storySecondsPerSecond")),
            VanMinute = P(o, "vanMinute").GetInt32(),
            VanBonusPerCarton = P(o, "vanBonusPerCarton").GetInt32(),
            HandClips = P(P(o, "hands"), "perPress").GetInt32(),
            JamInterval = P(P(o, "jam"), "intervalClips").GetInt32(),
            TensionedJamInterval = P(P(o, "jam"), "tensionedIntervalClips").GetInt32(),
            BurstFirstAfterMs = (long)(Num(bursts, "firstAfterSeconds") * 1000),
            BurstEveryMs = (long)(Num(bursts, "everySeconds") * 1000),
            BurstSpreadMs = (long)(Num(bursts, "spreadSeconds") * 1000),
            BurstWindowMs = (long)(Num(bursts, "windowSeconds") * 1000),
            BurstRunMs = (long)(Num(bursts, "runSeconds") * 1000),
            BurstMultiplier = Milli(Num(bursts, "multiplier")),
            CourierAtMinute = P(courier, "atMinute").GetInt32(),
            CourierOfferMs = (long)(Num(courier, "offerSeconds") * 1000),
            CourierRunMs = (long)(Num(courier, "runSeconds") * 1000),
            CourierCartons = P(courier, "cartons").GetInt32(),
            CourierBonus = P(courier, "bonusClips").GetInt32(),
            HotAtRate = (long)(Num(hot, "atRate") * 1000),
            HotOfferMs = (long)(Num(hot, "offerSeconds") * 1000),
            HotCoolMs = (long)(Num(hot, "coolSeconds") * 1000),
            HotStallMs = (long)(Num(hot, "stallSeconds") * 1000),
            TrialClips = P(P(o, "trial"), "clips").GetInt32(),
            TrialReplyMs = (long)(Num(P(o, "trial"), "replySeconds") * 1000),
            SheetAfterMs = (long)(Num(P(o, "opening"), "sheetAfterSeconds") * 1000),
            SheetAfterClips = P(P(o, "opening"), "sheetAfterClips").GetInt32(),
            FileGapMs = (long)(Num(P(o, "opening"), "fileGapSeconds") * 1000),
            Projects = projects,
            Beats = beats,
        };
    }
}
