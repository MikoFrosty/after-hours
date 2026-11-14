// The night's text is shared with the web game (data/campaign.json must stay identical to it), where clips are made
// by pressing a button. In the room they are made at the hand bender, so the few lines that talk about the button
// are reworded here, as they are shown.
namespace AfterHours.Game;

public static class Wording
{
    static readonly (string From, string To)[] Swaps =
    {
        ("You can leave the button alone.", "You can step away from the bender."),
        ("whether you press or not", "whether you work the bender or not"),
        ("Each press also gives", "Each pull of the lever also gives"),
        ("Every press of yours also gives", "Every pull of the bender's lever also gives"),
        ("Worth it if you keep pressing.", "Worth it if you keep working the bender."),
    };

    public static string InRoom(string text)
    {
        foreach (var (from, to) in Swaps) text = text.Replace(from, to);
        return text;
    }
}
