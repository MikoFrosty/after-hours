// Making clips by hand, step by step: pull a length of wire off the coil, feed it into the hand bender, pull the
// lever to bend a pair of clips (the bender has a double die), snip them off. Each length of wire makes ten clips.
// This is presentation state only; the Night counts the clips when they are snipped (two Night.Make presses), which
// keeps the hand-made opening at the web game's pace.
namespace AfterHours.Game;

public sealed class HandWork
{
    /// <summary>Clips' worth of wire in one length pulled off the coil.</summary>
    public const int Length = 10;
    /// <summary>Clips bent by one pull of the lever.</summary>
    public const int PerPull = 2;

    /// <summary>Wire in the player's hand, in clips.</summary>
    public int Held;
    /// <summary>Wire fed into the bender and not yet bent, in clips.</summary>
    public int Loaded;
    /// <summary>A pair of clips has been bent and waits to be snipped off.</summary>
    public bool Bent;
    /// <summary>How many clips are bent and waiting (1 when the last of the wire made a single one).</summary>
    public int BentCount;
    /// <summary>How far the lever is pulled down, 0 to 1 (while the player drags it).</summary>
    public float Lever;
    /// <summary>Animation clocks: 0 when it just happened, 1 when settled.</summary>
    public float SnipT = 1, PullT = 1, FeedT = 1, BendT = 1;

    public enum Step { Pull, Feed, Bend, Snip }

    /// <summary>What the bender needs next.</summary>
    public Step Next => Bent ? Step.Snip : Loaded > 0 ? Step.Bend : Held > 0 ? Step.Feed : Step.Pull;
}
