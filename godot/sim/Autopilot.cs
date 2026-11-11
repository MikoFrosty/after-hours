// The two simulated players from the web game's src/game/autopilot.ts (officeNight), ported as is.
// Relaxed: a reasonable person. Engaged: someone optimizing hard.
using System.Linq;

namespace AfterHours.Sim;

public sealed class Autopilot
{
    readonly bool eff;
    double clickCredit;
    int jamSteps;
    int glintSeen;
    long glintDecided;

    public Autopilot(bool engaged) => eff = engaged;

    /// <summary>Play the whole night: act, then step, until the lease is answered. Returns the steps taken.</summary>
    public static int PlayNight(Night n, bool engaged, int maxSteps = 200_000)
    {
        var ap = new Autopilot(engaged);
        for (var i = 0; i < maxSteps; i++)
        {
            if (n.Mode == NightMode.Done) return i;
            if (n.ReportPending)
            {
                n.AnswerReport(true);
                continue;
            }
            ap.Act(n);
            if (n.ReportPending) continue;
            n.Step();
        }
        throw new System.InvalidOperationException("The simulated night stalled.");
    }

    public void Act(Night n)
    {
        var cfg = n.Cfg;
        foreach (var f in n.Files.Where(kv => kv.Value == "unread").Select(kv => kv.Key).ToList()) n.Read(f);
        if (n.SpareOffered) n.TakeSpare();
        if (n.Trial == Trial.Open && n.Loose >= cfg.TrialClips) n.SendTrial();
        // The dark end of the desk: noticed after a few seconds (relaxed) or at once (engaged).
        if (n.SheetReady && (eff || n.SimMs % 3_000 < 100)) n.Lift();
        if (n.Jammed)
        {
            jamSteps += 1;
            if (eff || jamSteps >= 20)
            {
                n.Free();
                jamSteps = 0;
            }
        }
        var minutes = n.SimMs / 60000.0;
        var sec = n.SimMs % 60_000;
        var rate = eff ? (minutes < 4 ? 0.4 : sec < 30_000 ? 0.3 : 0) : minutes < 3 ? 0.2 : sec < 15_000 ? 0.25 : 0;
        clickCredit += rate;
        while (clickCredit >= 1)
        {
            clickCredit -= 1;
            n.Make();
        }
        if (n.BurstReady)
        {
            var shownFor = n.SimMs - (n.BurstReadyUntilMs - cfg.BurstWindowMs);
            if (shownFor >= (eff ? 1000 : 2500) && glintDecided != n.BurstReadyUntilMs)
            {
                glintDecided = n.BurstReadyUntilMs;
                glintSeen += 1;
                if (eff ? glintSeen % 10 != 0 : glintSeen % 3 != 0) n.Catch();
            }
        }
        if (n.Hot?.Phase == HotPhase.Offer && n.SimMs % 3_000 < 100) n.AnswerHot(!eff);
        if (n.Courier?.Phase == CourierPhase.Offer && n.SimMs % 3_000 < 100) n.AnswerCourier(eff || n.Loose >= cfg.BoxSize);
        if (n.Courier?.Phase == CourierPhase.Run && n.Loose >= cfg.BoxSize) n.Pack();
        if (n.Capped || n.Installing != null) return;
        var l = n.Loose;
        // The one either/or: overnight mode for a relaxed player, the foot pedal for an engaged one.
        var avoid = eff ? "governor" : "pedal";
        var offered = n.Offered().Where(p => p.Id != avoid).ToList();
        if (n.Sealed == 0)
        {
            var buy = offered.FirstOrDefault(p => n.CanStart(p.Id) == null);
            if (buy != null) n.Buy(buy.Id);
            else if (n.Trial == Trial.Approved && n.Owns("calibrate") && l >= cfg.BoxSize) n.Pack();
            return;
        }
        foreach (var p in offered)
            if (p.Id == "tensioner" && n.CanStart(p.Id) == null) n.Buy(p.Id);
        if (n.Installing != null) return;
        var best = n.BestUpgrade();
        var chosen = best != null && best.Id == avoid ? null : best;
        var target = chosen != null && n.PaysInTime(chosen) ? chosen : offered.FirstOrDefault(p => p.Exclusive != null && n.PaysInTime(p));
        if (target != null && n.CanStart(target.Id) == null)
        {
            n.Buy(target.Id);
            return;
        }
        var saving = target?.CostClips ?? 0;
        if (l >= cfg.BoxSize && l - cfg.BoxSize >= saving) n.Pack();
    }
}
