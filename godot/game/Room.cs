// The room itself: walls, carpet, ceiling, the window, the door, the filing cabinet, a bookshelf and the small things on the walls.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom
{
    StaticBody3D cabinetTarget = null!;
    OmniLight3D cabinetHint = null!;
    Node3D cabinetDrawer = null!, spareCoil = null!;
    float drawerOpen;

    void BuildRoom()
    {
        var floorMat = Painted(CarpetImage(new Color(0.2f, 0.19f, 0.2f)), new Vector3(2, 2, 1), 1f, 0.5f, 3, 0.4f);
        var wallMat = Grain(new Color(0.24f, 0.32f, 0.35f), new Vector3(1.5f, 1.5f, 1), 0.93f, 0.12f, 5, 0.12f, 0, 0.35f);
        var ceilMat = Painted(CeilingImage(), new Vector3(1 / 0.6f, 1 / 0.6f, 1), 0.95f, 0.2f, 8, 0.3f);
        var trim = Mat(new Color(0.1f, 0.11f, 0.12f), 0.6f);
        float w = X1 - X0, d = Z1 - Z0;
        RBox(this, new Vector3(w, 0.04f, d), new Vector3(0, -0.02f, 0), floorMat, 0.001f);
        RBox(this, new Vector3(w, 0.04f, d), new Vector3(0, H + 0.02f, 0), ceilMat, 0.001f);
        RBox(this, new Vector3(w, H, 0.06f), new Vector3(0, H / 2, Z0 - 0.03f), wallMat, 0.001f);
        RBox(this, new Vector3(w, H, 0.06f), new Vector3(0, H / 2, Z1 + 0.03f), wallMat, 0.001f);
        RBox(this, new Vector3(0.06f, H, d), new Vector3(X1 + 0.03f, H / 2, 0), wallMat, 0.001f);
        void Left(float z0, float z1, float y0, float y1) => RBox(this, new Vector3(0.06f, y1 - y0, z1 - z0), new Vector3(X0 - 0.03f, (y0 + y1) / 2, (z0 + z1) / 2), wallMat, 0.001f);
        Left(Z0, WinZ0, 0, H);
        Left(WinZ1, Z1, 0, H);
        Left(WinZ0, WinZ1, 0, WinY0);
        Left(WinZ0, WinZ1, WinY1, H);
        // skirting and a picture rail
        foreach (var (size, pos) in new[]
                 {
                     (new Vector3(w, 0.1f, 0.025f), new Vector3(0, 0.05f, Z0 + 0.012f)),
                     (new Vector3(w, 0.1f, 0.025f), new Vector3(0, 0.05f, Z1 - 0.012f)),
                     (new Vector3(0.025f, 0.1f, d), new Vector3(X1 - 0.012f, 0.05f, 0)),
                     (new Vector3(0.025f, 0.1f, d), new Vector3(X0 + 0.012f, 0.05f, 0)),
                     (new Vector3(w, 0.03f, 0.02f), new Vector3(0, 2.2f, Z0 + 0.01f)),
                 })
            RBox(this, size, pos, trim, 0.006f);
        Solid(this, new Vector3(w, H, 0.2f), new Vector3(0, H / 2, Z0 - 0.1f));
        Solid(this, new Vector3(w, H, 0.2f), new Vector3(0, H / 2, Z1 + 0.1f));
        Solid(this, new Vector3(0.2f, H, d), new Vector3(X0 - 0.1f, H / 2, 0));
        Solid(this, new Vector3(0.2f, H, d), new Vector3(X1 + 0.1f, H / 2, 0));
        Solid(this, new Vector3(w, 0.2f, d), new Vector3(0, -0.1f, 0));

        // the overhead light: a fluorescent panel, dim on night power
        ceilingPanel = new StandardMaterial3D { AlbedoColor = new Color(0.8f, 0.86f, 0.9f), EmissionEnabled = true, Emission = new Color(0.75f, 0.85f, 0.95f), EmissionEnergyMultiplier = 0.9f };
        RBox(this, new Vector3(1.2f, 0.05f, 0.6f), new Vector3(0, H - 0.025f, -0.5f), Mat(new Color(0.55f, 0.55f, 0.53f), 0.5f, 0.4f), 0.01f);
        RBox(this, new Vector3(1.1f, 0.01f, 0.5f), new Vector3(0, H - 0.052f, -0.5f), ceilingPanel, 0.003f, false);
        ceilingLight = new OmniLight3D { LightColor = new Color(0.7f, 0.8f, 0.95f), LightEnergy = 0.55f, OmniRange = 5.5f, OmniAttenuation = 1.3f, Position = new Vector3(0, H - 0.3f, -0.5f), LightVolumetricFogEnergy = 0.2f };
        AddChild(ceilingLight);

        // the window: frame, mullions, sill, glass, blinds
        var frame = Mat(new Color(0.16f, 0.15f, 0.13f), 0.5f, 0.2f);
        float zc = (WinZ0 + WinZ1) / 2, zw = WinZ1 - WinZ0, wh = WinY1 - WinY0;
        RBox(this, new Vector3(0.26f, 0.045f, zw + 0.14f), new Vector3(X0 + 0.07f, WinY0 - 0.022f, zc), Grain(new Color(0.55f, 0.52f, 0.47f), new Vector3(2, 2, 1), 0.6f, 0.05f, 31, 0.2f), 0.01f);
        RBox(this, new Vector3(0.09f, 0.06f, zw + 0.12f), new Vector3(X0 + 0.005f, WinY1 + 0.03f, zc), frame, 0.008f);
        RBox(this, new Vector3(0.09f, wh, 0.06f), new Vector3(X0 + 0.005f, (WinY0 + WinY1) / 2, WinZ0 - 0.03f), frame, 0.008f);
        RBox(this, new Vector3(0.09f, wh, 0.06f), new Vector3(X0 + 0.005f, (WinY0 + WinY1) / 2, WinZ1 + 0.03f), frame, 0.008f);
        RBox(this, new Vector3(0.06f, wh, 0.035f), new Vector3(X0, (WinY0 + WinY1) / 2, zc), frame, 0.006f);
        RBox(this, new Vector3(0.06f, 0.035f, zw), new Vector3(X0, WinY0 + wh * 0.62f, zc), frame, 0.006f);
        var glass = new StandardMaterial3D
        {
            AlbedoColor = new Color(0.55f, 0.65f, 0.72f, 0.07f),
            Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
            Roughness = 0.04f,
            Metallic = 0.3f,
        };
        Box(this, new Vector3(0.01f, wh, zw), new Vector3(X0 - 0.02f, (WinY0 + WinY1) / 2, zc), glass, false);
        var blind = Mat(new Color(0.62f, 0.6f, 0.55f), 0.7f, 0.1f);
        for (var i = 0; i < 10; i++)
        {
            var slat = RBox(this, new Vector3(0.05f, 0.004f, zw - 0.04f), new Vector3(X0 + 0.08f, WinY1 - 0.04f - i * 0.034f, zc), blind, 0.0015f);
            slat.RotationDegrees = new Vector3(0, 0, 35);
        }
        RBox(this, new Vector3(0.06f, 0.035f, zw), new Vector3(X0 + 0.08f, WinY1 - 0.38f, zc), blind, 0.008f);
        // a plant on the sill
        var potMat = Grain(new Color(0.42f, 0.22f, 0.13f), new Vector3(4, 4, 1), 0.85f, 0.1f, 41, 0.3f);
        Lathe(this, new[] { (0f, 0f), (0.045f, 0f), (0.06f, 0.11f), (0.066f, 0.115f), (0.064f, 0.12f), (0.05f, 0.1f), (0f, 0.1f) }, new Vector3(X0 + 0.09f, WinY0, WinZ1 - 0.22f), potMat);
        var leafMat = new StandardMaterial3D { AlbedoColor = new Color(0.14f, 0.26f, 0.12f), Roughness = 0.7f, CullMode = BaseMaterial3D.CullModeEnum.Disabled };
        var rng = new Random(12);
        for (var i = 0; i < 14; i++)
        {
            var a = i * 2.4f;
            var lean = 0.35f + (float)rng.NextDouble() * 0.5f;
            var leaf = new MeshInstance3D { Mesh = new QuadMesh { Size = new Vector2(0.05f, 0.16f) }, MaterialOverride = leafMat };
            leaf.Position = new Vector3(X0 + 0.09f + Mathf.Cos(a) * 0.02f, WinY0 + 0.17f, WinZ1 - 0.22f + Mathf.Sin(a) * 0.02f);
            leaf.Rotation = new Vector3(lean, a, 0);
            leaf.Translate(new Vector3(0, 0.06f, 0));
            AddChild(leaf);
        }

        // on the walls: a calendar, sticky notes, a clock, a framed notice
        var calendar = Painted(PaperImage(21, 30, true), new Vector3(1 / 0.36f, 1 / 0.48f, 1), 0.95f, 0);
        RBox(this, new Vector3(0.36f, 0.48f, 0.006f), new Vector3(0.62f, 1.6f, Z0 + 0.004f), calendar, 0.001f, false);
        for (var i = 0; i < 6; i++)
        {
            var n = RBox(this, new Vector3(0.075f, 0.075f, 0.003f), new Vector3(1.05f + i % 3 * 0.095f, 1.35f + i / 3 * 0.095f, Z0 + 0.003f), Mat(i % 2 == 0 ? new Color(0.88f, 0.78f, 0.4f) : new Color(0.8f, 0.64f, 0.56f), 0.95f), 0.001f, false);
            n.RotationDegrees = new Vector3(0, 0, (i - 2.5f) * 4);
        }
        var clock = new Node3D { Position = new Vector3(-0.95f, 2.05f, Z0 + 0.03f), RotationDegrees = new Vector3(90, 0, 0) };
        AddChild(clock);
        Cyl(clock, 0.15f, 0.15f, 0.04f, Vector3.Zero, Mat(new Color(0.12f, 0.12f, 0.12f), 0.4f, 0.5f), 40);
        Cyl(clock, 0.135f, 0.135f, 0.042f, Vector3.Zero, Mat(new Color(0.85f, 0.83f, 0.76f), 0.6f), 40);
        clockHands = new Node3D { Position = new Vector3(-0.95f, 2.05f, Z0 + 0.055f) };
        AddChild(clockHands);
        var handMat = Mat(new Color(0.08f, 0.08f, 0.08f), 0.5f);
        hourHand = RBox(clockHands, new Vector3(0.008f, 0.07f, 0.003f), new Vector3(0, 0.03f, 0), handMat, 0.001f);
        minuteHand = RBox(clockHands, new Vector3(0.005f, 0.11f, 0.003f), new Vector3(0, 0.05f, 0.003f), handMat, 0.001f);
        var notice = Painted(PaperImage(7, 18, true), new Vector3(1 / 0.21f, 1 / 0.29f, 1), 0.9f, 0);
        RBox(this, new Vector3(0.006f, 0.32f, 0.25f), new Vector3(X1 - 0.004f, 1.55f, 0.15f), Mat(new Color(0.15f, 0.12f, 0.09f), 0.5f), 0.003f);
        var noticeFace = RBox(this, new Vector3(0.29f, 0.21f, 0.002f), new Vector3(X1 - 0.009f, 1.55f, 0.15f), notice, 0.0005f, false);
        noticeFace.RotationDegrees = new Vector3(0, -90, 90);

        // the door in the right wall, in its frame
        var doorWood = Grain(new Color(0.3f, 0.21f, 0.13f), new Vector3(1.5f, 10, 1), 0.55f, 0.04f, 9, 0.3f);
        RBox(this, new Vector3(0.05f, 2.05f, 0.9f), new Vector3(X1 - 0.025f, 1.025f, 1.2f), doorWood, 0.008f);
        var jamb = Mat(new Color(0.14f, 0.13f, 0.12f), 0.5f);
        RBox(this, new Vector3(0.07f, 0.06f, 1.02f), new Vector3(X1 - 0.03f, 2.08f, 1.2f), jamb, 0.008f);
        RBox(this, new Vector3(0.07f, 2.1f, 0.06f), new Vector3(X1 - 0.03f, 1.05f, 0.72f), jamb, 0.008f);
        RBox(this, new Vector3(0.07f, 2.1f, 0.06f), new Vector3(X1 - 0.03f, 1.05f, 1.68f), jamb, 0.008f);
        var brass = Mat(new Color(0.62f, 0.52f, 0.32f), 0.3f, 0.9f);
        Ball(this, 0.03f, new Vector3(X1 - 0.07f, 1.0f, 0.84f), brass);
        RBox(this, new Vector3(0.02f, 0.02f, 0.1f), new Vector3(X1 - 0.09f, 1.0f, 0.88f), brass, 0.008f);

        // the filing cabinet, back right: the spare coil is in the bottom drawer
        var cab = new Node3D { Position = new Vector3(1.75f, 0, -1.68f) };
        AddChild(cab);
        var cabMat = Grain(new Color(0.42f, 0.42f, 0.38f), new Vector3(3, 3, 1), 0.45f, 0.2f, 51, 0.12f, 0.45f);
        var drawerMat = Grain(new Color(0.46f, 0.46f, 0.41f), new Vector3(3, 3, 1), 0.42f, 0.2f, 52, 0.12f, 0.45f);
        var chrome = Mat(new Color(0.72f, 0.72f, 0.7f), 0.25f, 0.95f);
        RBox(cab, new Vector3(0.5f, 1.32f, 0.6f), new Vector3(0, 0.66f, 0), cabMat, 0.012f);
        for (var i = 0; i < 4; i++)
        {
            var drawer = new Node3D { Position = new Vector3(0, 0.17f + i * 0.32f, 0.3f) };
            cab.AddChild(drawer);
            RBox(drawer, new Vector3(0.46f, 0.29f, 0.02f), Vector3.Zero, drawerMat, 0.008f);
            RBox(drawer, new Vector3(0.14f, 0.022f, 0.03f), new Vector3(0, 0.08f, 0.02f), chrome, 0.008f);
            RBox(drawer, new Vector3(0.07f, 0.035f, 0.004f), new Vector3(0, 0.115f, 0.012f), Mat(new Color(0.85f, 0.82f, 0.72f), 0.9f), 0.001f, false);
            if (i == 0)
            {
                cabinetDrawer = drawer;
                // the drawer's box, seen when it slides open, and the spare coil inside
                RBox(drawer, new Vector3(0.42f, 0.24f, 0.5f), new Vector3(0, 0, -0.26f), cabMat, 0.004f);
                spareCoil = new Node3D { Position = new Vector3(0, 0.03f, -0.2f) };
                drawer.AddChild(spareCoil);
                var copper = Mat(new Color(0.62f, 0.42f, 0.28f), 0.3f, 0.9f);
                for (var k = 0; k < 7; k++)
                {
                    var ring = new MeshInstance3D { Mesh = Torus(0.09f, 0.008f, 32, 8), MaterialOverride = copper, Position = new Vector3(0, -0.05f + k * 0.014f, 0) };
                    spareCoil.AddChild(ring);
                }
            }
        }
        Solid(cab, new Vector3(0.5f, 1.32f, 0.6f), new Vector3(0, 0.66f, 0));
        cabinetTarget = Target(cab, "cabinet", new Vector3(0.48f, 0.34f, 0.1f), new Vector3(0, 0.17f, 0.32f));
        cabinetHint = new OmniLight3D { LightColor = new Color(1f, 0.8f, 0.5f), LightEnergy = 0, OmniRange = 0.6f, Position = new Vector3(0, 0.25f, 0.5f) };
        cab.AddChild(cabinetHint);
        SoundAt["cabinet"] = cab.Position + new Vector3(0, 0.2f, 0.3f);
        // binders and a box file on top
        var binderColors = new[] { new Color(0.18f, 0.24f, 0.36f), new Color(0.38f, 0.14f, 0.12f), new Color(0.2f, 0.3f, 0.2f), new Color(0.3f, 0.3f, 0.32f) };
        for (var i = 0; i < 4; i++)
        {
            var b = RBox(cab, new Vector3(0.06f, 0.3f, 0.26f), new Vector3(-0.17f + i * 0.065f, 1.47f, -0.05f), Grain(binderColors[i], new Vector3(6, 6, 1), 0.7f, 0.2f, 60 + i, 0.15f), 0.006f);
            b.RotationDegrees = new Vector3(0, 0, i == 3 ? -12 : 0);
        }

        // a low bookshelf against the right wall, by the door
        var shelf = new Node3D { Position = new Vector3(X1 - 0.18f, 0, -0.35f), RotationDegrees = new Vector3(0, -90, 0) };
        AddChild(shelf);
        var shelfWood = Grain(new Color(0.24f, 0.17f, 0.11f), new Vector3(2, 10, 1), 0.6f, 0.04f, 71, 0.3f);
        RBox(shelf, new Vector3(0.9f, 0.02f, 0.32f), new Vector3(0, 0.02f, 0), shelfWood, 0.004f);
        RBox(shelf, new Vector3(0.9f, 0.02f, 0.32f), new Vector3(0, 0.44f, 0), shelfWood, 0.004f);
        RBox(shelf, new Vector3(0.9f, 0.025f, 0.32f), new Vector3(0, 0.86f, 0), shelfWood, 0.004f);
        RBox(shelf, new Vector3(0.02f, 0.87f, 0.32f), new Vector3(-0.44f, 0.435f, 0), shelfWood, 0.004f);
        RBox(shelf, new Vector3(0.02f, 0.87f, 0.32f), new Vector3(0.44f, 0.435f, 0), shelfWood, 0.004f);
        RBox(shelf, new Vector3(0.9f, 0.87f, 0.01f), new Vector3(0, 0.435f, -0.155f), shelfWood, 0.002f);
        var bookRng = new Random(8);
        foreach (var y in new[] { 0.03f, 0.45f })
        {
            var x = -0.41f;
            while (x < 0.38f)
            {
                var bw = 0.03f + (float)bookRng.NextDouble() * 0.04f;
                var bh = 0.26f + (float)bookRng.NextDouble() * 0.12f;
                var col = new Color(0.15f + (float)bookRng.NextDouble() * 0.3f, 0.12f + (float)bookRng.NextDouble() * 0.2f, 0.1f + (float)bookRng.NextDouble() * 0.2f);
                RBox(shelf, new Vector3(bw, bh, 0.24f), new Vector3(x + bw / 2, y + bh / 2, 0.01f), Mat(col, 0.75f), 0.004f);
                x += bw + 0.004f;
                if (bookRng.NextDouble() < 0.1) x += 0.06f;
            }
        }
        Solid(shelf, new Vector3(0.9f, 0.88f, 0.32f), new Vector3(0, 0.44f, 0));

        // the back of the room: a second dim panel, a table with an old printer, a coat stand, a corkboard, the light switch
        RBox(this, new Vector3(1.2f, 0.05f, 0.6f), new Vector3(0, H - 0.025f, 1.1f), Mat(new Color(0.55f, 0.55f, 0.53f), 0.5f, 0.4f), 0.01f);
        RBox(this, new Vector3(1.1f, 0.01f, 0.5f), new Vector3(0, H - 0.052f, 1.1f), ceilingPanel, 0.003f, false);
        backLight = new OmniLight3D { LightColor = new Color(0.7f, 0.8f, 0.95f), LightEnergy = 0.35f, OmniRange = 4f, OmniAttenuation = 1.3f, Position = new Vector3(0, H - 0.3f, 1.1f), LightVolumetricFogEnergy = 0.1f };
        AddChild(backLight);
        var table = new Node3D { Position = new Vector3(-0.9f, 0, Z1 - 0.3f) };
        AddChild(table);
        var tableTop = Grain(new Color(0.42f, 0.4f, 0.36f), new Vector3(3, 3, 1), 0.6f, 0.2f, 141, 0.15f, 0, 0.5f);
        var legMat = Mat(new Color(0.2f, 0.2f, 0.2f), 0.4f, 0.7f);
        RBox(table, new Vector3(0.9f, 0.03f, 0.5f), new Vector3(0, 0.72f, 0), tableTop, 0.008f);
        foreach (var (lx, lz) in new[] { (-0.42f, -0.22f), (0.42f, -0.22f), (-0.42f, 0.22f), (0.42f, 0.22f) })
            RBox(table, new Vector3(0.03f, 0.71f, 0.03f), new Vector3(lx, 0.355f, lz), legMat, 0.008f);
        Solid(table, new Vector3(0.9f, 0.75f, 0.5f), new Vector3(0, 0.375f, 0));
        var printerMat = Grain(new Color(0.6f, 0.57f, 0.5f), new Vector3(20, 20, 1), 0.55f, 0.5f, 142, 0.1f);
        RBox(table, new Vector3(0.46f, 0.2f, 0.36f), new Vector3(-0.1f, 0.835f, 0.02f), printerMat, 0.02f);
        RBox(table, new Vector3(0.36f, 0.01f, 0.18f), new Vector3(-0.1f, 0.95f, 0.05f), Mat(new Color(0.18f, 0.18f, 0.17f), 0.6f), 0.004f);
        RBox(table, new Vector3(0.3f, 0.004f, 0.2f), new Vector3(-0.1f, 0.85f, -0.22f), Painted(PaperImage(55, 14), new Vector3(1 / 0.3f, 1 / 0.2f, 1), 0.9f, 0), 0.001f, false).RotationDegrees = new Vector3(-20, 0, 0);
        Ball(table, 0.006f, new Vector3(0.1f, 0.9f, -0.16f), Glow(new Color(1f, 0.6f, 0.2f), 3));
        for (var i = 0; i < 3; i++)
            RBox(table, new Vector3(0.24f, 0.06f, 0.32f), new Vector3(0.28f, 0.765f + i * 0.062f, 0), Grain(new Color(0.75f, 0.73f, 0.68f), new Vector3(8, 8, 1), 0.9f, 0.3f, 143 + i, 0.1f), 0.006f);
        var coat = new Node3D { Position = new Vector3(X1 - 0.3f, 0, Z1 - 0.3f) };
        AddChild(coat);
        var dark = Mat(new Color(0.1f, 0.08f, 0.06f), 0.5f, 0.2f);
        Cyl(coat, 0.012f, 0.014f, 1.75f, new Vector3(0, 0.875f, 0), dark, 12);
        for (var i = 0; i < 3; i++)
        {
            var a = i * Mathf.Tau / 3;
            Rod(coat, new Vector3(0, 0.05f, 0), new Vector3(Mathf.Cos(a) * 0.25f, 0.005f, Mathf.Sin(a) * 0.25f), 0.01f, dark, 8);
            Rod(coat, new Vector3(0, 1.62f, 0), new Vector3(Mathf.Cos(a + 0.5f) * 0.12f, 1.72f, Mathf.Sin(a + 0.5f) * 0.12f), 0.007f, dark, 8);
        }
        // a scarf someone left behind
        var scarf = new List<Vector3>();
        for (var i = 0; i <= 24; i++) scarf.Add(new Vector3(0.09f + Mathf.Sin(i * 0.4f) * 0.02f, 1.7f - i * 0.03f, 0.06f + Mathf.Cos(i * 0.3f) * 0.02f));
        TubeNode(coat, scarf.ToArray(), 0.025f, Grain(new Color(0.42f, 0.12f, 0.1f), new Vector3(30, 30, 1), 0.95f, 0.8f, 144, 0.5f), 8);
        Solid(coat, new Vector3(0.3f, 1.8f, 0.3f), new Vector3(0, 0.9f, 0));
        var cork = Grain(new Color(0.55f, 0.4f, 0.25f), new Vector3(30, 30, 1), 0.95f, 1.2f, 145, 0.5f);
        RBox(this, new Vector3(0.9f, 0.6f, 0.02f), new Vector3(0.6f, 1.5f, Z1 - 0.01f), Mat(new Color(0.2f, 0.15f, 0.1f), 0.5f), 0.005f);
        RBox(this, new Vector3(0.84f, 0.54f, 0.01f), new Vector3(0.6f, 1.5f, Z1 - 0.02f), cork, 0.002f);
        var pinRng = new Random(31);
        for (var i = 0; i < 6; i++)
        {
            var px = 0.3f + (float)pinRng.NextDouble() * 0.6f;
            var py = 1.33f + (float)pinRng.NextDouble() * 0.34f;
            var note = RBox(this, new Vector3(0.12f, 0.15f, 0.002f), new Vector3(px, py, Z1 - 0.027f), Painted(PaperImage(80 + i, 10), new Vector3(1 / 0.12f, 1 / 0.15f, 1), 0.9f, 0), 0.0005f, false);
            note.RotationDegrees = new Vector3(0, 180, (float)(pinRng.NextDouble() - 0.5) * 12);
            Ball(this, 0.006f, new Vector3(px, py + 0.06f, Z1 - 0.03f), Mat(i % 2 == 0 ? new Color(0.7f, 0.1f, 0.1f) : new Color(0.1f, 0.3f, 0.7f), 0.4f));
        }
        RBox(this, new Vector3(0.012f, 0.12f, 0.08f), new Vector3(X1 - 0.006f, 1.2f, 0.6f), Mat(new Color(0.8f, 0.78f, 0.72f), 0.6f), 0.004f);
        RBox(this, new Vector3(0.012f, 0.03f, 0.016f), new Vector3(X1 - 0.014f, 1.2f, 0.6f), Mat(new Color(0.85f, 0.83f, 0.77f), 0.5f), 0.003f);

        // a wastebasket of crumpled paper
        Lathe(this, new[] { (0f, 0.005f), (0.12f, 0.005f), (0.15f, 0.32f), (0.145f, 0.32f), (0.115f, 0.012f), (0f, 0.012f) }, new Vector3(1.05f, 0, -1.62f), Mat(new Color(0.16f, 0.16f, 0.17f), 0.5f, 0.6f), 28);
        var crumple = Mat(new Color(0.78f, 0.76f, 0.7f), 0.95f);
        for (var i = 0; i < 4; i++) Ball(this, 0.04f, new Vector3(1.05f + Mathf.Cos(i * 1.7f) * 0.05f, 0.27f + i % 2 * 0.03f, -1.62f + Mathf.Sin(i * 1.7f) * 0.05f), crumple);
    }

    Node3D clockHands = null!;
    OmniLight3D backLight = null!;
    MeshInstance3D hourHand = null!, minuteHand = null!;

    void SyncRoom(Night n, float dt)
    {
        // the wall clock keeps the night's time
        var minutes = n.StorySeconds / 60 + 23 * 60 + 47;
        hourHand.Rotation = new Vector3(0, 0, -(float)(minutes / 720 * Mathf.Tau));
        hourHand.Position = new Vector3(Mathf.Sin((float)(minutes / 720 * Mathf.Tau)) * 0.03f, Mathf.Cos((float)(minutes / 720 * Mathf.Tau)) * 0.03f, 0);
        minuteHand.Rotation = new Vector3(0, 0, -(float)(minutes % 60 / 60 * Mathf.Tau));
        minuteHand.Position = new Vector3(Mathf.Sin((float)(minutes % 60 / 60 * Mathf.Tau)) * 0.05f, Mathf.Cos((float)(minutes % 60 / 60 * Mathf.Tau)) * 0.05f, 0.003f);

        // the spare coil's drawer stands open once there is a reason to look in it
        var want = n.SpareOffered ? 1f : 0f;
        drawerOpen = Mathf.MoveToward(drawerOpen, want, dt * 1.5f);
        cabinetDrawer.Position = new Vector3(0, 0.17f, 0.3f + drawerOpen * 0.22f);
        spareCoil.Visible = !n.SpareTaken;
        cabinetHint.LightEnergy = n.SpareOffered ? 0.35f + 0.2f * (float)Math.Sin(t * 3) : 0;
        SetTarget(cabinetTarget, n.SpareOffered);
    }
}
