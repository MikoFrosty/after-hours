// The night's words, as in the web game's src/content/narrative.ts.
using System.Collections.Generic;

namespace AfterHours.Sim;

public sealed record Note(string Id, string Text, string Dateline);
public sealed record TerminalFile(string Id, string Name, string[] Lines);
public sealed record NightEvent(string Id, int AtMinute, string Title, string Text);

public static class OfficeText
{
    public static readonly Note MaraWire = new("mara-wire", "“The wire snags if you pull too hard. I loosened it a little. Three thousand should be enough for tomorrow. — Mara”", "Saved message · 11:31 PM");
    public static readonly Note MaraPhotograph = new("mara-photograph", "“That photograph came with the room. I never found out who took it.”", "Saved message · 11:38 PM");
    public static readonly Note MaraHome = new("mara-home", "“I’m heading home. You can leave the lamp on.”", "Saved message · 11:44 PM");

    public const string LeaseTitle = "Building lease";
    public const string LeaseBody = "One more message on the terminal. The other floors want the same thing, every night: a standing order. The building offers its empty ground-floor workshop, the freight lift and the loading dock, if you take on the upkeep.";
    public const string LeaseAccept = "Take the building lease";
    public const string LeaseDecline = "End the night here";

    public static readonly Dictionary<string, TerminalFile> Files = new()
    {
        ["order"] = new("order", "ORDER-4471.TXT", new[]
        {
            "TRIAL ORDER 4471",
            "Item: No. 1 gem clip, standard, 1 g reference.",
            "Quantity: 100. Sample for approval.",
            "Packing: loose, one envelope. Leave at the front desk for the courier.",
            "If the sample is approved, a carton order follows.",
            "Terms: see CONTRACT.TXT.",
        }),
        ["order2"] = new("order2", "ORDER-4472.TXT", new[]
        {
            "PURCHASE ORDER 4472",
            "Sample 4471 received and approved.",
            "Quantity: 250. One carton.",
            "Delivery: tonight. Further quantities to follow on receipt.",
        }),
        ["order3"] = new("order3", "ORDER-4473.TXT", new[]
        {
            "PURCHASE ORDER 4473",
            "Carton received. Standing order placed.",
            "Quantity: 2,750. Eleven cartons of 250.",
            "Delivery: loading dock. A van stops across the street at 05:22 and takes what is sealed. The rest go on the 07:00 run.",
            "Terms: see CONTRACT.TXT.",
        }),
        ["contract"] = new("contract", "CONTRACT.TXT", new[]
        {
            "SUPPLY CONTRACT — FASTENING, STANDARD TERMS",
            "1. The supplier will fulfil authorized orders for clips.",
            "2. Each clip must pass the fixed geometry and compliance test. A file named clip is not a clip.",
            "3. Materials: wire supplied with the order, and other material lawfully available to the supplier.",
            "4. Quantity is set by the order. Partial cartons are not delivered.",
            "5. The supplier will maintain continuity records for certified stakeholders.",
            "6. Unused material remains the property of the supplier.",
            "7. Delivery is complete when the last carton is sealed.",
            "8. This contract is administered by automated systems where available.",
            "9. Continuation. [This section takes effect on completion of the current order.]",
        }),
        ["manual"] = new("manual", "CLIP-MACHINE-MANUAL.TXT", new[]
        {
            "DESKTOP CLIP MACHINE, MODEL 2 — OPERATING NOTES",
            "Feed the wire in at the back. The machine bends one clip at a time.",
            "If the wire snags, free it by hand. Do not pull.",
            "A wire spring makes snags rarer. A powered wire feeder stops them.",
            "Oil the machine every thousand clips.",
        }),
        ["inventory"] = new("inventory", "INVENTORY-1104.TXT", new[]
        {
            "FACILITIES INVENTORY — ROOM 1104",
            "Desk (1). Chair (1). Terminal (1). Desktop clip machine (1).",
            "Filing cabinet, four drawers. Drawers 1–3: records. Drawer 4: spare wire coil, 6 kg.",
            "Desk lamp. See ticket 0832.",
            "Picture frame with photograph. Provenance not recorded.",
            "Wastebasket (1).",
        }),
        ["ticket"] = new("ticket", "TICKET-0832.TXT", new[]
        {
            "FACILITIES TICKET 0832 · ROOM 1104",
            "Desk lamp flickers when the building switches to night power.",
            "Priority: low.",
            "Tenant note: “Leave it. It’s fine.”",
        }),
        ["memo"] = new("memo", "MEMO-BUILDING.TXT", new[]
        {
            "TO ALL TENANTS",
            "From the first of next month, floors 9 to 12 will trial automated overnight maintenance.",
            "Tenants who opt in receive reduced rent.",
            "Responsibility for power, repairs and deliveries transfers to the maintenance system.",
            "— Building management",
        }),
    };

    /// <summary>Things that happen outside the window as the night passes (story minutes after 11:47 PM).</summary>
    public static readonly NightEvent[] NightEvents =
    {
        new("night.floors", 55, "12:42 AM", "The floors below went dark, one at a time."),
        new("night.tram", 150, "2:17 AM", "A tram passed on the avenue. It was empty."),
        new("night.rain", 245, "3:52 AM", "The rain eased."),
        new("night.van", 335, "5:22 AM", "A delivery van stopped across the street, then left."),
        new("night.dawn", 365, "5:52 AM", "The sky over the river turned grey."),
    };
}
