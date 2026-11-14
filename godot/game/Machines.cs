// The clip machine at the dark end of the desk, its wire spool, the upgrades, and the rack of machines under the window.
// An upgrade bought at the terminal builds itself where it belongs: a beam of light from the screen, and the part
// fading in, solid once it is installed.
using System;
using System.Collections.Generic;
using AfterHours.Sim;
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class OfficeRoom
{
    sealed class ClipMachineParts
    {
        public Node3D Root = null!;
        public Node3D Wheel = null!;
        public Node3D Arm = null!;
    }

    ClipMachineParts machine = null!;
    Node3D arm2 = null!, spring = null!, oil = null!, feeder = null!, feederWheel = null!, pedal = null!, governor = null!, rack = null!, spool = null!;
    readonly List<ClipMachineParts> rackMachines = new();
    StandardMaterial3D jamLedMat = null!, wireMat = null!;
    OmniLight3D glintLight = null!, runLight = null!, buildLight = null!;
    StaticBody3D darkTarget = null!, glintTarget = null!, machineTarget = null!;
    MeshInstance3D beam = null!;
    StandardMaterial3D beamMat = null!;
    CpuParticles3D sparks = null!;
    readonly Dictionary<string, (Node3D node, Vector3 at)> parts = new();
    double wheelAngle;

    /// <summary>The render layer of what sits at the dark end of the desk: the room's lights skip it until the lamp turns.</summary>
    const uint DarkLayer = 1u << 1;
    readonly List<GeometryInstance3D> darkEnd = new();
    readonly List<Light3D> roomLights = new();
    bool darkLit = true;

    ClipMachineParts ClipMachine(Node3D parent, Vector3 pos, float yawDeg, float scale = 1)
    {
        var g = new Node3D { Position = pos, RotationDegrees = new Vector3(0, yawDeg, 0), Scale = Vector3.One * scale };
        parent.AddChild(g);
        var body = Grain(new Color(0.16f, 0.27f, 0.21f), new Vector3(14, 14, 1), 0.45f, 0.4f, 121, 0.25f, 0.3f);
        var steel = Grain(new Color(0.55f, 0.57f, 0.6f), new Vector3(2, 30, 1), 0.3f, 0.3f, 122, 0.15f, 0.9f);
        var brass = Mat(new Color(0.62f, 0.46f, 0.2f), 0.3f, 0.85f);
        var foot = Mat(new Color(0.07f, 0.09f, 0.08f), 0.6f, 0.3f);
        RBox(g, new Vector3(0.34f, 0.045f, 0.22f), new Vector3(0, 0.0225f, 0), foot, 0.01f);
        RBox(g, new Vector3(0.16f, 0.14f, 0.13f), new Vector3(-0.04f, 0.115f, 0), body, 0.02f);
        RBox(g, new Vector3(0.05f, 0.03f, 0.05f), new Vector3(-0.04f, 0.2f, 0), body, 0.01f);
        // a brass maker's plate
        RBox(g, new Vector3(0.07f, 0.03f, 0.002f), new Vector3(-0.04f, 0.12f, 0.066f), brass, 0.002f, false);
        // the flywheel with its spokes
        var wheel = new Node3D { Position = new Vector3(0.085f, 0.12f, 0.02f) };
        g.AddChild(wheel);
        var rim = new MeshInstance3D { Mesh = Torus(0.055f, 0.008f, 32, 10), MaterialOverride = steel, RotationDegrees = new Vector3(0, 0, 90) };
        wheel.AddChild(rim);
        Cyl(wheel, 0.014f, 0.014f, 0.03f, Vector3.Zero, steel, 14).RotationDegrees = new Vector3(0, 0, 90);
        for (var i = 0; i < 4; i++)
        {
            var a = i * Mathf.Pi / 2;
            Rod(wheel, Vector3.Zero, new Vector3(0, Mathf.Cos(a) * 0.052f, Mathf.Sin(a) * 0.052f), 0.004f, steel, 6);
        }
        Cyl(g, 0.006f, 0.006f, 0.07f, new Vector3(0.05f, 0.12f, 0.02f), steel, 8).RotationDegrees = new Vector3(0, 0, 90);
        // the bending arm on top
        var arm = new Node3D { Position = new Vector3(-0.04f, 0.2f, 0) };
        g.AddChild(arm);
        RBox(arm, new Vector3(0.17f, 0.016f, 0.022f), new Vector3(-0.065f, 0, 0), brass, 0.006f);
        RBox(g, new Vector3(0.045f, 0.06f, 0.05f), new Vector3(-0.135f, 0.075f, 0.03f), steel, 0.008f);
        // the output lip, where finished clips come out
        RBox(g, new Vector3(0.05f, 0.004f, 0.06f), new Vector3(-0.15f, 0.05f, 0.06f), steel, 0.001f).RotationDegrees = new Vector3(20, 0, 0);
        return new ClipMachineParts { Root = g, Wheel = wheel, Arm = arm };
    }

    void BuildMachines()
    {
        machine = ClipMachine(this, new Vector3(0.3f, DeskY, -1.76f), 20, 1.15f);
        machineTarget = Target(machine.Root, "machine", new Vector3(0.36f, 0.26f, 0.24f), new Vector3(0, 0.11f, 0));
        jamLedMat = Glow(new Color(0.1f, 0.3f, 0.12f), 2);
        Ball(machine.Root, 0.008f, new Vector3(-0.04f, 0.18f, 0.066f), jamLedMat);
        runLight = new OmniLight3D { LightColor = new Color(1f, 0.65f, 0.35f), LightEnergy = 0, OmniRange = 0.7f, Position = new Vector3(0.3f, DeskY + 0.22f, -1.6f) };
        AddChild(runLight);
        SoundAt["machine"] = machine.Root.Position + new Vector3(0, 0.1f, 0);

        // the wire spool on its stand
        spool = new Node3D { Position = new Vector3(0.64f, DeskY + 0.115f, -1.84f), RotationDegrees = new Vector3(0, 30, 0) };
        AddChild(spool);
        var standMat = Mat(new Color(0.1f, 0.1f, 0.1f), 0.5f, 0.5f);
        var standBase = RBox(this, new Vector3(0.12f, 0.012f, 0.16f), new Vector3(0.64f, DeskY + 0.006f, -1.84f), standMat, 0.004f);
        standBase.RotationDegrees = new Vector3(0, 30, 0);
        darkEnd.Add(standBase);
        foreach (var side in new[] { -0.065f, 0.065f })
        {
            var post = RBox(this, new Vector3(0.012f, 0.12f, 0.03f), new Vector3(0.64f, DeskY + 0.06f, -1.84f) + new Vector3(Mathf.Sin(Mathf.DegToRad(30)) * side, 0, Mathf.Cos(Mathf.DegToRad(30)) * side), standMat, 0.004f);
            post.RotationDegrees = new Vector3(0, 30, 0);
            darkEnd.Add(post);
        }
        var spoolBody = new Node3D { RotationDegrees = new Vector3(90, 0, 0) };
        spool.AddChild(spoolBody);
        var copper = Grain(new Color(0.66f, 0.66f, 0.64f), new Vector3(40, 2, 1), 0.3f, 0.5f, 123, 0.4f, 0.9f);
        Cyl(spoolBody, 0.075f, 0.075f, 0.1f, Vector3.Zero, copper, 40);
        foreach (var y in new[] { -0.055f, 0.055f }) Cyl(spoolBody, 0.092f, 0.092f, 0.01f, new Vector3(0, y, 0), Mat(new Color(0.12f, 0.12f, 0.12f), 0.5f, 0.3f), 40);
        wireMat = new StandardMaterial3D { AlbedoColor = new Color(0.75f, 0.77f, 0.8f), Roughness = 0.3f, Metallic = 0.9f, EmissionEnabled = true, Emission = new Color(1f, 0.85f, 0.5f), EmissionEnergyMultiplier = 0 };
        darkEnd.Add(TubeNode(this, new[] { new Vector3(0.58f, DeskY + 0.18f, -1.82f), new Vector3(0.5f, DeskY + 0.17f, -1.8f), new Vector3(0.43f, DeskY + 0.16f, -1.79f), new Vector3(0.35f, DeskY + 0.15f, -1.76f) }, 0.0018f, wireMat));
        glintTarget = Target(this, "glint", new Vector3(0.28f, 0.14f, 0.14f), new Vector3(0.46f, DeskY + 0.16f, -1.79f));
        glintLight = new OmniLight3D { LightColor = new Color(1f, 0.9f, 0.7f), LightEnergy = 0, OmniRange = 0.8f, Position = new Vector3(0.46f, DeskY + 0.2f, -1.74f) };
        AddChild(glintLight);
        darkTarget = Target(this, "dark", new Vector3(0.62f, 0.34f, 0.38f), new Vector3(0.46f, DeskY + 0.14f, -1.79f));

        // upgrades: the wire spring, the oil can, the feeder, the second arm, the foot pedal, overnight mode
        var springPts = new Vector3[90];
        for (var i = 0; i < 90; i++) springPts[i] = new Vector3(Mathf.Cos(i * 0.6f) * 0.013f, i * 0.0011f, Mathf.Sin(i * 0.6f) * 0.013f);
        spring = new Node3D { Position = new Vector3(0.11f, 0.06f, 0.07f), RotationDegrees = new Vector3(0, 0, 90) };
        machine.Root.AddChild(spring);
        TubeNode(spring, springPts, 0.0016f, Mat(new Color(0.72f, 0.74f, 0.77f), 0.3f, 0.9f), 5);
        oil = new Node3D { Position = new Vector3(0.06f, DeskY, -1.9f), RotationDegrees = new Vector3(0, 40, 0) };
        AddChild(oil);
        var oilMat = Mat(new Color(0.5f, 0.13f, 0.07f), 0.45f, 0.5f);
        Lathe(oil, new[] { (0f, 0f), (0.04f, 0f), (0.042f, 0.005f), (0.04f, 0.05f), (0.02f, 0.075f), (0.008f, 0.08f), (0f, 0.08f) }, Vector3.Zero, oilMat);
        Rod(oil, new Vector3(0, 0.075f, 0), new Vector3(0.06f, 0.15f, 0), 0.0035f, Mat(new Color(0.6f, 0.6f, 0.6f), 0.3f, 0.9f), 8);
        feeder = new Node3D { Position = new Vector3(0.49f, DeskY, -1.68f), RotationDegrees = new Vector3(0, 25, 0) };
        AddChild(feeder);
        RBox(feeder, new Vector3(0.09f, 0.09f, 0.11f), new Vector3(0, 0.045f, 0), Grain(new Color(0.2f, 0.27f, 0.23f), new Vector3(14, 14, 1), 0.45f, 0.4f, 124, 0.25f, 0.3f), 0.012f);
        feederWheel = new Node3D { Position = new Vector3(0, 0.1f, 0) };
        feeder.AddChild(feederWheel);
        Cyl(feederWheel, 0.026f, 0.026f, 0.014f, Vector3.Zero, Mat(new Color(0.6f, 0.6f, 0.6f), 0.3f, 0.9f), 20);
        Ball(feeder, 0.006f, new Vector3(0.03f, 0.07f, 0.056f), Glow(new Color(1f, 0.6f, 0.2f), 3));
        arm2 = new Node3D { Position = new Vector3(-0.04f, 0.225f, -0.05f) };
        machine.Root.AddChild(arm2);
        RBox(arm2, new Vector3(0.17f, 0.016f, 0.022f), new Vector3(-0.065f, 0, 0), Mat(new Color(0.62f, 0.46f, 0.2f), 0.3f, 0.85f), 0.006f);
        pedal = new Node3D { Position = new Vector3(0.12f, 0, -1.28f) };
        AddChild(pedal);
        RBox(pedal, new Vector3(0.18f, 0.03f, 0.26f), new Vector3(0, 0.015f, 0), Mat(new Color(0.1f, 0.1f, 0.1f), 0.5f, 0.5f), 0.01f);
        RBox(pedal, new Vector3(0.14f, 0.018f, 0.2f), new Vector3(0, 0.042f, 0), Grain(new Color(0.25f, 0.25f, 0.25f), new Vector3(20, 20, 1), 0.5f, 0.8f, 125, 0.6f, 0.6f), 0.006f).RotationDegrees = new Vector3(-9, 0, 0);
        TubeNode(pedal, new[] { new Vector3(0, 0.02f, -0.13f), new Vector3(0.05f, 0.01f, -0.3f), new Vector3(0.15f, 0.01f, -0.45f), new Vector3(0.2f, DeskY - 0.05f, -0.6f) }, 0.004f, Mat(new Color(0.06f, 0.06f, 0.06f), 0.6f));
        governor = new Node3D { Position = new Vector3(-0.03f, DeskY, -1.92f) };
        AddChild(governor);
        RBox(governor, new Vector3(0.09f, 0.11f, 0.06f), new Vector3(0, 0.055f, 0), Mat(new Color(0.18f, 0.18f, 0.16f), 0.45f, 0.4f), 0.01f);
        Cyl(governor, 0.024f, 0.024f, 0.004f, new Vector3(0, 0.065f, 0.031f), Glow(new Color(0.45f, 1f, 0.55f), 1.6f), 24).RotationDegrees = new Vector3(90, 0, 0);
        Rod(governor, new Vector3(0, 0.065f, 0.033f), new Vector3(0.014f, 0.078f, 0.034f), 0.0015f, Mat(new Color(0.05f, 0.05f, 0.05f), 0.5f), 6);

        // the side-table rack under the window, with up to six machines
        rack = new Node3D { Position = new Vector3(-1.9f, 0, -0.9f) };
        AddChild(rack);
        var wood = Grain(new Color(0.3f, 0.2f, 0.12f), new Vector3(1.2f, 9, 1), 0.45f, 0.05f, 17, 0.3f);
        var dark = Grain(new Color(0.14f, 0.1f, 0.07f), new Vector3(2, 8, 1), 0.6f, 0.05f, 18, 0.25f);
        RBox(rack, new Vector3(0.5f, 0.035f, 1.2f), new Vector3(0, 0.66f, 0), wood, 0.01f);
        RBox(rack, new Vector3(0.46f, 0.02f, 1.14f), new Vector3(0, 0.22f, 0), dark, 0.004f);
        foreach (var (dx, dz) in new[] { (-0.22f, -0.57f), (0.22f, -0.57f), (-0.22f, 0.57f), (0.22f, 0.57f) })
            RBox(rack, new Vector3(0.035f, 0.66f, 0.035f), new Vector3(dx, 0.33f, dz), dark, 0.006f);
        Solid(rack, new Vector3(0.5f, 0.7f, 1.2f), new Vector3(0, 0.35f, 0));
        for (var i = 0; i < 6; i++)
            rackMachines.Add(ClipMachine(rack, new Vector3(i % 2 == 1 ? 0.12f : -0.1f, 0.678f, -0.42f + i / 2 * 0.4f + i % 2 * 0.08f), -90, 0.8f));
        SoundAt["rack"] = rack.Position + new Vector3(0, 0.8f, 0);

        // where each upgrade builds itself
        parts["calibrate"] = (machine.Root, machine.Root.Position + new Vector3(0, 0.12f, 0));
        parts["tensioner"] = (spring, machine.Root.Position + new Vector3(0.1f, 0.08f, 0.06f));
        parts["oil"] = (oil, oil.Position + new Vector3(0, 0.05f, 0));
        parts["feeder"] = (feeder, feeder.Position + new Vector3(0, 0.06f, 0));
        parts["die2"] = (arm2, machine.Root.Position + new Vector3(-0.06f, 0.24f, -0.05f));
        parts["pedal"] = (pedal, pedal.Position + new Vector3(0, 0.04f, 0));
        parts["governor"] = (governor, governor.Position + new Vector3(0, 0.06f, 0));
        parts["jig"] = (rack, rack.Position + new Vector3(0, 0.75f, -0.2f));
        parts["station6"] = (rack, rack.Position + new Vector3(0, 0.75f, 0.3f));

        // the beam from the screen and the sparks where the part takes shape
        beamMat = new StandardMaterial3D
        {
            AlbedoColor = new Color(0.5f, 1f, 0.7f, 0.5f),
            Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
            ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
            EmissionEnabled = true,
            Emission = new Color(0.5f, 1f, 0.7f),
            EmissionEnergyMultiplier = 2,
            NoDepthTest = false,
        };
        beam = new MeshInstance3D { Mesh = new CylinderMesh { TopRadius = 0.006f, BottomRadius = 0.006f, Height = 1, RadialSegments = 8 }, MaterialOverride = beamMat, Visible = false, CastShadow = GeometryInstance3D.ShadowCastingSetting.Off };
        AddChild(beam);
        sparks = new CpuParticles3D
        {
            Emitting = false,
            Amount = 60,
            Lifetime = 0.6f,
            EmissionShape = CpuParticles3D.EmissionShapeEnum.Sphere,
            EmissionSphereRadius = 0.07f,
            Direction = Vector3.Up,
            Spread = 180,
            InitialVelocityMin = 0.05f,
            InitialVelocityMax = 0.2f,
            Gravity = Vector3.Zero,
            ScaleAmountMin = 0.5f,
            ScaleAmountMax = 1,
            Mesh = new SphereMesh { Radius = 0.003f, Height = 0.006f, RadialSegments = 6, Rings = 3 },
            MaterialOverride = Glow(new Color(0.6f, 1f, 0.75f), 4),
        };
        AddChild(sparks);
        buildLight = new OmniLight3D { LightColor = new Color(0.5f, 1f, 0.7f), LightEnergy = 0, OmniRange = 0.9f };
        AddChild(buildLight);

        // the dark end of the desk: the machine (with the spring and second arm that mount on it), its spool, stand and wire
        darkEnd.AddRange(Meshes(machine.Root));
        darkEnd.AddRange(Meshes(spool));
        foreach (var g in darkEnd) g.Layers = DarkLayer;
    }

    /// <summary>Called once the whole room is built: the lights that keep away from the dark end until the lamp turns.</summary>
    void GatherRoomLights()
    {
        roomLights.AddRange(new Light3D[] { lampLight, lampFill, ceilingLight, backLight, screenLight, moon });
        SetDarkLit(false);
    }

    void SetDarkLit(bool lit)
    {
        if (lit == darkLit) return;
        darkLit = lit;
        foreach (var l in roomLights) l.LightCullMask = lit ? 0xFFFFFu : 0xFFFFFu & ~DarkLayer;
    }

    string? fadedId;
    readonly List<GeometryInstance3D> fading = new();

    void SyncMachines(Night n, float dt)
    {
        var running = !n.Capped && n.Owns("calibrate") && !n.Jammed && !n.MachinesHalted;
        var inst = n.Installing;
        bool Shown(string id) => n.Owns(id) || inst?.Id == id;
        spring.Visible = Shown("tensioner");
        oil.Visible = Shown("oil");
        feeder.Visible = Shown("feeder");
        arm2.Visible = Shown("die2");
        pedal.Visible = Shown("pedal");
        governor.Visible = Shown("governor");
        rack.Visible = Shown("jig");
        var rackCount = n.RackMachines + (inst?.Id == "jig" || inst?.Id == "station6" ? 3 : 0);
        for (var i = 0; i < rackMachines.Count; i++) rackMachines[i].Root.Visible = i < rackCount;

        // a part being installed fades in where it goes, with light from the screen
        var building = inst != null && parts.ContainsKey(inst.Id);
        if (inst?.Id != fadedId)
        {
            foreach (var g in fading) g.Transparency = 0;
            fading.Clear();
            fadedId = inst?.Id;
            if (inst != null && parts.TryGetValue(inst.Id, out var p) && inst.Id != "calibrate")
            {
                if (inst.Id == "station6") for (var i = 3; i < 6; i++) fading.AddRange(Meshes(rackMachines[i].Root));
                else if (inst.Id == "jig") { fading.AddRange(Meshes(rack)); }
                else fading.AddRange(Meshes(p.node));
            }
        }
        if (building)
        {
            var f = Mathf.Clamp(inst!.Ms / (float)n.Project(inst.Id).InstallMs, 0, 1);
            foreach (var g in fading) g.Transparency = 1 - f * f;
            var at = parts[inst.Id].at;
            var from = ScreenAt;
            beam.Visible = true;
            beam.Position = (from + at) / 2;
            var width = 1 + (float)Math.Sin(t * 30) * 0.3f;
            beam.Basis = new Basis(new Quaternion(Vector3.Up, (at - from).Normalized())) * Basis.FromScale(new Vector3(width, from.DistanceTo(at), width));
            beamMat.AlbedoColor = new Color(0.5f, 1f, 0.7f, 0.45f + 0.25f * (float)Math.Sin(t * 17));
            sparks.Position = at;
            sparks.Emitting = true;
            buildLight.Position = at + new Vector3(0, 0.05f, 0);
            buildLight.LightEnergy = 0.6f + 0.3f * (float)Math.Sin(t * 12);
        }
        else
        {
            beam.Visible = false;
            sparks.Emitting = false;
            buildLight.LightEnergy = 0;
        }

        var spin = running ? Math.Min(30, 2 + n.MachineRate / 1000.0 * 0.6) * (n.BurstRunning ? 1.6 : 1) : 0;
        wheelAngle += spin * dt;
        machine.Wheel.Rotation = new Vector3((float)wheelAngle, 0, 0);
        machine.Arm.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle) * 0.25f : 0);
        arm2.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle + 1.5) * 0.25f : 0);
        feederWheel.Rotation = new Vector3(0, (float)wheelAngle * 1.3f, 0);
        spool.Rotation = new Vector3(0, Mathf.DegToRad(30), running ? -(float)wheelAngle * 0.15f : spool.Rotation.Z);
        foreach (var rm in rackMachines)
        {
            rm.Wheel.Rotation = new Vector3((float)wheelAngle * 1.1f, 0, 0);
            rm.Arm.Rotation = new Vector3(0, 0, running ? (float)Math.Sin(wheelAngle * 1.1) * 0.25f : 0);
        }
        runLight.LightEnergy = running ? 0.35f + (n.BurstRunning ? 1.0f : 0) : 0;
        jamLedMat.AlbedoColor = jamLedMat.Emission = n.Jammed ? ((int)(t * 3) % 2 == 0 ? new Color(1f, 0.15f, 0.08f) : new Color(0.25f, 0.04f, 0.02f)) : running ? new Color(0.25f, 1f, 0.4f) : new Color(0.05f, 0.15f, 0.06f);

        // the glint along the wire
        var gl = n.BurstReady ? 0.5f + 0.5f * (float)Math.Sin(t * 8) : 0;
        wireMat.EmissionEnergyMultiplier = n.BurstReady ? 1 + gl * 3 : 0;
        glintLight.LightEnergy = n.BurstReady ? 0.5f + gl : 0;

        // the machine stays in shadow until the lamp has swung most of the way round to it
        SetDarkLit(n.Uncovered && aim.DistanceTo(AimMachine) < AimAway.DistanceTo(AimMachine) * 0.45f);
        SetTarget(darkTarget, !n.Uncovered);
        SetTarget(glintTarget, n.BurstReady);
        SetTarget(machineTarget, n.Uncovered);
    }

    /// <summary>The machines' speed, for their sound: 0 when stopped.</summary>
    public float MachineSpin(Night n) => !n.Capped && n.Owns("calibrate") && !n.Jammed && !n.MachinesHalted ? (float)Math.Min(1, 0.25 + n.MachineRate / 120_000.0) : 0;
}
