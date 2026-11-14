// Where clips are made by hand: the coil of wire, the hand bender (feed guide, bending pins, lever, cutter), the
// tray the clips drop into, the open carton and the trial run's envelope, and sealed cartons on the floor.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom
{
    Node3D bender = null!, lever = null!, loadedWire = null!, bentClip = null!, cutterJaw = null!, coil = null!, tray = null!;
    MultiMeshInstance3D clips = null!;
    const int MaxClips = 600;
    Node3D carton = null!, envelope = null!;
    readonly List<Node3D> sealedCartons = new();
    readonly List<(Node3D node, Vector3 from, Vector3 to, float t)> falling = new();
    StaticBody3D benderTarget = null!, coilTarget = null!;
    ArrayMesh clipMesh = null!;
    StandardMaterial3D clipMat = null!;
    float leverShown;
    /// <summary>Where the bender sits, for sound.</summary>
    public Vector3 BenderAt => bender.GlobalPosition;

    void BuildWorkbench()
    {
        clipMesh = ClipMesh();
        clipMat = new StandardMaterial3D { AlbedoColor = new Color(0.78f, 0.8f, 0.83f), Roughness = 0.28f, Metallic = 0.9f };
        var steel = Grain(new Color(0.5f, 0.52f, 0.54f), new Vector3(2, 30, 1), 0.35f, 0.3f, 111, 0.2f, 0.85f);
        var castIron = Grain(new Color(0.16f, 0.17f, 0.17f), new Vector3(12, 12, 1), 0.6f, 0.4f, 112, 0.5f, 0.4f);
        var red = Mat(new Color(0.55f, 0.1f, 0.07f), 0.35f);
        var wireMetal = Mat(new Color(0.75f, 0.77f, 0.8f), 0.3f, 0.9f);

        // the coil of wire, lying on the desk
        coil = new Node3D { Position = new Vector3(-0.02f, DeskY, -1.66f), RotationDegrees = new Vector3(0, 20, 0) };
        AddChild(coil);
        var copperish = Mat(new Color(0.7f, 0.66f, 0.6f), 0.32f, 0.9f);
        for (var k = 0; k < 9; k++)
            coil.AddChild(new MeshInstance3D { Mesh = Torus(0.075f + (k % 3) * 0.003f, 0.0025f, 40, 6), MaterialOverride = copperish, Position = new Vector3(0, 0.004f + k * 0.0045f, 0), RotationDegrees = new Vector3(k % 2 * 3, k * 13, 0) });
        // the free end sticks out toward the bender
        TubeNode(coil, new[] { new Vector3(0.075f, 0.02f, 0), new Vector3(0.11f, 0.018f, 0.02f), new Vector3(0.14f, 0.012f, 0.05f) }, 0.0025f, copperish, 6);
        coilTarget = Target(coil, "coil", new Vector3(0.2f, 0.08f, 0.2f), new Vector3(0.01f, 0.03f, 0));

        // the hand bender
        bender = new Node3D { Position = new Vector3(0.15f, DeskY, -1.38f), RotationDegrees = new Vector3(0, -12, 0) };
        AddChild(bender);
        RBox(bender, new Vector3(0.26f, 0.035f, 0.16f), new Vector3(0, 0.0175f, 0), castIron, 0.008f);
        foreach (var (x, z) in new[] { (-0.11f, -0.06f), (0.11f, -0.06f), (-0.11f, 0.06f), (0.11f, 0.06f) })
            Cyl(bender, 0.007f, 0.007f, 0.004f, new Vector3(x, 0.037f, z), steel, 10);
        RBox(bender, new Vector3(0.09f, 0.04f, 0.07f), new Vector3(0, 0.055f, -0.02f), steel, 0.006f);
        foreach (var x in new[] { -0.022f, 0f, 0.022f })
            Cyl(bender, 0.005f, 0.005f, 0.022f, new Vector3(x, 0.086f, -0.02f), steel, 12);
        // the feed guide, where the wire goes in from the left
        var guide = Cyl(bender, 0.009f, 0.009f, 0.06f, new Vector3(-0.08f, 0.07f, -0.02f), steel, 14);
        guide.RotationDegrees = new Vector3(0, 0, 90);
        RBox(bender, new Vector3(0.02f, 0.035f, 0.03f), new Vector3(-0.08f, 0.05f, -0.02f), castIron, 0.004f);
        loadedWire = new Node3D { Position = new Vector3(-0.05f, 0.07f, -0.02f) };
        bender.AddChild(loadedWire);
        var lw = Cyl(loadedWire, 0.0022f, 0.0022f, 1f, new Vector3(-0.5f, 0, 0), wireMetal, 6);
        lw.RotationDegrees = new Vector3(0, 0, 90);
        // the lever, pivoting on a post at the back right
        Cyl(bender, 0.012f, 0.014f, 0.09f, new Vector3(0.06f, 0.08f, -0.055f), steel, 14);
        lever = new Node3D { Position = new Vector3(0.06f, 0.125f, -0.055f) };
        bender.AddChild(lever);
        RBox(lever, new Vector3(0.03f, 0.024f, 0.03f), Vector3.Zero, castIron, 0.006f);
        Rod(lever, new Vector3(0, 0, 0), new Vector3(0.0f, 0.0f, 0.17f), 0.006f, steel);
        Lathe(lever, new[] { (0f, -0.03f), (0.012f, -0.028f), (0.016f, 0f), (0.012f, 0.028f), (0f, 0.03f) }, new Vector3(0, 0, 0.19f), red, 16).RotationDegrees = new Vector3(90, 0, 0);
        // a pair of clips, bent and waiting on the pins: freshly worked steel catches the light, and the pair is drawn
        // a little larger than life so it reads from where the player stands
        var freshMat = new StandardMaterial3D { AlbedoColor = new Color(0.85f, 0.87f, 0.9f), Roughness = 0.2f, Metallic = 0.9f, EmissionEnabled = true, Emission = new Color(1f, 0.82f, 0.55f), EmissionEnergyMultiplier = 0.5f };
        bentClip = new Node3D { Position = new Vector3(0, 0.1f, -0.02f), RotationDegrees = new Vector3(0, 90, 0), Scale = Vector3.One * 1.35f, Visible = false };
        bender.AddChild(bentClip);
        bentClip.AddChild(new MeshInstance3D { Mesh = clipMesh, MaterialOverride = freshMat });
        bentClip.AddChild(new MeshInstance3D { Mesh = clipMesh, MaterialOverride = freshMat, Position = new Vector3(0, 0.003f, 0.006f), RotationDegrees = new Vector3(0, 8, 0), Name = "Second" });
        // the cutter at the front right: a fixed jaw and a red-handled moving one
        RBox(bender, new Vector3(0.03f, 0.03f, 0.03f), new Vector3(0.085f, 0.05f, 0.045f), steel, 0.005f);
        cutterJaw = new Node3D { Position = new Vector3(0.085f, 0.067f, 0.045f) };
        bender.AddChild(cutterJaw);
        RBox(cutterJaw, new Vector3(0.008f, 0.008f, 0.07f), new Vector3(0, 0, 0.03f), steel, 0.003f);
        RBox(cutterJaw, new Vector3(0.016f, 0.014f, 0.06f), new Vector3(0, 0.002f, 0.08f), red, 0.006f);
        // a little chute from the pins toward the tray
        var chute = RBox(bender, new Vector3(0.11f, 0.003f, 0.05f), new Vector3(0.16f, 0.05f, -0.01f), steel, 0.001f);
        chute.RotationDegrees = new Vector3(0, 0, -16);
        benderTarget = Target(bender, "bender", new Vector3(0.3f, 0.24f, 0.36f), new Vector3(0.01f, 0.09f, 0.06f));
        SoundAt["bender"] = bender.Position + new Vector3(0, 0.08f, 0);

        // the clip tray
        tray = new Node3D { Position = new Vector3(0.45f, DeskY, -1.34f), RotationDegrees = new Vector3(0, -8, 0) };
        AddChild(tray);
        var trayMat = Grain(new Color(0.2f, 0.22f, 0.24f), new Vector3(10, 10, 1), 0.45f, 0.4f, 113, 0.2f, 0.5f);
        RBox(tray, new Vector3(0.28f, 0.008f, 0.19f), new Vector3(0, 0.004f, 0), trayMat, 0.003f);
        RBox(tray, new Vector3(0.28f, 0.035f, 0.008f), new Vector3(0, 0.0175f, 0.091f), trayMat, 0.003f);
        RBox(tray, new Vector3(0.28f, 0.035f, 0.008f), new Vector3(0, 0.0175f, -0.091f), trayMat, 0.003f);
        RBox(tray, new Vector3(0.008f, 0.035f, 0.19f), new Vector3(0.136f, 0.0175f, 0), trayMat, 0.003f);
        RBox(tray, new Vector3(0.008f, 0.035f, 0.19f), new Vector3(-0.136f, 0.0175f, 0), trayMat, 0.003f);
        var mm = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, Mesh = clipMesh, InstanceCount = MaxClips, VisibleInstanceCount = 0 };
        var rng = new Random(4);
        for (var i = 0; i < MaxClips; i++)
        {
            // the pile grows from the middle out and up
            var spread = Mathf.Min(1, 0.3f + i / 200f);
            var basis = new Basis(Vector3.Up, (float)(rng.NextDouble() * Mathf.Tau)) * new Basis(Vector3.Right, (float)(rng.NextDouble() - 0.5) * 0.4f);
            var pos = new Vector3((float)(rng.NextDouble() - 0.5) * 0.24f * spread, 0.011f + i / 90 * 0.0045f + (float)rng.NextDouble() * 0.002f, (float)(rng.NextDouble() - 0.5) * 0.15f * spread);
            mm.SetInstanceTransform(i, new Transform3D(basis, pos));
        }
        clips = new MultiMeshInstance3D { Multimesh = mm, MaterialOverride = clipMat };
        tray.AddChild(clips);
        SoundAt["tray"] = tray.Position;

        // the open carton at the desk's right end, and the trial run's envelope until it has gone
        carton = new Node3D { Position = new Vector3(0.79f, DeskY, -1.56f), RotationDegrees = new Vector3(0, -14, 0) };
        AddChild(carton);
        var card = Grain(new Color(0.55f, 0.41f, 0.25f), new Vector3(6, 6, 1), 0.95f, 0.4f, 11, 0.35f);
        var cardIn = Grain(new Color(0.36f, 0.27f, 0.16f), new Vector3(6, 6, 1), 0.95f, 0.4f, 12, 0.35f);
        RBox(carton, new Vector3(0.28f, 0.006f, 0.21f), new Vector3(0, 0.003f, 0), cardIn, 0.001f);
        foreach (var (size, pos) in new[] { (new Vector3(0.28f, 0.17f, 0.006f), new Vector3(0, 0.085f, 0.102f)), (new Vector3(0.28f, 0.17f, 0.006f), new Vector3(0, 0.085f, -0.102f)), (new Vector3(0.006f, 0.17f, 0.21f), new Vector3(0.137f, 0.085f, 0)), (new Vector3(0.006f, 0.17f, 0.21f), new Vector3(-0.137f, 0.085f, 0)) })
            RBox(carton, size, pos, card, 0.002f);
        foreach (var (z, rx) in new[] { (0.15f, -40f), (-0.15f, 40f) })
            RBox(carton, new Vector3(0.28f, 0.004f, 0.1f), new Vector3(0, 0.19f, z), card, 0.001f).RotationDegrees = new Vector3(rx, 0, 0);
        foreach (var (x, rz) in new[] { (0.18f, 50f), (-0.18f, -50f) })
            RBox(carton, new Vector3(0.1f, 0.004f, 0.2f), new Vector3(x, 0.19f, 0), card, 0.001f).RotationDegrees = new Vector3(0, 0, rz);
        Target(carton, "carton", new Vector3(0.32f, 0.22f, 0.26f), new Vector3(0, 0.1f, 0));
        envelope = new Node3D { Position = new Vector3(0.72f, DeskY + 0.006f, -1.28f), RotationDegrees = new Vector3(0, 12, 0) };
        AddChild(envelope);
        var manila = Grain(new Color(0.76f, 0.63f, 0.42f), new Vector3(8, 8, 1), 0.9f, 0.3f, 13, 0.2f);
        RBox(envelope, new Vector3(0.24f, 0.012f, 0.12f), Vector3.Zero, manila, 0.004f);
        RBox(envelope, new Vector3(0.24f, 0.002f, 0.05f), new Vector3(0, 0.007f, -0.035f), manila.Duplicate() as Material ?? manila, 0.001f);
        Target(envelope, "carton", new Vector3(0.26f, 0.06f, 0.14f), Vector3.Zero);
        SoundAt["carton"] = carton.Position;

        // sealed cartons stacked on the floor to the right of the desk
        var sealedMat = Grain(new Color(0.5f, 0.37f, 0.22f), new Vector3(6, 6, 1), 0.95f, 0.4f, 14, 0.35f);
        var tape = Mat(new Color(0.72f, 0.62f, 0.42f), 0.35f);
        var label = Painted(PaperImage(31, 6, true), new Vector3(1 / 0.1f, 1 / 0.07f, 1), 0.9f, 0);
        for (var i = 0; i < Night.Cartons; i++)
        {
            var g = new Node3D();
            RBox(g, new Vector3(0.34f, 0.24f, 0.26f), new Vector3(0, 0.12f, 0), sealedMat, 0.008f);
            RBox(g, new Vector3(0.345f, 0.003f, 0.05f), new Vector3(0, 0.2405f, 0), tape, 0.001f, false);
            RBox(g, new Vector3(0.003f, 0.05f, 0.05f), new Vector3(0.1715f, 0.215f, 0), tape, 0.001f, false);
            RBox(g, new Vector3(0.1f, 0.07f, 0.002f), new Vector3(0.06f, 0.12f, 0.131f), label, 0.0005f, false);
            var col = i % 4;
            var level = i / 4;
            g.Position = new Vector3(1.18f + col % 2 * 0.37f, level * 0.245f, -1.0f + col / 2 * 0.3f);
            g.RotationDegrees = new Vector3(0, (i * 37 % 7 - 3) * 1.5f, 0);
            g.Visible = false;
            AddChild(g);
            sealedCartons.Add(g);
        }
    }

    static ArrayMesh ClipMesh()
    {
        // a No. 1 gem clip, a little over three centimetres long
        const float s = 0.022f;
        var pts = new (float x, float y)[] { (0, 0.6f), (0, -0.7f), (0.16f, -0.95f), (0.34f, -0.7f), (0.34f, 0.8f), (0.6f, 1.05f), (0.8f, 0.8f), (0.8f, -0.95f), (1f, -1.15f), (1.16f, -0.95f), (1.16f, 0.45f) };
        var path = new List<Vector3>();
        for (var i = 0; i < pts.Length - 1; i++)
            for (var k = 0; k < 4; k++)
            {
                var u = k / 4f;
                path.Add(new Vector3((Mathf.Lerp(pts[i].x, pts[i + 1].x, u) - 0.58f) * s, 0, Mathf.Lerp(pts[i].y, pts[i + 1].y, u) * s));
            }
        path.Add(new Vector3((pts[^1].x - 0.58f) * s, 0, pts[^1].y * s));
        return Tube(path.ToArray(), 0.0013f, 6);
    }

    /// <summary>A clip drops off the cutter and slides into the tray.</summary>
    public void DropClip()
    {
        var node = new Node3D();
        node.AddChild(new MeshInstance3D { Mesh = clipMesh, MaterialOverride = clipMat });
        AddChild(node);
        var from = bender.ToGlobal(new Vector3(0, 0.1f, -0.02f));
        var to = tray.ToGlobal(new Vector3((float)GD.RandRange(-0.08, 0.08), 0.03f, (float)GD.RandRange(-0.05, 0.05)));
        node.GlobalPosition = from;
        falling.Add((node, from, to, 0));
    }

    void SyncWorkbench(Night n, HandWork hands, float dt)
    {
        // the hand bender
        hands.SnipT = Mathf.Min(1, hands.SnipT + dt * 5);
        hands.FeedT = Mathf.Min(1, hands.FeedT + dt * 3);
        hands.BendT = Mathf.Min(1, hands.BendT + dt * 4);
        // the lever follows the player's drag; once a pair is bent it stays latched down until it is snipped, then
        // springs back up, so the bender shows at a glance whether it is waiting for the cutter
        var target = Mathf.Max(hands.Lever, hands.Bent ? 0.8f : hands.BendT < 1 ? Mathf.Sin(hands.BendT * Mathf.Pi) : 0);
        leverShown = target > leverShown ? target : Mathf.MoveToward(leverShown, target, dt * 7);
        lever.Rotation = new Vector3(Mathf.DegToRad(-28 + leverShown * 50), 0, 0);
        loadedWire.Visible = hands.Loaded > 0;
        // the fed wire slides in, and gets shorter with each clip
        var len = hands.Loaded * 0.018f * Mathf.Min(1, 0.4f + hands.FeedT * 0.6f);
        loadedWire.Scale = new Vector3(Mathf.Max(0.001f, len), 1, 1);
        bentClip.Visible = hands.Bent;
        bentClip.GetNode<Node3D>("Second").Visible = hands.BentCount > 1;
        cutterJaw.Rotation = new Vector3(Mathf.DegToRad(-Mathf.Sin(hands.SnipT * Mathf.Pi) * 25), 0, 0);
        SetTarget(benderTarget, !n.Capped);
        SetTarget(coilTarget, !n.Capped);

        // clips falling into the tray
        for (var i = falling.Count - 1; i >= 0; i--)
        {
            var (node, from, to, ft) = falling[i];
            ft += dt * 3.2f;
            var p = from.Lerp(to, ft);
            p.Y += Mathf.Sin(ft * Mathf.Pi) * 0.04f;
            node.GlobalPosition = p;
            node.Rotation = new Vector3(ft * 5, ft * 9, 0);
            if (ft >= 1)
            {
                node.QueueFree();
                falling.RemoveAt(i);
            }
            else falling[i] = (node, from, to, ft);
        }

        // clips on the desk, sealed cartons on the floor, the trial run's envelope
        var loose = Math.Max(0, n.Loose - falling.Count);
        clips.Multimesh.VisibleInstanceCount = Math.Min(MaxClips, loose <= 150 ? loose : (int)Math.Round(150 + Math.Sqrt(loose - 150) * 15));
        var onFloor = n.Sealed - (n.VanCartons != null && n.VanAt != null && n.Minute >= n.Cfg.VanMinute + 15 ? n.VanCartons.Value : 0);
        for (var i = 0; i < sealedCartons.Count; i++) sealedCartons[i].Visible = i < onFloor;
        envelope.Visible = n.Trial == Trial.Open;
        carton.Visible = n.Trial != Trial.Open && !n.Capped;
    }
}
