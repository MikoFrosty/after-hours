// Outside the window: the street twelve floors down, the city, rain, the 5:22 van and the dawn.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom
{
    ShaderMaterial cityMat = null!;
    MultiMeshInstance3D city = null!;
    ProceduralSkyMaterial sky = null!;
    CpuParticles3D rain = null!;
    StandardMaterial3D rainMat = null!;
    Node3D van = null!;

    void BuildOutside()
    {
        // the city's buildings: windows drawn by a shader, lit fewer as the night goes on
        cityMat = new ShaderMaterial { Shader = GD.Load<Shader>("res://shaders/city.gdshader") };
        var boxes = new MultiMesh { TransformFormat = MultiMesh.TransformFormatEnum.Transform3D, Mesh = new BoxMesh { Size = Vector3.One } };
        var rng = new Random(21);
        var placed = new List<Transform3D>();
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
        city = new MultiMeshInstance3D { Multimesh = boxes, MaterialOverride = cityMat, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off };
        AddChild(city);

        // the street and the avenue's lamps
        Box(this, new Vector3(900, 0.2f, 900), new Vector3(-300, Street - 0.1f, 0), Mat(new Color(0.03f, 0.03f, 0.035f), 0.3f, 0.2f), false);
        var lampGlow = Glow(new Color(1f, 0.7f, 0.4f), 6);
        for (var i = -8; i <= 8; i++)
            foreach (var lx in new[] { -6f, -24f })
            {
                var z = i * 16f + (lx < -10 ? 8 : 0);
                Ball(this, 0.3f, new Vector3(lx, Street + 6, z), lampGlow);
                AddChild(new OmniLight3D { LightColor = new Color(1f, 0.65f, 0.35f), LightEnergy = 1.5f, OmniRange = 14, Position = new Vector3(lx, Street + 5.5f, z) });
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
        SoundAt["window"] = new Vector3(X0 + 0.1f, 1.5f, (WinZ0 + WinZ1) / 2);

        // the 5:22 van, across the street below, with its headlights
        van = new Node3D { Position = new Vector3(-20, Street, -2), Visible = false };
        AddChild(van);
        RBox(van, new Vector3(2.2f, 2.3f, 5.2f), new Vector3(0, 1.4f, 0), Mat(new Color(0.55f, 0.55f, 0.52f), 0.5f, 0.3f), 0.2f);
        foreach (var dx in new[] { -0.7f, 0.7f }) Ball(van, 0.15f, new Vector3(dx, 0.8f, 2.62f), Glow(new Color(1f, 0.95f, 0.8f), 8));
        van.AddChild(new SpotLight3D { LightColor = new Color(1f, 0.9f, 0.7f), LightEnergy = 6, SpotRange = 30, SpotAngle = 30, Position = new Vector3(0, 0.8f, 2.7f) });
    }

    /// <summary>How hard it is raining, 0 to 1, for the sound on the glass.</summary>
    public float RainAmount(Night n) => (float)Math.Clamp(1 - Math.Max(0, n.Minute - 240) / 160, 0.15, 1);

    void SyncOutside(Night n, float dt)
    {
        var minute = n.Minute;
        cityMat.SetShaderParameter("lit", Math.Max(0.06, 0.42 - minute / 900));
        var dawn = (float)Math.Clamp((minute - 300) / 80, 0, 1);
        sky.SkyTopColor = new Color(0.02f, 0.03f, 0.06f).Lerp(new Color(0.22f, 0.27f, 0.36f), dawn);
        sky.SkyHorizonColor = new Color(0.2f, 0.15f, 0.14f).Lerp(new Color(0.62f, 0.5f, 0.45f), dawn);
        moon.LightEnergy = 0.25f + dawn * 0.5f;
        moon.LightColor = new Color(0.45f, 0.55f, 0.75f).Lerp(new Color(0.8f, 0.7f, 0.65f), dawn);
        cityMat.SetShaderParameter("energy", 1.2f * (1 - dawn * 0.6f));
        rainMat.AlbedoColor = new Color(0.7f, 0.8f, 0.9f, 0.22f * RainAmount(n));
        van.Visible = n.VanAt != null && minute < n.Cfg.VanMinute + 15;
    }
}
