// The desk and what is on it: the CRT terminal, the keyboard, the lamp that turns toward the machine, the phone,
// Mara's mug and the photograph, papers, and the chair.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom
{
    Node3D lampHead = null!;
    SpotLight3D lampLight = null!;
    OmniLight3D lampFill = null!;
    Vector3 aim;
    static readonly Vector3 AimAway = new(-0.42f, DeskY, -1.4f);
    static readonly Vector3 AimMachine = new(0.22f, DeskY, -1.6f);
    Label screenText = null!;
    OmniLight3D screenLight = null!;
    Node3D phone = null!, handset = null!;
    StaticBody3D phoneTarget = null!;
    public SubViewport ScreenViewport { get; private set; } = null!;
    /// <summary>The monitor's screen, in the room: upgrades fly from here to where they go.</summary>
    public Vector3 ScreenAt { get; private set; }

    void BuildDesk()
    {
        var wood = Grain(new Color(0.3f, 0.2f, 0.12f), new Vector3(1.2f, 9, 1), 0.42f, 0.05f, 7, 0.35f);
        var dark = Grain(new Color(0.14f, 0.1f, 0.07f), new Vector3(2, 8, 1), 0.6f, 0.05f, 8, 0.25f);
        var brass = Mat(new Color(0.6f, 0.5f, 0.3f), 0.3f, 0.9f);
        // the top, with a leather writing pad
        RBox(this, new Vector3(1.9f, 0.045f, 0.82f), new Vector3(0, DeskY - 0.022f, -1.6f), wood, 0.012f);
        RBox(this, new Vector3(0.62f, 0.004f, 0.36f), new Vector3(-0.3f, DeskY + 0.002f, -1.42f), Grain(new Color(0.12f, 0.16f, 0.13f), new Vector3(6, 6, 1), 0.75f, 0.3f, 15, 0.4f), 0.002f, false);
        // a drawer pedestal on the right, a panel on the left, a modesty panel at the back
        RBox(this, new Vector3(0.46f, DeskY - 0.05f, 0.74f), new Vector3(0.66f, (DeskY - 0.05f) / 2, -1.62f), dark, 0.01f);
        foreach (var y in new[] { 0.16f, 0.4f, 0.62f })
        {
            RBox(this, new Vector3(0.42f, y < 0.3f ? 0.26f : 0.2f, 0.012f), new Vector3(0.66f, y, -1.247f), dark, 0.004f);
            RBox(this, new Vector3(0.12f, 0.016f, 0.02f), new Vector3(0.66f, y + 0.04f, -1.235f), brass, 0.006f);
        }
        RBox(this, new Vector3(0.04f, DeskY - 0.05f, 0.7f), new Vector3(-0.92f, (DeskY - 0.05f) / 2, -1.62f), dark, 0.008f);
        RBox(this, new Vector3(1.4f, 0.32f, 0.02f), new Vector3(-0.2f, DeskY - 0.21f, -1.96f), dark, 0.004f);
        Solid(this, new Vector3(1.9f, DeskY, 0.82f), new Vector3(0, DeskY / 2, -1.6f));

        // the chair, pushed back from the desk
        var chair = new Node3D { Position = new Vector3(0.85f, 0, -0.7f), RotationDegrees = new Vector3(0, -40, 0) };
        AddChild(chair);
        var fabric = Grain(new Color(0.12f, 0.12f, 0.14f), new Vector3(20, 20, 1), 0.95f, 0.6f, 81, 0.5f);
        var black = Mat(new Color(0.06f, 0.06f, 0.06f), 0.4f, 0.5f);
        RBox(chair, new Vector3(0.5f, 0.08f, 0.48f), new Vector3(0, 0.48f, 0), fabric, 0.035f);
        var back = RBox(chair, new Vector3(0.46f, 0.56f, 0.07f), new Vector3(0, 0.86f, 0.25f), fabric, 0.03f);
        back.RotationDegrees = new Vector3(-8, 0, 0);
        RBox(chair, new Vector3(0.05f, 0.3f, 0.05f), new Vector3(0, 0.62f, 0.25f), black, 0.01f);
        Cyl(chair, 0.025f, 0.03f, 0.36f, new Vector3(0, 0.26f, 0), Mat(new Color(0.3f, 0.3f, 0.3f), 0.25f, 0.9f), 16);
        foreach (var side in new[] { -1, 1 })
        {
            RBox(chair, new Vector3(0.04f, 0.03f, 0.3f), new Vector3(side * 0.27f, 0.68f, 0.02f), black, 0.01f);
            RBox(chair, new Vector3(0.025f, 0.18f, 0.025f), new Vector3(side * 0.27f, 0.58f, 0.08f), black, 0.008f);
        }
        for (var i = 0; i < 5; i++)
        {
            var a = i * Mathf.Tau / 5;
            var leg = RBox(chair, new Vector3(0.3f, 0.035f, 0.045f), new Vector3(Mathf.Cos(a) * 0.15f, 0.07f, Mathf.Sin(a) * 0.15f), black, 0.012f);
            leg.Rotation = new Vector3(0, -a, 0);
            Ball(chair, 0.025f, new Vector3(Mathf.Cos(a) * 0.29f, 0.025f, Mathf.Sin(a) * 0.29f), black);
        }
        Solid(chair, new Vector3(0.5f, 0.95f, 0.5f), new Vector3(0, 0.47f, 0));

        // the CRT terminal: its screen is a small 2D view rendered into the room
        var monitor = new Node3D { Position = new Vector3(-0.32f, DeskY, -1.76f), RotationDegrees = new Vector3(0, 10, 0) };
        AddChild(monitor);
        var beige = Grain(new Color(0.6f, 0.56f, 0.47f), new Vector3(30, 30, 1), 0.55f, 0.5f, 91, 0.12f);
        RBox(monitor, new Vector3(0.24f, 0.025f, 0.22f), new Vector3(0, 0.012f, 0), beige, 0.01f);
        Cyl(monitor, 0.05f, 0.06f, 0.04f, new Vector3(0, 0.04f, 0), beige, 20);
        RBox(monitor, new Vector3(0.42f, 0.36f, 0.09f), new Vector3(0, 0.24f, 0.13f), beige, 0.025f);
        // the tube's housing tapers to the back
        var housing = new MeshInstance3D
        {
            Mesh = new CylinderMesh { TopRadius = 0.13f, BottomRadius = 0.26f, Height = 0.3f, RadialSegments = 4 },
            MaterialOverride = beige,
            Position = new Vector3(0, 0.24f, -0.06f),
        };
        // point the tapering housing backwards, turned square to the front
        housing.Basis = new Basis(Vector3.Right, -Mathf.Pi / 2) * new Basis(Vector3.Up, Mathf.Pi / 4) * Basis.FromScale(new Vector3(1, 1, 0.82f));
        monitor.AddChild(housing);
        // vents on the top
        for (var i = 0; i < 6; i++) RBox(monitor, new Vector3(0.2f, 0.004f, 0.008f), new Vector3(0, 0.421f, 0.0f - i * 0.025f), Mat(new Color(0.2f, 0.19f, 0.16f), 0.8f), 0.001f, false);
        var vp = new SubViewport { Size = new Vector2I(640, 480), TransparentBg = false, RenderTargetUpdateMode = SubViewport.UpdateMode.Always };
        vp.AddChild(new ColorRect { Color = new Color(0.01f, 0.05f, 0.025f), Size = new Vector2(640, 480) });
        screenText = new Label { Position = new Vector2(44, 40), Size = new Vector2(560, 400) };
        screenText.AddThemeFontSizeOverride("font_size", 50);
        screenText.AddThemeColorOverride("font_color", new Color(0.55f, 1f, 0.68f));
        screenText.AddThemeFontOverride("font", new SystemFont { FontNames = new[] { "DejaVu Sans Mono", "Consolas", "Monospace" } });
        vp.AddChild(screenText);
        // scanlines over the text
        var scan = new TextureRect { Size = new Vector2(640, 480), StretchMode = TextureRect.StretchModeEnum.Tile };
        var lines = Image.CreateEmpty(4, 4, false, Image.Format.Rgba8);
        for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) lines.SetPixel(x, y, new Color(0, 0, 0, y < 2 ? 0.25f : 0));
        scan.Texture = ImageTexture.CreateFromImage(lines);
        vp.AddChild(scan);
        AddChild(vp);
        ScreenViewport = vp;
        // the glass bulges a little, like a real tube
        var screenMesh = new PlaneMesh { Size = new Vector2(0.33f, 0.25f), SubdivideWidth = 8, SubdivideDepth = 8, Orientation = PlaneMesh.OrientationEnum.Z };
        var screenMat = new ShaderMaterial { Shader = GD.Load<Shader>("res://shaders/crt.gdshader") };
        screenMat.SetShaderParameter("screen", vp.GetTexture());
        var screen = new MeshInstance3D { Mesh = screenMesh, MaterialOverride = screenMat, Position = new Vector3(0, 0.245f, 0.176f) };
        monitor.AddChild(screen);
        ScreenAt = monitor.Position + new Vector3(0, 0.25f, 0.2f);
        SoundAt["monitor"] = ScreenAt;
        Ball(monitor, 0.005f, new Vector3(0.17f, 0.085f, 0.176f), Glow(new Color(0.3f, 1f, 0.4f), 3));
        screenLight = new OmniLight3D { LightColor = new Color(0.4f, 1f, 0.6f), LightEnergy = 0.2f, OmniRange = 1.1f, Position = new Vector3(0, 0.25f, 0.55f), LightVolumetricFogEnergy = 0.4f };
        monitor.AddChild(screenLight);
        Target(monitor, "monitor", new Vector3(0.42f, 0.4f, 0.45f), new Vector3(0, 0.24f, 0));
        // its cable runs off the back of the desk
        TubeNode(this, new[] { monitor.Position + new Vector3(0, 0.12f, -0.2f), monitor.Position + new Vector3(0.02f, 0.02f, -0.24f), new Vector3(-0.28f, DeskY + 0.006f, -1.98f), new Vector3(-0.28f, DeskY - 0.1f, -2.0f) }, 0.005f, Mat(new Color(0.08f, 0.08f, 0.08f), 0.6f));

        // the keyboard
        var kb = new Node3D { Position = new Vector3(-0.3f, DeskY, -1.42f), RotationDegrees = new Vector3(4, 6, 0) };
        AddChild(kb);
        RBox(kb, new Vector3(0.45f, 0.03f, 0.16f), new Vector3(0, 0.015f, 0), beige, 0.008f);
        var keys = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, Mesh = RoundBoxMesh(new Vector3(0.024f, 0.012f, 0.024f), 0.004f), InstanceCount = 5 * 14 + 1 };
        var ki = 0;
        for (var r = 0; r < 5; r++)
            for (var k = 0; k < 14; k++)
                keys.SetInstanceTransform(ki++, new Transform3D(Basis.Identity, new Vector3(-0.2f + k * 0.0285f + r % 2 * 0.008f, 0.036f, -0.06f + r * 0.028f)));
        keys.SetInstanceTransform(ki, new Transform3D(Basis.Identity.Scaled(new Vector3(6, 1, 1)), new Vector3(0, 0.036f, 0.085f)));
        kb.AddChild(new MultiMeshInstance3D { Multimesh = keys, MaterialOverride = Mat(new Color(0.66f, 0.63f, 0.55f), 0.6f) });

        // the phone: the courier calls on it
        phone = new Node3D { Position = new Vector3(-0.76f, DeskY, -1.48f), RotationDegrees = new Vector3(0, 24, 0) };
        AddChild(phone);
        var phoneMat = Mat(new Color(0.07f, 0.07f, 0.08f), 0.35f, 0.1f);
        RBox(phone, new Vector3(0.18f, 0.06f, 0.21f), new Vector3(0, 0.03f, 0), phoneMat, 0.02f);
        RBox(phone, new Vector3(0.1f, 0.01f, 0.08f), new Vector3(0, 0.062f, 0.04f), Mat(new Color(0.18f, 0.18f, 0.18f), 0.5f), 0.004f);
        for (var i = 0; i < 12; i++) RBox(phone, new Vector3(0.018f, 0.008f, 0.014f), new Vector3(-0.025f + i % 3 * 0.025f, 0.068f, 0.012f + i / 3 * 0.018f), Mat(new Color(0.75f, 0.73f, 0.68f), 0.6f), 0.003f);
        handset = new Node3D { Position = new Vector3(0, 0.075f, -0.05f) };
        phone.AddChild(handset);
        RBox(handset, new Vector3(0.22f, 0.03f, 0.045f), Vector3.Zero, phoneMat, 0.012f);
        RBox(handset, new Vector3(0.05f, 0.035f, 0.06f), new Vector3(-0.09f, -0.01f, 0), phoneMat, 0.015f);
        RBox(handset, new Vector3(0.05f, 0.035f, 0.06f), new Vector3(0.09f, -0.01f, 0), phoneMat, 0.015f);
        var cord = new List<Vector3>();
        for (var i = 0; i <= 40; i++) cord.Add(new Vector3(-0.09f - 0.004f * i + Mathf.Cos(i * 1.4f) * 0.008f, 0.04f - i * 0.0008f + Mathf.Sin(i * 1.4f) * 0.008f, -0.02f + i * 0.0035f));
        TubeNode(phone, cord.ToArray(), 0.0025f, phoneMat, 5);
        phoneTarget = Target(phone, "phone", new Vector3(0.22f, 0.12f, 0.24f), new Vector3(0, 0.05f, 0));
        SoundAt["phone"] = phone.Position;

        // a mug, the photograph that came with the room, papers
        var mugMat = Grain(new Color(0.42f, 0.16f, 0.12f), new Vector3(8, 8, 1), 0.35f, 0.3f, 101, 0.06f);
        Lathe(this, new[] { (0f, 0f), (0.036f, 0f), (0.04f, 0.004f), (0.04f, 0.095f), (0.036f, 0.095f), (0.034f, 0.01f), (0f, 0.01f) }, new Vector3(-0.6f, DeskY, -1.27f), mugMat);
        var handle = new MeshInstance3D { Mesh = Torus(0.025f, 0.006f, 20, 8), MaterialOverride = mugMat, Position = new Vector3(-0.6f + 0.045f, DeskY + 0.05f, -1.27f), RotationDegrees = new Vector3(90, 0, 0) };
        AddChild(handle);
        Cyl(this, 0.033f, 0.033f, 0.002f, new Vector3(-0.6f, DeskY + 0.08f, -1.27f), Mat(new Color(0.08f, 0.05f, 0.03f), 0.1f), 24);
        var frame = new Node3D { Position = new Vector3(-0.6f, DeskY, -1.9f), RotationDegrees = new Vector3(0, 28, 0) };
        AddChild(frame);
        var frameBody = RBox(frame, new Vector3(0.14f, 0.18f, 0.015f), new Vector3(0, 0.09f, 0), Mat(new Color(0.32f, 0.22f, 0.13f), 0.4f), 0.005f);
        frameBody.RotationDegrees = new Vector3(-12, 0, 0);
        var photo = Image.CreateEmpty(64, 80, false, Image.Format.Rgb8);
        var noise = new FastNoiseLite { Frequency = 0.05f, Seed = 77 };
        for (var y = 0; y < 80; y++)
            for (var x = 0; x < 64; x++)
            {
                var sky = y < 38;
                var v = noise.GetNoise2D(x, y) * 0.1f;
                photo.SetPixel(x, y, sky ? new Color(0.62f + v, 0.56f + v, 0.45f + v) : new Color(0.32f + v, 0.27f + v, 0.18f + v));
            }
        for (var y = 30; y < 60; y++) photo.SetPixel(40, y, new Color(0.15f, 0.12f, 0.1f));
        var photoFace = RBox(frameBody, new Vector3(0.11f, 0.145f, 0.002f), new Vector3(0, 0, 0.008f), Painted(photo, new Vector3(1 / 0.11f, 1 / 0.145f, 1), 0.6f, 0), 0.0005f, false);
        foreach (var (pos, rot, seed) in new[] { (new Vector3(0.02f, DeskY + 0.003f, -1.5f), -16f, 1), (new Vector3(0.04f, DeskY + 0.005f, -1.52f), -9f, 2) })
        {
            var sheet = RBox(this, new Vector3(0.21f, 0.0015f, 0.297f), pos, Painted(PaperImage(seed), new Vector3(1 / 0.21f, 1 / 0.297f, 1), 0.95f, 0), 0.0005f, false);
            sheet.RotationDegrees = new Vector3(0, rot, 0);
        }
        Rod(this, new Vector3(-0.08f, DeskY + 0.006f, -1.32f), new Vector3(0.06f, DeskY + 0.006f, -1.36f), 0.004f, Mat(new Color(0.15f, 0.2f, 0.45f), 0.4f), 8);

        // the desk lamp, back left: it turns toward the machine when asked
        var lamp = new Node3D { Position = new Vector3(-0.82f, DeskY, -1.86f) };
        AddChild(lamp);
        var lampMat = Mat(new Color(0.1f, 0.11f, 0.12f), 0.35f, 0.65f);
        Lathe(lamp, new[] { (0f, 0f), (0.085f, 0f), (0.088f, 0.012f), (0.07f, 0.028f), (0.02f, 0.035f), (0f, 0.035f) }, Vector3.Zero, lampMat);
        var elbow = new Vector3(-0.02f, 0.34f, -0.03f);
        var headAt = new Vector3(0.13f, 0.47f, 0.16f);
        foreach (var off in new[] { -0.012f, 0.012f })
        {
            Rod(lamp, new Vector3(off, 0.03f, 0), elbow + new Vector3(off, 0, 0), 0.005f, lampMat);
            Rod(lamp, elbow + new Vector3(off, 0, 0), headAt + new Vector3(off, 0, 0), 0.005f, lampMat);
        }
        Ball(lamp, 0.016f, elbow, lampMat);
        var springPts = new List<Vector3>();
        for (var i = 0; i < 80; i++)
        {
            var u = i / 79f;
            var c = new Vector3(0, 0.08f, 0).Lerp(elbow + new Vector3(0, -0.06f, 0), u);
            springPts.Add(c + new Vector3(Mathf.Cos(i * 1.3f) * 0.006f + 0.02f, 0, Mathf.Sin(i * 1.3f) * 0.006f));
        }
        TubeNode(lamp, springPts.ToArray(), 0.0012f, Mat(new Color(0.6f, 0.6f, 0.6f), 0.3f, 0.9f), 4);
        lampHead = new Node3D { Position = headAt };
        lamp.AddChild(lampHead);
        var shadeHolder = new Node3D { RotationDegrees = new Vector3(90, 0, 0) };
        lampHead.AddChild(shadeHolder);
        var shadeMat = new StandardMaterial3D { AlbedoColor = new Color(0.12f, 0.16f, 0.13f), Roughness = 0.35f, Metallic = 0.5f, CullMode = BaseMaterial3D.CullModeEnum.Disabled };
        Lathe(shadeHolder, new[] { (0.02f, 0.07f), (0.03f, 0.06f), (0.07f, 0.0f), (0.09f, -0.06f), (0.092f, -0.065f) }, Vector3.Zero, shadeMat);
        Ball(lampHead, 0.026f, new Vector3(0, 0, -0.035f), Glow(new Color(1f, 0.86f, 0.62f), 5));
        lampLight = new SpotLight3D
        {
            LightColor = new Color(1f, 0.76f, 0.48f),
            LightEnergy = 16,
            SpotRange = 5,
            SpotAngle = 50,
            SpotAngleAttenuation = 0.9f,
            ShadowEnabled = true,
            ShadowBlur = 1.5f,
            LightVolumetricFogEnergy = 1.4f,
            Position = new Vector3(0, 0, -0.045f),
        };
        lampHead.AddChild(lampLight);
        lampFill = new OmniLight3D { LightColor = new Color(1f, 0.68f, 0.4f), LightEnergy = 0.6f, OmniRange = 3.2f, LightVolumetricFogEnergy = 0.2f };
        AddChild(lampFill);
        aim = AimAway;
        SoundAt["lamp"] = lamp.Position + headAt;
    }

    void SyncDesk(Night n, float dt)
    {
        SyncRoom(n, dt);
        // the lamp: away from the machine until it is turned toward it
        aim = aim.Lerp(n.Uncovered ? AimMachine : AimAway, Math.Min(1, dt * 1.6f));
        lampHead.LookAt(aim, Vector3.Up);
        lampFill.GlobalPosition = lampHead.GlobalPosition.Lerp(aim, 0.4f) + new Vector3(0, 0.25f, 0.3f);
        var flicker = 1f;
        var strain = !n.Capped && n.MachineRate >= 30_000;
        if (strain && Math.Sin(t * 31) > 0.93) flicker = 0.55f;
        if (n.SimMs - n.MilestoneAt < 1500) flicker *= 1.4f;
        lampLight.LightEnergy = 16 * flicker;
        lampFill.LightEnergy = 0.6f * flicker;

        // the terminal's screen
        var msg = n.SimMs - n.ScreenAt < 20_000 && !n.Capped ? n.Screen.Split('|') : null;
        var unread = 0;
        foreach (var f in n.Files.Values) if (f == "unread") unread++;
        var lines = msg != null ? new List<string>(msg)
            : n.MadeClips == 0 ? new List<string> { "NIGHT POWER", "AWAITING INPUT" }
            : n.Capped ? new List<string> { "ORDER COMPLETE", "CLAUSE 9 LIVE" }
            : new List<string>
            {
                n.Sealed > 0 ? $"CARTONS {n.BigPacked}/11" : n.Trial == Trial.Approved ? "ORDER 4472" : n.Trial == Trial.Sent ? "TRIAL SENT" : "TRIAL 4471",
                n.Trial == Trial.Sent ? "AWAITING REPLY" : $"DESK {n.Loose}",
                n.Installing != null ? "PRINTING PART" : n.Jammed ? "WIRE SNAGGED" : unread > 0 ? $"NEW FILE ({unread})" : n.Owns("calibrate") ? $"{n.MachineRate / 1000.0:0.0} CLIPS/S" : "BY HAND",
            };
        lines.Add((int)(t * 2) % 2 == 0 ? "> _" : ">");
        screenText.Text = string.Join("\n", lines);
        screenLight.LightEnergy = n.Installing != null ? 0.45f + 0.2f * (float)Math.Sin(t * 10) : 0.2f;

        // the phone rings while the courier waits for an answer
        var ringing = n.Courier?.Phase == CourierPhase.Offer;
        handset.Position = new Vector3(0, 0.075f + (ringing && (int)(t * 14) % 2 == 0 ? 0.008f : 0), -0.05f);
        handset.Rotation = new Vector3(0, 0, ringing ? (float)Math.Sin(t * 60) * 0.03f : 0);
        SetTarget(phoneTarget, ringing);
    }
}
