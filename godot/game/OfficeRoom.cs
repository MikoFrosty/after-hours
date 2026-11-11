// Room 1104 at night, built in code: the desk, the lamp, the terminal, the machines, and the city through the window.
// Everything here is presentation: it reads the Night each frame and never changes it.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom : Node3D
{
    // room bounds (metres): the desk stands against the back wall, the window is in the left wall
    public const float X0 = -2.2f, X1 = 2.2f, Z0 = -2.0f, Z1 = 2.0f, H = 2.7f;
    public const float DeskY = 0.75f;
    const float WinZ0 = -1.7f, WinZ1 = -0.1f, WinY0 = 0.9f, WinY1 = 2.15f;
    /// <summary>The office is on the eleventh floor: the street is this far below the floor.</summary>
    const float Street = -34f;

    Node3D lampHead = null!;
    SpotLight3D lampLight = null!;
    OmniLight3D lampFill = null!;
    MeshInstance3D bulb = null!;
    Vector3 aim;
    static readonly Vector3 AimAway = new(-0.45f, DeskY, -1.35f);
    static readonly Vector3 AimMachine = new(0.2f, DeskY, -1.62f);

    Node3D lever = null!;
    float pressT = 1;
    MultiMeshInstance3D clips = null!;
    const int MaxClips = 500;
    Node3D machine = null!;
    MeshInstance3D wheel = null!, wheel2 = null!;
    Node3D arm = null!, arm2 = null!;
    MeshInstance3D jamLed = null!;
    StandardMaterial3D jamLedMat = null!;
    MeshInstance3D spring = null!, oil = null!;
    Node3D feeder = null!, pedal = null!, governor = null!, rack = null!, spool = null!;
    readonly List<(Node3D g, MeshInstance3D wheel, Node3D arm)> rackMachines = new();
    readonly List<Node3D> sealedCartons = new();
    Node3D carton = null!, envelope = null!, phone = null!;
    MeshInstance3D wire = null!;
    StandardMaterial3D wireMat = null!;
    OmniLight3D glintLight = null!, runLight = null!, cabinetHint = null!;
    StaticBody3D darkTarget = null!, glintTarget = null!, machineTarget = null!, cartonTarget = null!, phoneTarget = null!, cabinetTarget = null!;
    Label screenText = null!;
    ColorRect screenBg = null!;
    OmniLight3D screenLight = null!;
    ShaderMaterial cityMat = null!;
    ProceduralSkyMaterial sky = null!;
    DirectionalLight3D moon = null!;
    CpuParticles3D rain = null!;
    StandardMaterial3D rainMat = null!;
    SpotLight3D vanLight = null!;
    Node3D van = null!;
    double wheelAngle;
    double t;

    public Godot.Environment Env { get; private set; } = null!;
    public SubViewport ScreenViewport { get; private set; } = null!;

    public override void _Ready()
    {
        BuildEnvironment();
        BuildRoom();
        BuildDesk();
        BuildMachines();
        BuildOutside();
        aim = AimAway;
        // switches for tracking down rendering problems: godot ... -- --off=fog,rain,moon,city
        var off = OS.GetCmdlineUserArgs();
        foreach (var a in off)
        {
            if (!a.StartsWith("--off=")) continue;
            var what = a[6..];
            if (what.Contains("fog")) { Env.VolumetricFogEnabled = false; Env.FogEnabled = false; }
            if (what.Contains("rain")) rain.Visible = false;
            if (what.Contains("moon")) moon.Visible = false;
            if (what.Contains("city")) foreach (var c in GetChildren()) if (c is MultiMeshInstance3D mmi && mmi.MaterialOverride == cityMat) mmi.Visible = false;
            if (what.Contains("glow")) Env.GlowEnabled = false;
            if (what.Contains("ssao")) Env.SsaoEnabled = false;
        }
    }

    // ---------- light and air ----------

    void BuildEnvironment()
    {
        sky = new ProceduralSkyMaterial
        {
            SkyTopColor = new Color(0.02f, 0.03f, 0.06f),
            SkyHorizonColor = new Color(0.2f, 0.15f, 0.14f),
            SkyCurve = 0.12f,
            SkyEnergyMultiplier = 2.5f,
            GroundBottomColor = new Color(0.01f, 0.01f, 0.015f),
            GroundHorizonColor = new Color(0.05f, 0.05f, 0.07f),
            SunAngleMax = 1,
        };
        Env = new Godot.Environment
        {
            BackgroundMode = Godot.Environment.BGMode.Sky,
            Sky = new Sky { SkyMaterial = sky },
            AmbientLightSource = Godot.Environment.AmbientSource.Color,
            AmbientLightColor = new Color(0.16f, 0.2f, 0.28f),
            AmbientLightEnergy = 0.18f,
            TonemapMode = Godot.Environment.ToneMapper.Agx,
            TonemapExposure = 1.1f,
            SsaoEnabled = true,
            SsaoRadius = 0.6f,
            SsaoIntensity = 1.6f,
            GlowEnabled = true,
            GlowIntensity = 0.5f,
            GlowBloom = 0f,
            GlowHdrThreshold = 1.6f,
            FogEnabled = true,
            FogLightColor = new Color(0.13f, 0.11f, 0.12f),
            FogDensity = 0.0045f,
            FogSkyAffect = 0.15f,
            VolumetricFogEnabled = true,
            VolumetricFogDensity = 0.012f,
            VolumetricFogAlbedo = new Color(0.8f, 0.8f, 0.85f),
            VolumetricFogLength = 12,
            AdjustmentEnabled = true,
            AdjustmentSaturation = 0.85f,
            AdjustmentContrast = 1.08f,
        };
        AddChild(new WorldEnvironment { Environment = Env });

        moon = new DirectionalLight3D
        {
            LightColor = new Color(0.45f, 0.55f, 0.75f),
            LightEnergy = 0.18f,
            ShadowEnabled = true,
            LightVolumetricFogEnergy = 0.3f,
            // moonlight only: the sky must not draw it as a sun
            SkyMode = DirectionalLight3D.SkyModeEnum.LightOnly,
        };
        AddChild(moon);
        moon.LookAtFromPosition(new Vector3(-10, 8, -1), new Vector3(0, 0, -0.5f), Vector3.Up);
    }

    // ---------- the room ----------

    void BuildRoom()
    {
        var floorMat = Grain(new Color(0.2f, 0.17f, 0.14f), new Vector3(6, 6, 1), 0.95f, 0.08f, 3);
        var wallMat = Grain(new Color(0.17f, 0.24f, 0.27f), new Vector3(1, 8, 1), 0.92f, 0.01f, 5);
        var trim = Mat(new Color(0.09f, 0.11f, 0.12f), 0.7f);
        float w = X1 - X0, d = Z1 - Z0;
        Box(this, new Vector3(w, 0.02f, d), new Vector3(0, -0.01f, 0), floorMat);
        Box(this, new Vector3(w, 0.02f, d), new Vector3(0, H + 0.01f, 0), Mat(new Color(0.07f, 0.08f, 0.09f), 1));
        Box(this, new Vector3(w, H, 0.06f), new Vector3(0, H / 2, Z0 - 0.03f), wallMat);
        Box(this, new Vector3(w, H, 0.06f), new Vector3(0, H / 2, Z1 + 0.03f), wallMat);
        Box(this, new Vector3(0.06f, H, d), new Vector3(X1 + 0.03f, H / 2, 0), wallMat);
        // the left wall around the window
        void Left(float z0, float z1, float y0, float y1) => Box(this, new Vector3(0.06f, y1 - y0, z1 - z0), new Vector3(X0 - 0.03f, (y0 + y1) / 2, (z0 + z1) / 2), wallMat);
        Left(Z0, WinZ0, 0, H);
        Left(WinZ1, Z1, 0, H);
        Left(WinZ0, WinZ1, 0, WinY0);
        Left(WinZ0, WinZ1, WinY1, H);
        // skirting
        Box(this, new Vector3(w, 0.09f, 0.02f), new Vector3(0, 0.045f, Z0 + 0.01f), trim);
        Box(this, new Vector3(0.02f, 0.09f, d), new Vector3(X1 - 0.01f, 0.045f, 0), trim);
        // walls the player cannot pass
        Solid(this, new Vector3(w, H, 0.2f), new Vector3(0, H / 2, Z0 - 0.1f));
        Solid(this, new Vector3(w, H, 0.2f), new Vector3(0, H / 2, Z1 + 0.1f));
        Solid(this, new Vector3(0.2f, H, d), new Vector3(X0 - 0.1f, H / 2, 0));
        Solid(this, new Vector3(0.2f, H, d), new Vector3(X1 + 0.1f, H / 2, 0));
        Solid(this, new Vector3(w, 0.2f, d), new Vector3(0, -0.1f, 0));

        // the window: frame, mullions, sill, glass
        var frame = Mat(new Color(0.13f, 0.12f, 0.1f), 0.6f);
        float zc = (WinZ0 + WinZ1) / 2, zw = WinZ1 - WinZ0, wh = WinY1 - WinY0;
        Box(this, new Vector3(0.22f, 0.04f, zw + 0.1f), new Vector3(X0 + 0.06f, WinY0 - 0.02f, zc), frame);
        Box(this, new Vector3(0.08f, 0.05f, zw + 0.1f), new Vector3(X0, WinY1 + 0.025f, zc), frame);
        Box(this, new Vector3(0.08f, wh, 0.05f), new Vector3(X0, (WinY0 + WinY1) / 2, WinZ0 - 0.025f), frame);
        Box(this, new Vector3(0.08f, wh, 0.05f), new Vector3(X0, (WinY0 + WinY1) / 2, WinZ1 + 0.025f), frame);
        Box(this, new Vector3(0.05f, wh, 0.03f), new Vector3(X0, (WinY0 + WinY1) / 2, zc), frame);
        Box(this, new Vector3(0.05f, 0.03f, zw), new Vector3(X0, WinY0 + wh * 0.62f, zc), frame);
        var glass = new StandardMaterial3D
        {
            AlbedoColor = new Color(0.55f, 0.65f, 0.72f, 0.08f),
            Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
            Roughness = 0.05f,
            Metallic = 0.2f,
        };
        Box(this, new Vector3(0.01f, wh, zw), new Vector3(X0 - 0.02f, (WinY0 + WinY1) / 2, zc), glass, false);
        // half-drawn blinds at the top of the window
        var blind = Mat(new Color(0.6f, 0.58f, 0.52f), 0.8f);
        for (var i = 0; i < 9; i++)
        {
            var slat = Box(this, new Vector3(0.05f, 0.004f, zw - 0.04f), new Vector3(X0 + 0.07f, WinY1 - 0.04f - i * 0.035f, zc), blind);
            slat.RotationDegrees = new Vector3(0, 0, 35);
        }
        // a plant on the sill
        Cyl(this, 0.06f, 0.045f, 0.1f, new Vector3(X0 + 0.08f, WinY0 + 0.05f, WinZ1 - 0.2f), Mat(new Color(0.35f, 0.18f, 0.1f), 0.9f));
        var leafMat = Mat(new Color(0.12f, 0.22f, 0.11f), 0.8f);
        for (var i = 0; i < 9; i++)
        {
            var leaf = Ball(this, 0.04f, new Vector3(X0 + 0.08f + Mathf.Cos(i) * 0.05f, WinY0 + 0.14f + i % 3 * 0.035f, WinZ1 - 0.2f + Mathf.Sin(i * 2) * 0.06f), leafMat);
            leaf.Scale = new Vector3(0.5f, 0.3f, 1.4f);
            leaf.Rotation = new Vector3(i, i * 0.7f, 0.4f);
        }

        // things on the walls: a calendar, sticky notes, a framed print, a clock
        var paper = Mat(new Color(0.78f, 0.75f, 0.68f), 0.95f);
        Box(this, new Vector3(0.36f, 0.48f, 0.01f), new Vector3(0.55f, 1.55f, Z0 + 0.005f), paper, false);
        for (var i = 0; i < 6; i++)
        {
            var n = Box(this, new Vector3(0.075f, 0.075f, 0.004f), new Vector3(1.0f + i % 3 * 0.095f, 1.3f + i / 3 * 0.095f, Z0 + 0.003f), Mat(i % 2 == 0 ? new Color(0.85f, 0.75f, 0.4f) : new Color(0.75f, 0.62f, 0.55f), 0.95f), false);
            n.RotationDegrees = new Vector3(0, 0, (i - 2.5f) * 4);
        }
        Box(this, new Vector3(0.5f, 0.38f, 0.02f), new Vector3(X1 - 0.01f, 1.6f, 0.4f), Mat(new Color(0.12f, 0.1f, 0.08f), 0.6f));
        Box(this, new Vector3(0.012f, 0.32f, 0.44f), new Vector3(X1 - 0.025f, 1.6f, 0.4f), Mat(new Color(0.35f, 0.38f, 0.36f), 0.9f));
        var clockFace = Cyl(this, 0.14f, 0.14f, 0.03f, new Vector3(-0.9f, 2.05f, Z0 + 0.02f), Mat(new Color(0.8f, 0.78f, 0.7f), 0.6f), 32);
        clockFace.RotationDegrees = new Vector3(90, 0, 0);

        // a door in the right wall
        Box(this, new Vector3(0.04f, 2.05f, 0.9f), new Vector3(X1 - 0.02f, 1.025f, 1.2f), Grain(new Color(0.24f, 0.17f, 0.11f), new Vector3(1, 6, 1), 0.7f, 0.05f, 9));
        Ball(this, 0.025f, new Vector3(X1 - 0.06f, 1.0f, 0.85f), Mat(new Color(0.6f, 0.55f, 0.4f), 0.3f, 0.9f));

        // the filing cabinet, back right: the spare coil is in the bottom drawer
        var cab = new Node3D { Position = new Vector3(1.75f, 0, -1.7f) };
        AddChild(cab);
        var cabMat = Mat(new Color(0.36f, 0.35f, 0.31f), 0.5f, 0.35f);
        Box(cab, new Vector3(0.5f, 1.32f, 0.6f), new Vector3(0, 0.66f, 0), cabMat);
        for (var i = 0; i < 4; i++)
        {
            Box(cab, new Vector3(0.45f, 0.29f, 0.012f), new Vector3(0, 0.17f + i * 0.32f, 0.302f), Mat(new Color(0.4f, 0.39f, 0.35f), 0.45f, 0.35f), false);
            Box(cab, new Vector3(0.13f, 0.02f, 0.025f), new Vector3(0, 0.27f + i * 0.32f, 0.315f), Mat(new Color(0.65f, 0.65f, 0.62f), 0.3f, 0.9f), false);
        }
        Solid(cab, new Vector3(0.5f, 1.32f, 0.6f), new Vector3(0, 0.66f, 0));
        cabinetTarget = Target(cab, "cabinet", new Vector3(0.48f, 0.34f, 0.1f), new Vector3(0, 0.17f, 0.3f));
        cabinetHint = new OmniLight3D { LightColor = new Color(1f, 0.8f, 0.5f), LightEnergy = 0, OmniRange = 0.5f, Position = new Vector3(0, 0.2f, 0.45f) };
        cab.AddChild(cabinetHint);

        // a wastebasket
        Cyl(this, 0.14f, 0.12f, 0.32f, new Vector3(1.0f, 0.16f, -1.6f), Mat(new Color(0.15f, 0.15f, 0.16f), 0.6f, 0.5f));
    }

    // ---------- the desk ----------

    void BuildDesk()
    {
        var wood = Grain(new Color(0.27f, 0.18f, 0.11f), new Vector3(2, 14, 1), 0.55f, 0.05f, 7);
        var dark = Mat(new Color(0.12f, 0.08f, 0.05f), 0.7f);
        Box(this, new Vector3(1.9f, 0.045f, 0.82f), new Vector3(0, DeskY - 0.022f, -1.6f), wood);
        Box(this, new Vector3(0.46f, DeskY - 0.05f, 0.74f), new Vector3(0.66f, (DeskY - 0.05f) / 2, -1.62f), dark);
        foreach (var y in new[] { 0.18f, 0.42f, 0.62f })
            Box(this, new Vector3(0.4f, 0.012f, 0.014f), new Vector3(0.66f, y, -1.245f), Mat(new Color(0.5f, 0.44f, 0.32f), 0.4f, 0.7f), false);
        Box(this, new Vector3(0.04f, DeskY - 0.05f, 0.7f), new Vector3(-0.9f, (DeskY - 0.05f) / 2, -1.62f), dark);
        Box(this, new Vector3(1.4f, 0.3f, 0.02f), new Vector3(-0.2f, DeskY - 0.2f, -1.96f), dark);
        Solid(this, new Vector3(1.9f, DeskY, 0.82f), new Vector3(0, DeskY / 2, -1.6f));

        // the chair, pushed back
        var chair = new Node3D { Position = new Vector3(0.75f, 0, -0.75f), RotationDegrees = new Vector3(0, -35, 0) };
        AddChild(chair);
        var fabric = Mat(new Color(0.09f, 0.09f, 0.1f), 0.95f);
        Box(chair, new Vector3(0.5f, 0.07f, 0.48f), new Vector3(0, 0.47f, 0), fabric);
        Box(chair, new Vector3(0.48f, 0.55f, 0.06f), new Vector3(0, 0.82f, 0.24f), fabric);
        Cyl(chair, 0.025f, 0.025f, 0.38f, new Vector3(0, 0.25f, 0), Mat(new Color(0.2f, 0.2f, 0.2f), 0.3f, 0.8f));
        for (var i = 0; i < 5; i++)
        {
            var leg = Box(chair, new Vector3(0.32f, 0.03f, 0.04f), new Vector3(Mathf.Cos(i * Mathf.Tau / 5) * 0.16f, 0.05f, Mathf.Sin(i * Mathf.Tau / 5) * 0.16f), Mat(new Color(0.12f, 0.12f, 0.12f), 0.4f, 0.6f));
            leg.Rotation = new Vector3(0, -i * Mathf.Tau / 5, 0);
        }
        Solid(chair, new Vector3(0.5f, 0.9f, 0.5f), new Vector3(0, 0.45f, 0));

        // the CRT terminal: its screen is a small 2D view rendered into the room
        var monitor = new Node3D { Position = new Vector3(-0.3f, DeskY, -1.78f), RotationDegrees = new Vector3(0, 10, 0) };
        AddChild(monitor);
        var beige = Mat(new Color(0.52f, 0.48f, 0.4f), 0.6f);
        Box(monitor, new Vector3(0.38f, 0.32f, 0.36f), new Vector3(0, 0.2f, 0), beige);
        Box(monitor, new Vector3(0.3f, 0.26f, 0.14f), new Vector3(0, 0.19f, -0.24f), beige);
        Box(monitor, new Vector3(0.22f, 0.04f, 0.22f), new Vector3(0, 0.02f, 0), beige);
        var vp = new SubViewport { Size = new Vector2I(320, 240), TransparentBg = false, RenderTargetUpdateMode = SubViewport.UpdateMode.Always };
        screenBg = new ColorRect { Color = new Color(0.01f, 0.06f, 0.03f), Size = new Vector2(320, 240) };
        vp.AddChild(screenBg);
        screenText = new Label { Position = new Vector2(20, 18), Size = new Vector2(290, 210) };
        screenText.AddThemeFontSizeOverride("font_size", 28);
        screenText.AddThemeColorOverride("font_color", new Color(0.55f, 1f, 0.68f));
        screenText.AddThemeFontOverride("font", new SystemFont { FontNames = new[] { "DejaVu Sans Mono", "Monospace" } });
        vp.AddChild(screenText);
        AddChild(vp);
        ScreenViewport = vp;
        var screenMat = new StandardMaterial3D
        {
            AlbedoTexture = vp.GetTexture(),
            EmissionEnabled = true,
            EmissionTexture = vp.GetTexture(),
            EmissionEnergyMultiplier = 1.4f,
            Roughness = 0.2f,
        };
        var screen = new MeshInstance3D { Mesh = new QuadMesh { Size = new Vector2(0.29f, 0.22f) }, MaterialOverride = screenMat, Position = new Vector3(0, 0.21f, 0.181f) };
        monitor.AddChild(screen);
        screenLight = new OmniLight3D { LightColor = new Color(0.4f, 1f, 0.6f), LightEnergy = 0.05f, OmniRange = 0.9f, Position = new Vector3(0, 0.22f, 0.45f) };
        monitor.AddChild(screenLight);
        Target(monitor, "monitor", new Vector3(0.38f, 0.32f, 0.4f), new Vector3(0, 0.2f, 0));

        // keyboard
        var kb = new Node3D { Position = new Vector3(-0.27f, DeskY, -1.42f), RotationDegrees = new Vector3(0, 5, 0) };
        AddChild(kb);
        Box(kb, new Vector3(0.44f, 0.025f, 0.15f), new Vector3(0, 0.012f, 0), Mat(new Color(0.5f, 0.47f, 0.4f), 0.65f));
        var keyMat = Mat(new Color(0.6f, 0.57f, 0.5f), 0.7f);
        for (var r = 0; r < 4; r++)
            for (var k = 0; k < 13; k++)
                Box(kb, new Vector3(0.026f, 0.012f, 0.026f), new Vector3(-0.19f + k * 0.031f, 0.03f, -0.05f + r * 0.032f), keyMat, false);

        // a mug, a photo frame, papers, a phone
        Cyl(this, 0.038f, 0.034f, 0.095f, new Vector3(-0.62f, DeskY + 0.048f, -1.38f), Mat(new Color(0.35f, 0.15f, 0.11f), 0.5f));
        var frame = Box(this, new Vector3(0.13f, 0.17f, 0.015f), new Vector3(-0.58f, DeskY + 0.085f, -1.86f), Mat(new Color(0.3f, 0.2f, 0.12f), 0.5f));
        frame.RotationDegrees = new Vector3(-12, 25, 0);
        Box(frame, new Vector3(0.1f, 0.135f, 0.002f), new Vector3(0, 0, 0.009f), Mat(new Color(0.55f, 0.48f, 0.36f), 0.9f), false);
        var sheet = Box(this, new Vector3(0.21f, 0.003f, 0.29f), new Vector3(0.05f, DeskY + 0.002f, -1.5f), Mat(new Color(0.74f, 0.71f, 0.64f), 0.95f), false);
        sheet.RotationDegrees = new Vector3(0, -18, 0);
        phone = new Node3D { Position = new Vector3(-0.72f, DeskY, -1.62f), RotationDegrees = new Vector3(0, 20, 0) };
        AddChild(phone);
        Box(phone, new Vector3(0.18f, 0.05f, 0.2f), new Vector3(0, 0.025f, 0), Mat(new Color(0.08f, 0.08f, 0.09f), 0.4f));
        var handset = Box(phone, new Vector3(0.2f, 0.035f, 0.05f), new Vector3(0, 0.068f, -0.04f), Mat(new Color(0.08f, 0.08f, 0.09f), 0.4f));
        handset.Name = "Handset";
        phoneTarget = Target(phone, "phone", new Vector3(0.2f, 0.1f, 0.22f), new Vector3(0, 0.05f, 0));

        // the desk lamp, back left: it turns toward the machine when asked
        var lamp = new Node3D { Position = new Vector3(-0.8f, DeskY, -1.85f) };
        AddChild(lamp);
        var lampMat = Mat(new Color(0.08f, 0.085f, 0.09f), 0.4f, 0.6f);
        Cyl(lamp, 0.07f, 0.085f, 0.025f, new Vector3(0, 0.012f, 0), lampMat);
        var elbow = new Vector3(-0.02f, 0.34f, -0.02f);
        var headAt = new Vector3(0.12f, 0.46f, 0.15f);
        Rod(lamp, new Vector3(0, 0.02f, 0), elbow, lampMat);
        Rod(lamp, elbow, headAt, lampMat);
        lampHead = new Node3D { Position = headAt };
        lamp.AddChild(lampHead);
        var shade = Cyl(lampHead, 0.02f, 0.08f, 0.12f, Vector3.Zero, new StandardMaterial3D { AlbedoColor = new Color(0.08f, 0.085f, 0.09f), Roughness = 0.4f, Metallic = 0.6f, CullMode = BaseMaterial3D.CullModeEnum.Disabled });
        shade.RotationDegrees = new Vector3(90, 0, 0);
        bulb = Ball(lampHead, 0.025f, new Vector3(0, 0, -0.03f), Glow(new Color(1f, 0.85f, 0.6f), 4));
        lampLight = new SpotLight3D
        {
            LightColor = new Color(1f, 0.74f, 0.45f),
            LightEnergy = 9,
            SpotRange = 4,
            SpotAngle = 38,
            SpotAngleAttenuation = 0.8f,
            ShadowEnabled = true,
            ShadowBlur = 1.5f,
            LightVolumetricFogEnergy = 1.6f,
            Position = new Vector3(0, 0, -0.04f),
        };
        lampHead.AddChild(lampLight);
        lampFill = new OmniLight3D { LightColor = new Color(1f, 0.65f, 0.35f), LightEnergy = 0.35f, OmniRange = 2.8f };
        AddChild(lampFill);

        // the hand bender: a block with a lever, where clips are made by hand
        var press = new Node3D { Position = new Vector3(0.16f, DeskY, -1.36f), RotationDegrees = new Vector3(0, -18, 0) };
        AddChild(press);
        var steel = Mat(new Color(0.42f, 0.44f, 0.45f), 0.35f, 0.8f);
        Box(press, new Vector3(0.14f, 0.03f, 0.1f), new Vector3(0, 0.015f, 0), Mat(new Color(0.18f, 0.16f, 0.14f), 0.7f));
        Box(press, new Vector3(0.03f, 0.09f, 0.03f), new Vector3(-0.04f, 0.075f, 0), steel);
        lever = new Node3D { Position = new Vector3(-0.04f, 0.12f, 0) };
        press.AddChild(lever);
        Box(lever, new Vector3(0.11f, 0.01f, 0.01f), new Vector3(0.055f, 0, 0), steel);
        Ball(lever, 0.013f, new Vector3(0.11f, 0, 0), Mat(new Color(0.45f, 0.08f, 0.06f), 0.35f));
        lever.RotationDegrees = new Vector3(0, 0, 20);
        Target(press, "press", new Vector3(0.18f, 0.18f, 0.14f), new Vector3(0, 0.08f, 0));

        // the clip tray
        var tray = new Node3D { Position = new Vector3(0.42f, DeskY, -1.34f), RotationDegrees = new Vector3(0, -8, 0) };
        AddChild(tray);
        var trayMat = Mat(new Color(0.14f, 0.15f, 0.16f), 0.5f, 0.5f);
        Box(tray, new Vector3(0.24f, 0.008f, 0.16f), new Vector3(0, 0.004f, 0), trayMat);
        Box(tray, new Vector3(0.24f, 0.03f, 0.008f), new Vector3(0, 0.015f, 0.076f), trayMat);
        Box(tray, new Vector3(0.24f, 0.03f, 0.008f), new Vector3(0, 0.015f, -0.076f), trayMat);
        Box(tray, new Vector3(0.008f, 0.03f, 0.16f), new Vector3(0.116f, 0.015f, 0), trayMat);
        Box(tray, new Vector3(0.008f, 0.03f, 0.16f), new Vector3(-0.116f, 0.015f, 0), trayMat);
        var mm = new MultiMesh
        {
            TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
            Mesh = ClipMesh(),
            InstanceCount = MaxClips,
            VisibleInstanceCount = 0,
        };
        var rng = new Random(4);
        for (var i = 0; i < MaxClips; i++)
        {
            var layer = i / 70;
            var basis = new Basis(Vector3.Up, (float)(rng.NextDouble() * Mathf.Tau)) * new Basis(Vector3.Right, (float)(rng.NextDouble() - 0.5) * 0.3f);
            var pos = new Vector3((float)(rng.NextDouble() - 0.5) * 0.2f, 0.01f + layer * 0.004f + (float)rng.NextDouble() * 0.002f, (float)(rng.NextDouble() - 0.5) * 0.12f);
            mm.SetInstanceTransform(i, new Transform3D(basis, pos));
        }
        clips = new MultiMeshInstance3D { Multimesh = mm, MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.75f, 0.77f, 0.8f), Roughness = 0.3f, Metallic = 0.85f, CullMode = BaseMaterial3D.CullModeEnum.Disabled } };
        tray.AddChild(clips);

        // the open carton at the desk's right end, and the trial run's envelope until it has gone
        carton = new Node3D { Position = new Vector3(0.78f, DeskY, -1.5f), RotationDegrees = new Vector3(0, -14, 0) };
        AddChild(carton);
        var card = Grain(new Color(0.5f, 0.37f, 0.22f), new Vector3(2, 2, 1), 0.95f, 0.15f, 11);
        Box(carton, new Vector3(0.28f, 0.008f, 0.21f), new Vector3(0, 0.004f, 0), Mat(new Color(0.28f, 0.2f, 0.12f), 0.95f));
        Box(carton, new Vector3(0.28f, 0.16f, 0.008f), new Vector3(0, 0.08f, 0.101f), card);
        Box(carton, new Vector3(0.28f, 0.16f, 0.008f), new Vector3(0, 0.08f, -0.101f), card);
        Box(carton, new Vector3(0.008f, 0.16f, 0.21f), new Vector3(0.136f, 0.08f, 0), card);
        Box(carton, new Vector3(0.008f, 0.16f, 0.21f), new Vector3(-0.136f, 0.08f, 0), card);
        var flapA = Box(carton, new Vector3(0.28f, 0.006f, 0.1f), new Vector3(0, 0.18f, 0.14f), card);
        flapA.RotationDegrees = new Vector3(-35, 0, 0);
        var flapB = Box(carton, new Vector3(0.28f, 0.006f, 0.1f), new Vector3(0, 0.18f, -0.14f), card);
        flapB.RotationDegrees = new Vector3(35, 0, 0);
        cartonTarget = Target(carton, "carton", new Vector3(0.3f, 0.2f, 0.24f), new Vector3(0, 0.1f, 0));
        envelope = new Node3D { Position = new Vector3(0.7f, DeskY + 0.004f, -1.32f), RotationDegrees = new Vector3(0, 12, 0) };
        AddChild(envelope);
        Box(envelope, new Vector3(0.22f, 0.012f, 0.11f), Vector3.Zero, Mat(new Color(0.72f, 0.6f, 0.42f), 0.9f));
        Target(envelope, "carton", new Vector3(0.24f, 0.05f, 0.13f), Vector3.Zero);

        // sealed cartons stacked on the floor to the right of the desk
        var sealedMat = Grain(new Color(0.45f, 0.33f, 0.2f), new Vector3(2, 2, 1), 0.95f, 0.15f, 13);
        var tape = Mat(new Color(0.7f, 0.64f, 0.5f), 0.5f);
        for (var i = 0; i < Night.Cartons; i++)
        {
            var g = new Node3D();
            Box(g, new Vector3(0.34f, 0.24f, 0.26f), new Vector3(0, 0.12f, 0), sealedMat);
            Box(g, new Vector3(0.345f, 0.004f, 0.05f), new Vector3(0, 0.241f, 0), tape, false);
            var col = i % 4;
            var level = i / 4;
            g.Position = new Vector3(1.2f + col % 2 * 0.37f, level * 0.245f, -0.95f + col / 2 * 0.3f);
            g.RotationDegrees = new Vector3(0, (i * 37 % 7 - 3) * 1.5f, 0);
            g.Visible = false;
            AddChild(g);
            sealedCartons.Add(g);
        }
    }

    static void Rod(Node3D parent, Vector3 a, Vector3 b, Material m)
    {
        var rod = Cyl(parent, 0.007f, 0.007f, a.DistanceTo(b), (a + b) / 2, m, 8);
        rod.Basis = new Basis(new Quaternion(Vector3.Up, (b - a).Normalized()));
    }

    static ArrayMesh ClipMesh()
    {
        const float s = 0.016f;
        var pts = new (float x, float y)[] { (0, 0.6f), (0, -0.7f), (0.16f, -0.95f), (0.34f, -0.7f), (0.34f, 0.8f), (0.6f, 1.05f), (0.8f, 0.8f), (0.8f, -0.95f), (1f, -1.15f), (1.16f, -0.95f), (1.16f, 0.45f) };
        var path = new List<Vector3>();
        for (var i = 0; i < pts.Length - 1; i++)
            for (var k = 0; k < 4; k++)
            {
                var u = k / 4f;
                path.Add(new Vector3((Mathf.Lerp(pts[i].x, pts[i + 1].x, u) - 0.58f) * s, 0, Mathf.Lerp(pts[i].y, pts[i + 1].y, u) * s));
            }
        path.Add(new Vector3((pts[^1].x - 0.58f) * s, 0, pts[^1].y * s));
        return Tube(path.ToArray(), 0.0011f, 5);
    }

    // ---------- the machines ----------

    (Node3D g, MeshInstance3D wheel, Node3D arm) ClipMachine(Node3D parent, Vector3 pos, float yawDeg, float scale = 1)
    {
        var g = new Node3D { Position = pos, RotationDegrees = new Vector3(0, yawDeg, 0), Scale = Vector3.One * scale };
        parent.AddChild(g);
        var body = Mat(new Color(0.12f, 0.2f, 0.16f), 0.5f, 0.35f);
        var steel = Mat(new Color(0.5f, 0.53f, 0.55f), 0.3f, 0.85f);
        var brass = Mat(new Color(0.55f, 0.4f, 0.18f), 0.35f, 0.75f);
        Box(g, new Vector3(0.3f, 0.04f, 0.2f), new Vector3(0, 0.02f, 0), Mat(new Color(0.07f, 0.1f, 0.08f), 0.7f, 0.2f));
        Box(g, new Vector3(0.14f, 0.12f, 0.12f), new Vector3(-0.04f, 0.1f, 0), body);
        var w = Cyl(g, 0.055f, 0.055f, 0.025f, new Vector3(0.07f, 0.11f, 0.02f), steel, 28);
        w.RotationDegrees = new Vector3(0, 0, 90);
        Box(w, new Vector3(0.1f, 0.03f, 0.012f), Vector3.Zero, Mat(new Color(0.1f, 0.1f, 0.1f), 0.5f), false);
        var a = new Node3D { Position = new Vector3(-0.04f, 0.17f, 0) };
        g.AddChild(a);
        Box(a, new Vector3(0.16f, 0.014f, 0.02f), new Vector3(-0.06f, 0, 0), brass);
        Box(g, new Vector3(0.04f, 0.05f, 0.05f), new Vector3(-0.12f, 0.07f, 0.03f), steel);
        return (g, w, a);
    }

    void BuildMachines()
    {
        var m = ClipMachine(this, new Vector3(0.3f, DeskY, -1.75f), 20);
        (machine, wheel, arm) = m;
        machineTarget = Target(machine, "machine", new Vector3(0.32f, 0.24f, 0.22f), new Vector3(0, 0.1f, 0));
        jamLedMat = Glow(new Color(0.1f, 0.3f, 0.12f), 2);
        jamLed = Ball(machine, 0.008f, new Vector3(-0.04f, 0.17f, 0.062f), jamLedMat);
        runLight = new OmniLight3D { LightColor = new Color(1f, 0.65f, 0.35f), LightEnergy = 0, OmniRange = 0.6f, Position = new Vector3(0.3f, DeskY + 0.2f, -1.6f) };
        AddChild(runLight);

        spool = new Node3D { Position = new Vector3(0.6f, DeskY + 0.1f, -1.82f), RotationDegrees = new Vector3(0, 30, 0) };
        AddChild(spool);
        var core = Cyl(spool, 0.075f, 0.075f, 0.1f, Vector3.Zero, Mat(new Color(0.55f, 0.42f, 0.28f), 0.35f, 0.85f), 32);
        core.RotationDegrees = new Vector3(90, 0, 0);
        foreach (var z in new[] { -0.055f, 0.055f })
        {
            var flange = Cyl(spool, 0.09f, 0.09f, 0.008f, new Vector3(0, 0, z), Mat(new Color(0.1f, 0.1f, 0.1f), 0.6f, 0.4f), 32);
            flange.RotationDegrees = new Vector3(90, 0, 0);
        }
        Box(this, new Vector3(0.04f, 0.1f, 0.14f), new Vector3(0.6f, DeskY + 0.05f, -1.82f), Mat(new Color(0.1f, 0.1f, 0.1f), 0.6f, 0.4f)).RotationDegrees = new Vector3(0, 30, 0);
        wireMat = new StandardMaterial3D { AlbedoColor = new Color(0.75f, 0.77f, 0.8f), Roughness = 0.3f, Metallic = 0.9f, EmissionEnabled = true, Emission = new Color(1f, 0.85f, 0.5f), EmissionEnergyMultiplier = 0, CullMode = BaseMaterial3D.CullModeEnum.Disabled };
        wire = new MeshInstance3D { Mesh = Tube(new[] { new Vector3(0.54f, DeskY + 0.16f, -1.8f), new Vector3(0.47f, DeskY + 0.14f, -1.78f), new Vector3(0.4f, DeskY + 0.12f, -1.76f), new Vector3(0.33f, DeskY + 0.1f, -1.74f) }, 0.0016f), MaterialOverride = wireMat };
        AddChild(wire);
        glintTarget = Target(this, "glint", new Vector3(0.24f, 0.12f, 0.12f), new Vector3(0.44f, DeskY + 0.13f, -1.78f));
        glintLight = new OmniLight3D { LightColor = new Color(1f, 0.9f, 0.7f), LightEnergy = 0, OmniRange = 0.7f, Position = new Vector3(0.44f, DeskY + 0.16f, -1.74f) };
        AddChild(glintLight);
        darkTarget = Target(this, "dark", new Vector3(0.6f, 0.3f, 0.35f), new Vector3(0.45f, DeskY + 0.12f, -1.78f));

        // upgrades that appear on the desk
        var springPts = new Vector3[60];
        for (var i = 0; i < 60; i++) springPts[i] = new Vector3(Mathf.Cos(i * 0.6f) * 0.012f, i * 0.0012f, Mathf.Sin(i * 0.6f) * 0.012f);
        spring = new MeshInstance3D { Mesh = Tube(springPts, 0.0015f, 5), MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.7f, 0.72f, 0.75f), Roughness = 0.3f, Metallic = 0.9f, CullMode = BaseMaterial3D.CullModeEnum.Disabled }, Position = new Vector3(0.1f, 0.05f, 0.06f), RotationDegrees = new Vector3(0, 0, 90) };
        machine.AddChild(spring);
        oil = Cyl(this, 0.03f, 0.036f, 0.08f, new Vector3(0.08f, DeskY + 0.04f, -1.86f), Mat(new Color(0.45f, 0.12f, 0.07f), 0.5f, 0.4f));
        var spout = Cyl(oil, 0.003f, 0.006f, 0.09f, new Vector3(0.03f, 0.06f, 0), Mat(new Color(0.6f, 0.6f, 0.6f), 0.3f, 0.9f), 8);
        spout.RotationDegrees = new Vector3(0, 0, -50);
        feeder = new Node3D { Position = new Vector3(0.47f, DeskY, -1.68f), RotationDegrees = new Vector3(0, 25, 0) };
        AddChild(feeder);
        Box(feeder, new Vector3(0.08f, 0.08f, 0.1f), new Vector3(0, 0.04f, 0), Mat(new Color(0.22f, 0.28f, 0.24f), 0.5f, 0.5f));
        Cyl(feeder, 0.025f, 0.025f, 0.012f, new Vector3(0, 0.09f, 0), Mat(new Color(0.6f, 0.6f, 0.6f), 0.3f, 0.9f)).Name = "Wheel";
        arm2 = new Node3D { Position = new Vector3(-0.04f, 0.2f, -0.05f) };
        machine.AddChild(arm2);
        Box(arm2, new Vector3(0.16f, 0.014f, 0.02f), new Vector3(-0.06f, 0, 0), Mat(new Color(0.55f, 0.4f, 0.18f), 0.35f, 0.75f));
        pedal = new Node3D { Position = new Vector3(0.1f, 0, -1.25f) };
        AddChild(pedal);
        Box(pedal, new Vector3(0.16f, 0.025f, 0.24f), new Vector3(0, 0.012f, 0), Mat(new Color(0.1f, 0.1f, 0.1f), 0.6f, 0.5f));
        Box(pedal, new Vector3(0.13f, 0.015f, 0.18f), new Vector3(0, 0.035f, 0), Mat(new Color(0.22f, 0.22f, 0.22f), 0.5f, 0.6f)).RotationDegrees = new Vector3(-9, 0, 0);
        governor = new Node3D { Position = new Vector3(-0.02f, DeskY, -1.9f) };
        AddChild(governor);
        Box(governor, new Vector3(0.08f, 0.1f, 0.05f), new Vector3(0, 0.05f, 0), Mat(new Color(0.18f, 0.18f, 0.16f), 0.5f, 0.4f));
        var dial = Cyl(governor, 0.022f, 0.022f, 0.004f, new Vector3(0, 0.06f, 0.026f), Glow(new Color(0.45f, 1f, 0.55f), 1.5f));
        dial.RotationDegrees = new Vector3(90, 0, 0);

        // the side-table rack under the window, with up to six machines
        rack = new Node3D { Position = new Vector3(-1.9f, 0, -0.9f) };
        AddChild(rack);
        var wood = Grain(new Color(0.27f, 0.18f, 0.11f), new Vector3(2, 10, 1), 0.55f, 0.05f, 17);
        var dark = Mat(new Color(0.12f, 0.08f, 0.05f), 0.7f);
        Box(rack, new Vector3(0.5f, 0.03f, 1.2f), new Vector3(0, 0.66f, 0), wood);
        Box(rack, new Vector3(0.46f, 0.02f, 1.14f), new Vector3(0, 0.22f, 0), dark);
        foreach (var (dx, dz) in new[] { (-0.22f, -0.57f), (0.22f, -0.57f), (-0.22f, 0.57f), (0.22f, 0.57f) })
            Box(rack, new Vector3(0.03f, 0.66f, 0.03f), new Vector3(dx, 0.33f, dz), dark);
        Solid(rack, new Vector3(0.5f, 0.7f, 1.2f), new Vector3(0, 0.35f, 0));
        for (var i = 0; i < 6; i++)
            rackMachines.Add(ClipMachine(rack, new Vector3(i % 2 == 1 ? 0.12f : -0.1f, 0.675f, -0.42f + i / 2 * 0.4f + i % 2 * 0.08f), -90, 0.75f));
    }

    // ---------- outside: the street twelve floors down, the city, rain, the van ----------

    void BuildOutside()
    {
        // the city's buildings: windows drawn by a shader, lit fewer as the night goes on
        cityMat = new ShaderMaterial { Shader = GD.Load<Shader>("res://shaders/city.gdshader") };
        var boxes = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, Mesh = new BoxMesh { Size = Vector3.One } };
        var rng = new Random(21);
        var placed = new List<Transform3D>();
        // blocks across the avenue and far beyond, thinning into the distance
        for (var i = 0; i < 900; i++)
        {
            var far = rng.NextDouble();
            var w = 10 + (float)rng.NextDouble() * 22;
            var d = 10 + (float)rng.NextDouble() * 22;
            // every building stays on the far side of the avenue, at least 30 m from the window
            var x = -(30 + w / 2 + (float)Math.Pow(far, 1.3) * 450);
            var z = (float)(rng.NextDouble() - 0.5) * (80 + -x * 1.6f);
            // low blocks across the avenue (their roofs below this floor), taller ones behind, towers in the distance
            var h = (x < -200 ? 40 : x < -90 ? 20 : 8) + (float)Math.Pow(rng.NextDouble(), 2.0) * (x < -200 ? 170 : x < -90 ? 60 : 24);
            placed.Add(new Transform3D(Basis.Identity.Scaled(new Vector3(w, h, d)), new Vector3(x, Street + h / 2, z)));
        }
        // the buildings beside this one, on this side of the avenue
        for (var i = 0; i < 40; i++)
        {
            var z = (i % 2 == 0 ? -1 : 1) * (14 + i / 2 * 18f);
            var h = 30 + (float)rng.NextDouble() * 40;
            placed.Add(new Transform3D(Basis.Identity.Scaled(new Vector3(18, h, 14)), new Vector3(X1 + 9 + (float)rng.NextDouble() * 6, Street + h / 2, z)));
        }
        boxes.InstanceCount = placed.Count;
        for (var i = 0; i < placed.Count; i++) boxes.SetInstanceTransform(i, placed[i]);
        AddChild(new MultiMeshInstance3D { Multimesh = boxes, MaterialOverride = cityMat, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off });

        // the street and the avenue's lamps
        Box(this, new Vector3(900, 0.2f, 900), new Vector3(-300, Street - 0.1f, 0), Mat(new Color(0.03f, 0.03f, 0.035f), 0.35f, 0.2f), false);
        var lampGlow = Glow(new Color(1f, 0.7f, 0.4f), 6);
        for (var i = -8; i <= 8; i++)
        {
            foreach (var lx in new[] { -6f, -24f })
            {
            Ball(this, 0.3f, new Vector3(lx, Street + 6, i * 16f + (lx < -10 ? 8 : 0)), lampGlow);
            var pool = new OmniLight3D { LightColor = new Color(1f, 0.65f, 0.35f), LightEnergy = 1.5f, OmniRange = 14, Position = new Vector3(lx, Street + 5.5f, i * 16f + (lx < -10 ? 8 : 0)) };
            AddChild(pool);
            }
        }

        // rain falling past the window
        rain = new CpuParticles3D
        {
            Amount = 900,
            Lifetime = 0.9f,
            Preprocess = 1,
            Position = new Vector3(-5.6f, 4f, -0.9f),
            EmissionShape = CpuParticles3D.EmissionShapeEnum.Box,
            EmissionBoxExtents = new Vector3(3f, 0.1f, 5f),
            Direction = Vector3.Down,
            Spread = 3,
            InitialVelocityMin = 9,
            InitialVelocityMax = 11,
            Gravity = new Vector3(0, -9.8f, 0),
            Mesh = new BoxMesh { Size = new Vector3(0.004f, 0.22f, 0.004f) },
            MaterialOverride = rainMat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0.7f, 0.8f, 0.9f, 0.22f),
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
            },
        };
        AddChild(rain);

        // the 5:22 van, across the street below, with its headlights
        van = new Node3D { Position = new Vector3(-20, Street, -2), Visible = false };
        AddChild(van);
        Box(van, new Vector3(2.2f, 2.3f, 5.2f), new Vector3(0, 1.4f, 0), Mat(new Color(0.55f, 0.55f, 0.52f), 0.5f, 0.3f));
        foreach (var dx in new[] { -0.7f, 0.7f }) Ball(van, 0.15f, new Vector3(dx, 0.8f, 2.62f), Glow(new Color(1f, 0.95f, 0.8f), 8));
        vanLight = new SpotLight3D { LightColor = new Color(1f, 0.9f, 0.7f), LightEnergy = 6, SpotRange = 30, SpotAngle = 30, Position = new Vector3(0, 0.8f, 2.7f) };
        van.AddChild(vanLight);
    }

    // ---------- each frame ----------

    /// <summary>The hand bender's lever dips (a press).</summary>
    public void Press() => pressT = 0;

    public void Sync(Night n, double delta)
    {
        t += delta;
        var dt = (float)delta;
        var running = !n.Capped && n.Owns("calibrate") && !n.Jammed && !n.MachinesHalted;

        // the lamp: away from the machine until it is turned toward it
        aim = aim.Lerp(n.Uncovered ? AimMachine : AimAway, Math.Min(1, dt * 1.6f));
        lampHead.LookAt(aim, Vector3.Up);
        lampFill.GlobalPosition = lampHead.GlobalPosition.Lerp(aim, 0.4f);
        var flicker = 1f;
        var strain = !n.Capped && n.MachineRate >= 30_000;
        if (strain && Math.Sin(t * 31) > 0.93) flicker = 0.55f;
        if (n.SimMs - n.MilestoneAt < 1500) flicker *= 1.4f;
        lampLight.LightEnergy = 9 * flicker;
        lampFill.LightEnergy = 0.35f * flicker;

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
                n.Jammed ? "WIRE SNAGGED" : unread > 0 ? $"NEW FILE ({unread})" : n.Owns("calibrate") ? $"{n.MachineRate / 1000.0:0.0} CLIPS/S" : "BY HAND",
            };
        lines.Add((int)(t * 2) % 2 == 0 ? "> _" : ">");
        screenText.Text = string.Join("\n", lines);

        // the city, every few story minutes: windows going dark, rain easing, dawn
        var minute = n.Minute;
        cityMat.SetShaderParameter("lit", Math.Max(0.06, 0.42 - minute / 900));
        var dawn = (float)Math.Clamp((minute - 300) / 80, 0, 1);
        sky.SkyTopColor = new Color(0.02f, 0.03f, 0.06f).Lerp(new Color(0.22f, 0.27f, 0.36f), dawn);
        sky.SkyHorizonColor = new Color(0.2f, 0.15f, 0.14f).Lerp(new Color(0.62f, 0.5f, 0.45f), dawn);
        moon.LightEnergy = 0.18f + dawn * 0.5f;
        moon.LightColor = new Color(0.45f, 0.55f, 0.75f).Lerp(new Color(0.8f, 0.7f, 0.65f), dawn);
        cityMat.SetShaderParameter("energy", 1.2f * (1 - dawn * 0.6f));
        var rainAmt = Math.Clamp(1 - Math.Max(0, minute - 240) / 160, 0.15, 1);
        rainMat.AlbedoColor = new Color(0.7f, 0.8f, 0.9f, 0.22f * (float)rainAmt);

        // the van
        van.Visible = n.VanAt != null && minute < Cfg(n).VanMinute + 15;

        // the machines
        spring.Visible = n.Owns("tensioner");
        oil.Visible = n.Owns("oil");
        feeder.Visible = n.Owns("feeder");
        arm2.Visible = n.Owns("die2");
        pedal.Visible = n.Owns("pedal");
        governor.Visible = n.Owns("governor");
        rack.Visible = n.Owns("jig");
        for (var i = 0; i < rackMachines.Count; i++) rackMachines[i].g.Visible = i < n.RackMachines;
        var spin = running ? Math.Min(30, 2 + n.MachineRate / 1000.0 * 0.6) * (n.BurstRunning ? 1.6 : 1) : 0;
        wheelAngle += spin * delta;
        wheel.Rotation = new Vector3((float)wheelAngle, 0, Mathf.Pi / 2);
        arm.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle) * 0.25f : 0);
        arm2.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle + 1.5) * 0.25f : 0);
        spool.Rotation = new Vector3(0, Mathf.DegToRad(30), running ? -(float)wheelAngle * 0.15f : spool.Rotation.Z);
        foreach (var rm in rackMachines)
        {
            rm.wheel.Rotation = new Vector3((float)wheelAngle * 1.1f, 0, Mathf.Pi / 2);
            rm.arm.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle * 1.1) * 0.25f : 0);
        }
        runLight.LightEnergy = running ? 0.3f + (n.BurstRunning ? 0.9f : 0) : 0;
        jamLedMat.AlbedoColor = jamLedMat.Emission = n.Jammed ? ((int)(t * 3) % 2 == 0 ? new Color(1f, 0.15f, 0.08f) : new Color(0.25f, 0.04f, 0.02f)) : running ? new Color(0.25f, 1f, 0.4f) : new Color(0.05f, 0.15f, 0.06f);

        // the glint along the wire
        var g = n.BurstReady ? 0.5f + 0.5f * (float)Math.Sin(t * 8) : 0;
        wireMat.EmissionEnergyMultiplier = n.BurstReady ? 1 + g * 3 : 0;
        glintLight.LightEnergy = n.BurstReady ? 0.4f + g : 0;

        // the spare coil's drawer, once there is a reason to look in it
        cabinetHint.LightEnergy = n.SpareOffered ? 0.3f + 0.2f * (float)Math.Sin(t * 3) : 0;

        // the phone rings while the courier waits for an answer
        var ringing = n.Courier?.Phase == CourierPhase.Offer;
        var handset = phone.GetNode<Node3D>("Handset");
        handset.Position = new Vector3(0, 0.068f + (ringing && (int)(t * 12) % 2 == 0 ? 0.006f : 0), -0.04f);

        // clips on the desk, sealed cartons on the floor, the trial run's envelope
        var loose = n.Loose;
        clips.Multimesh.VisibleInstanceCount = Math.Min(MaxClips, loose <= 120 ? loose : (int)Math.Round(120 + Math.Sqrt(loose - 120) * 14));
        var onFloor = n.Sealed - (n.VanCartons != null && n.VanAt != null && minute >= Cfg(n).VanMinute + 15 ? n.VanCartons.Value : 0);
        for (var i = 0; i < sealedCartons.Count; i++) sealedCartons[i].Visible = i < onFloor;
        envelope.Visible = n.Trial == Trial.Open;
        carton.Visible = n.Trial != Trial.Open && !n.Capped;

        // the hand bender's lever
        pressT = Math.Min(1, pressT + dt * 6);
        lever.RotationDegrees = new Vector3(0, 0, 20 - Mathf.Sin(pressT * Mathf.Pi) * 28);

        // only what can be used now catches the crosshair
        SetTarget(darkTarget, !n.Uncovered);
        SetTarget(glintTarget, n.BurstReady);
        SetTarget(machineTarget, n.Uncovered);
        SetTarget(phoneTarget, ringing);
        SetTarget(cabinetTarget, n.SpareOffered);
    }

    static OfficeConfig Cfg(Night n) => n.Cfg;

    static void SetTarget(StaticBody3D body, bool on) => body.CollisionLayer = on ? 2u : 0u;
}
