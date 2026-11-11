using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using AfterHours.Sim;
using Xunit;

namespace AfterHours.Tests;

public class OfficeParityTests
{
    static string Repo([System.Runtime.CompilerServices.CallerFilePath] string here = "") => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", ".."));

    static OfficeConfig Config() => OfficeConfig.Parse(File.ReadAllText(Path.Combine(Repo(), "godot", "data", "campaign.json")));

    /// <summary>Play a night with a simulated player, recording what the web game's parity test records.</summary>
    static (Dictionary<string, object?> Summary, List<string> Trace) Record(bool engaged)
    {
        var n = new Night(Config());
        var trace = new List<string>();
        Dictionary<string, object?>? summary = null;
        n.OnSignal += sig =>
        {
            if (n.Mode == NightMode.Done) return;
            if (sig.Type == "sound" && sig.Id != "bend") trace.Add($"{n.SimMs} sound {sig.Id}");
            if (sig.Type == "beat") trace.Add($"{n.SimMs} beat {sig.Title}");
            if (sig.Type == "sound" && sig.Id == "orderComplete")
                summary = new()
                {
                    ["simMs"] = n.SimMs,
                    ["madeClips"] = n.MadeClips,
                    ["handPresses"] = n.HandPresses,
                    ["sealed"] = n.Sealed,
                    ["vanCartons"] = n.VanCartons,
                    ["courierCartons"] = n.CourierCartons,
                    ["courierBonus"] = n.CourierBonus,
                    ["jams"] = n.Jams,
                    ["burstsCaught"] = n.BurstsCaught,
                    ["owned"] = n.Owned.ToList(),
                    ["grade"] = n.Grade(n.SimMs / 1000.0),
                };
        };
        Autopilot.PlayNight(n, engaged);
        Assert.Null(n.CheckInvariant());
        return (summary!, trace);
    }

    [Theory]
    [InlineData("relaxed", false)]
    [InlineData("engaged", true)]
    public void PlaysTheNightExactlyLikeTheWebGame(string player, bool engaged)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Repo(), "godot", "tests", "fixtures", "office-parity.json")));
        var want = doc.RootElement.GetProperty(player);
        var (summary, trace) = Record(engaged);
        var wantTrace = want.GetProperty("trace").EnumerateArray().Select(x => x.GetString()!).ToList();
        // Compare step by step so a mismatch names the first event that differs.
        for (var i = 0; i < System.Math.Min(trace.Count, wantTrace.Count); i++) Assert.Equal(wantTrace[i], trace[i]);
        Assert.Equal(wantTrace.Count, trace.Count);
        Assert.Equal(JsonSerializer.Serialize(want.GetProperty("summary")), JsonSerializer.Serialize(summary));
    }

    [Fact]
    public void UsesTheSameNumbersAsTheWebGame()
    {
        var web = File.ReadAllText(Path.Combine(Repo(), "src", "content", "campaign.json"));
        var ours = File.ReadAllText(Path.Combine(Repo(), "godot", "data", "campaign.json"));
        Assert.True(web == ours, "godot/data/campaign.json differs from src/content/campaign.json: copy it across.");
    }

    [Fact]
    public void ThreeOrdersInOrder()
    {
        var n = new Night(Config());
        Assert.Equal("There is no carton order yet.", n.Pack());
        for (var i = 0; i < 100; i++) n.Make();
        Assert.Null(n.SendTrial());
        Assert.Equal(Trial.Sent, n.Trial);
        while (n.Trial != Trial.Approved) n.Step();
        Assert.Equal("Something sits at the dark end of the desk.", n.NextGoal());
        Assert.Null(n.Lift());
        Assert.Contains(n.Offered(), p => p.Id == "calibrate");
        for (var i = 0; i < 250; i++) n.Make();
        Assert.Null(n.Pack());
        Assert.Equal(1, n.Sealed);
        Assert.Equal(0, n.BigPacked);
        Assert.Null(n.CheckInvariant());
    }
}
