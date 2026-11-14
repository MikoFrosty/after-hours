// Room 1104 at night, built in code: the desk, the lamp, the terminal, the machines, and the city through the window.
// Everything here is presentation: it reads the Night each frame and never changes it. The room is split across
// Room.cs (walls, window, furniture), Desk.cs (the desk and what is on it), Workbench.cs (making clips by hand),
// Machines.cs (the clip machines and upgrades) and Outside.cs (the city).
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
    public const float DeskY = 0.78f;
    const float WinZ0 = -1.7f, WinZ1 = -0.1f, WinY0 = 0.9f, WinY1 = 2.15f;
    /// <summary>The office is on the eleventh floor: the street is this far below the floor.</summary>
    const float Street = -34f;

    DirectionalLight3D moon = null!;
    ReflectionProbe probe = null!;
    OmniLight3D ceilingLight = null!;
    StandardMaterial3D ceilingPanel = null!;
    double t;
    float ceilingLevel = 0.35f;

    public Godot.Environment Env { get; private set; } = null!;
    /// <summary>Where the sound of each thing in the room comes from.</summary>
    public readonly Dictionary<string, Vector3> SoundAt = new();

    public override void _Ready()
    {
        BuildEnvironment();
        BuildRoom();
        BuildDesk();
        BuildWorkbench();
        BuildMachines();
        BuildOutside();
        GatherRoomLights();
        // switches for tracking down rendering problems: godot ... -- --off=fog,rain,moon,city,glow,ssao
        foreach (var a in OS.GetCmdlineUserArgs())
        {
            if (!a.StartsWith("--off=")) continue;
            var what = a[6..];
            if (what.Contains("fog")) { Env.VolumetricFogEnabled = false; Env.FogEnabled = false; }
            if (what.Contains("rain")) rain.Visible = false;
            if (what.Contains("moon")) moon.Visible = false;
            if (what.Contains("city")) city.Visible = false;
            if (what.Contains("glow")) Env.GlowEnabled = false;
            if (what.Contains("ssao")) Env.SsaoEnabled = false;
            if (what.Contains("probe")) probe.Visible = false;
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
            AmbientLightColor = new Color(0.24f, 0.28f, 0.36f),
            AmbientLightEnergy = 0.42f,
            TonemapMode = Godot.Environment.ToneMapper.Agx,
            TonemapExposure = 1.35f,
            SsaoEnabled = true,
            SsaoRadius = 0.5f,
            SsaoIntensity = 1.4f,
            GlowEnabled = true,
            GlowIntensity = 0.45f,
            GlowBloom = 0f,
            GlowHdrThreshold = 1.4f,
            FogEnabled = true,
            FogLightColor = new Color(0.13f, 0.11f, 0.12f),
            FogDensity = 0.0045f,
            FogSkyAffect = 0.15f,
            VolumetricFogEnabled = true,
            VolumetricFogDensity = 0.01f,
            VolumetricFogAlbedo = new Color(0.8f, 0.8f, 0.85f),
            VolumetricFogLength = 12,
            AdjustmentEnabled = true,
            AdjustmentSaturation = 0.9f,
            AdjustmentContrast = 1.05f,
        };
        AddChild(new WorldEnvironment { Environment = Env });

        // shiny things indoors reflect the room, not the night sky: without this the lamp shade, the mug and the
        // monitor show flat bands of the sky's low-resolution horizon colour once the lamp turns away from them
        probe = new ReflectionProbe
        {
            Size = new Vector3(X1 - X0, H, Z1 - Z0),
            Position = new Vector3((X0 + X1) / 2, H / 2, (Z0 + Z1) / 2),
            OriginOffset = new Vector3(0, DeskY + 0.4f - H / 2, -1.2f),
            BoxProjection = true,
            Interior = true,
            AmbientMode = ReflectionProbe.AmbientModeEnum.Disabled,
            UpdateMode = ReflectionProbe.UpdateModeEnum.Always,
            Intensity = 0.8f,
        };
        AddChild(probe);

        moon = new DirectionalLight3D
        {
            LightColor = new Color(0.45f, 0.55f, 0.75f),
            LightEnergy = 0.25f,
            ShadowEnabled = true,
            LightVolumetricFogEnergy = 0.3f,
            // moonlight only: the sky must not draw it as a sun
            SkyMode = DirectionalLight3D.SkyModeEnum.LightOnly,
        };
        AddChild(moon);
        moon.LookAtFromPosition(new Vector3(-10, 8, -1), new Vector3(0, 0, -0.5f), Vector3.Up);
    }

    /// <summary>Brightness from the settings: 1 is as designed.</summary>
    public void SetBrightness(float b) => Env.TonemapExposure = 1.35f * b;

    public void SetQuality(int q)
    {
        Env.SsaoEnabled = q >= 1;
        Env.VolumetricFogEnabled = q >= 2;
        Env.GlowEnabled = q >= 1;
        lampLight.ShadowEnabled = q >= 1;
        moon.ShadowEnabled = q >= 2;
        rain.Amount = q >= 2 ? 900 : q == 1 ? 500 : 250;
    }

    // ---------- each frame ----------

    public void Sync(Night n, HandWork hands, double delta)
    {
        t += delta;
        var dt = (float)delta;
        SyncDesk(n, dt);
        SyncWorkbench(n, hands, dt);
        SyncMachines(n, dt);
        SyncOutside(n, dt);
        // the overhead panel on night power: dim, and it hums and dips once in a while
        // until the lamp is turned toward the machine, the panel is at its dimmest and the far end of the desk stays dark
        var dip = Math.Sin(t * 0.37) > 0.995 ? 0.4f : 1f;
        ceilingLevel = Mathf.MoveToward(ceilingLevel, n.Uncovered ? 1 : 0.35f, dt * 0.5f);
        ceilingLight.LightEnergy = 0.55f * dip * ceilingLevel;
        ceilingPanel.EmissionEnergyMultiplier = 0.9f * dip * ceilingLevel;
        backLight.LightEnergy = 0.35f * dip * ceilingLevel;
    }

    /// <summary>Puts everything that eases over time where it is heading, at once (for screenshots).</summary>
    public void Settle(Night n)
    {
        aim = n.Uncovered ? AimMachine : AimAway;
        ceilingLevel = n.Uncovered ? 1 : 0.35f;
    }

    static void SetTarget(StaticBody3D body, bool on) => body.CollisionLayer = on ? 2u : 0u;
}
