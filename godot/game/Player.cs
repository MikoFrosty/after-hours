// First person: walk with WASD, look with the mouse. The camera's centre is the crosshair. What the player is
// holding (a length of wire) is drawn in front of the camera.
using Godot;
using static AfterHours.Game.Build;

namespace AfterHours.Game;

public partial class Player : CharacterBody3D
{
    public Camera3D Camera { get; private set; } = null!;
    /// <summary>Movement and looking stop while the terminal, a menu or the lever is being worked.</summary>
    public bool Frozen;
    public bool LookFrozen;
    public float Yaw;
    public float Pitch = -0.55f;
    public float Sensitivity = 0.0022f;
    public bool InvertY;
    /// <summary>Metres walked, for footsteps.</summary>
    public float Walked;
    const float Speed = 1.6f;
    /// <summary>Eye height: a little under 1.6 m, so the desk sits where a seated-height desk should.</summary>
    const float Eye = 1.5f;
    Node3D held = null!;
    float heldShown;
    double t;

    public override void _Ready()
    {
        AddChild(new CollisionShape3D { Shape = new CapsuleShape3D { Radius = 0.25f, Height = 1.6f }, Position = new Vector3(0, 0.8f, 0) });
        Camera = new Camera3D { Position = new Vector3(0, Eye, 0), Fov = 72, Near = 0.02f, Far = 900 };
        AddChild(Camera);
        // a length of wire, coiled loosely in the right hand
        held = new Node3D { Position = new Vector3(0.2f, -0.22f, -0.42f), Visible = false };
        Camera.AddChild(held);
        var wire = Mat(new Color(0.75f, 0.77f, 0.8f), 0.3f, 0.9f);
        for (var k = 0; k < 3; k++)
            held.AddChild(new MeshInstance3D { Mesh = Torus(0.045f, 0.0022f, 32, 6), MaterialOverride = wire, Position = new Vector3(0, k * 0.004f, 0), RotationDegrees = new Vector3(70, k * 25, 10) });
        TubeNode(held, new[] { new Vector3(0, 0.04f, 0), new Vector3(-0.04f, 0.06f, -0.05f), new Vector3(-0.1f, 0.07f, -0.11f) }, 0.0022f, wire);
        var hand = new StandardMaterial3D { AlbedoColor = new Color(0.55f, 0.4f, 0.32f), Roughness = 0.7f };
        var fist = RBox(held, new Vector3(0.07f, 0.06f, 0.09f), new Vector3(0.02f, -0.03f, 0.03f), hand, 0.025f);
        fist.RotationDegrees = new Vector3(10, -15, 0);
        RBox(held, new Vector3(0.075f, 0.07f, 0.2f), new Vector3(0.05f, -0.07f, 0.16f), new StandardMaterial3D { AlbedoColor = new Color(0.16f, 0.17f, 0.2f), Roughness = 0.9f }, 0.03f).RotationDegrees = new Vector3(15, -15, 0);
    }

    public override void _UnhandledInput(InputEvent e)
    {
        if (Frozen || LookFrozen || Input.MouseMode != Input.MouseModeEnum.Captured) return;
        if (e is InputEventMouseMotion m)
        {
            Yaw -= m.Relative.X * Sensitivity;
            Pitch = Mathf.Clamp(Pitch - m.Relative.Y * Sensitivity * (InvertY ? -1 : 1), -1.45f, 1.3f);
        }
    }

    /// <summary>Show or hide the wire in hand, sliding it into view.</summary>
    public void Hold(bool on, double delta)
    {
        heldShown = Mathf.MoveToward(heldShown, on ? 1 : 0, (float)delta * 6);
        held.Visible = heldShown > 0.01f;
        held.Position = new Vector3(0.2f, -0.22f - (1 - heldShown) * 0.25f + Mathf.Sin((float)t * 2) * 0.004f, -0.42f);
    }

    public override void _PhysicsProcess(double delta)
    {
        t += delta;
        Rotation = new Vector3(0, Yaw, 0);
        Camera.Rotation = new Vector3(Pitch, 0, 0);
        var v = Velocity;
        v.Y = IsOnFloor() ? 0 : v.Y - 9.8f * (float)delta;
        var input = Vector2.Zero;
        if (!Frozen)
        {
            if (Input.IsPhysicalKeyPressed(Key.W) || Input.IsPhysicalKeyPressed(Key.Up)) input.Y -= 1;
            if (Input.IsPhysicalKeyPressed(Key.S) || Input.IsPhysicalKeyPressed(Key.Down)) input.Y += 1;
            if (Input.IsPhysicalKeyPressed(Key.A) || Input.IsPhysicalKeyPressed(Key.Left)) input.X -= 1;
            if (Input.IsPhysicalKeyPressed(Key.D) || Input.IsPhysicalKeyPressed(Key.Right)) input.X += 1;
        }
        var dir = (Transform.Basis * new Vector3(input.X, 0, input.Y)).Normalized();
        var target = dir * Speed;
        v.X = Mathf.Lerp(v.X, target.X, Mathf.Min(1, (float)delta * 12));
        v.Z = Mathf.Lerp(v.Z, target.Z, Mathf.Min(1, (float)delta * 12));
        Velocity = v;
        var before = GlobalPosition;
        MoveAndSlide();
        Walked += new Vector2(GlobalPosition.X - before.X, GlobalPosition.Z - before.Z).Length();
        // a gentle bob while walking
        var speed = new Vector2(v.X, v.Z).Length();
        Camera.Position = new Vector3(0, Eye + Mathf.Sin(Walked * 9) * 0.012f * Mathf.Min(1, speed), 0);
    }
}
