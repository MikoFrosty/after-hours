// First person: walk with WASD, look with the mouse. The camera's centre is the crosshair.
using Godot;

namespace AfterHours.Game;

public partial class Player : CharacterBody3D
{
    public Camera3D Camera { get; private set; } = null!;
    /// <summary>Movement and looking stop while the terminal or a dialog is open.</summary>
    public bool Frozen;
    public float Yaw;
    public float Pitch = -0.5f;
    const float Speed = 1.7f;
    const float Sensitivity = 0.0022f;

    public override void _Ready()
    {
        AddChild(new CollisionShape3D { Shape = new CapsuleShape3D { Radius = 0.25f, Height = 1.7f }, Position = new Vector3(0, 0.85f, 0) });
        Camera = new Camera3D { Position = new Vector3(0, 1.58f, 0), Fov = 70, Near = 0.03f, Far = 900 };
        AddChild(Camera);
    }

    public override void _UnhandledInput(InputEvent e)
    {
        if (Frozen || Input.MouseMode != Input.MouseModeEnum.Captured) return;
        if (e is InputEventMouseMotion m)
        {
            Yaw -= m.Relative.X * Sensitivity;
            Pitch = Mathf.Clamp(Pitch - m.Relative.Y * Sensitivity, -1.45f, 1.3f);
        }
    }

    public override void _PhysicsProcess(double delta)
    {
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
        MoveAndSlide();
    }
}
