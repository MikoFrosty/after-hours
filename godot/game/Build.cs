// Small helpers for building the room in code: boxes, cylinders, materials and click targets.
using Godot;

namespace AfterHours.Game;

public static class Build
{
    public static StandardMaterial3D Mat(Color c, float rough = 0.8f, float metal = 0f) =>
        new() { AlbedoColor = c, Roughness = rough, Metallic = metal };

    public static StandardMaterial3D Glow(Color c, float energy = 1f) =>
        new() { AlbedoColor = c, EmissionEnabled = true, Emission = c, EmissionEnergyMultiplier = energy, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded };

    /// <summary>A grainy material: noise in the albedo, stretched along one axis for wood.</summary>
    public static StandardMaterial3D Grain(Color c, Vector3 scale, float rough = 0.85f, float frequency = 0.02f, int seed = 1)
    {
        var noise = new FastNoiseLite { Frequency = frequency, Seed = seed, FractalOctaves = 4 };
        var tex = new NoiseTexture2D { Noise = noise, Seamless = true, Width = 256, Height = 256 };
        var grad = new Gradient();
        grad.SetColor(0, c.Darkened(0.35f));
        grad.SetColor(1, c.Lightened(0.12f));
        tex.ColorRamp = grad;
        return new StandardMaterial3D { AlbedoTexture = tex, Uv1Scale = scale, Roughness = rough };
    }

    public static MeshInstance3D Box(Node3D parent, Vector3 size, Vector3 pos, Material m, bool shadow = true)
    {
        var mi = new MeshInstance3D { Mesh = new BoxMesh { Size = size }, MaterialOverride = m, Position = pos };
        mi.CastShadow = shadow ? GeometryInstance3D.ShadowCastingSetting.On : GeometryInstance3D.ShadowCastingSetting.Off;
        parent.AddChild(mi);
        return mi;
    }

    public static MeshInstance3D Cyl(Node3D parent, float rTop, float rBottom, float h, Vector3 pos, Material m, int seg = 24)
    {
        var mi = new MeshInstance3D { Mesh = new CylinderMesh { TopRadius = rTop, BottomRadius = rBottom, Height = h, RadialSegments = seg }, MaterialOverride = m, Position = pos };
        parent.AddChild(mi);
        return mi;
    }

    public static MeshInstance3D Ball(Node3D parent, float r, Vector3 pos, Material m)
    {
        var mi = new MeshInstance3D { Mesh = new SphereMesh { Radius = r, Height = r * 2, RadialSegments = 16, Rings = 8 }, MaterialOverride = m, Position = pos };
        parent.AddChild(mi);
        return mi;
    }

    /// <summary>An invisible solid the player cannot walk through.</summary>
    public static StaticBody3D Solid(Node3D parent, Vector3 size, Vector3 pos)
    {
        var body = new StaticBody3D { Position = pos };
        body.AddChild(new CollisionShape3D { Shape = new BoxShape3D { Size = size } });
        parent.AddChild(body);
        return body;
    }

    /// <summary>Something the player can look at and use: the crosshair ray finds it by its name.</summary>
    public static StaticBody3D Target(Node3D parent, string target, Vector3 size, Vector3 pos)
    {
        var body = new StaticBody3D { Position = pos, CollisionLayer = 2, CollisionMask = 0 };
        body.SetMeta("target", target);
        body.AddChild(new CollisionShape3D { Shape = new BoxShape3D { Size = size } });
        parent.AddChild(body);
        return body;
    }

    /// <summary>A tube along a path (springs, wire, paperclips).</summary>
    public static ArrayMesh Tube(Vector3[] path, float radius, int sides = 6)
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);
        var rings = new Vector3[path.Length][];
        for (var i = 0; i < path.Length; i++)
        {
            var dir = (i < path.Length - 1 ? path[i + 1] - path[i] : path[i] - path[i - 1]).Normalized();
            var side = dir.Cross(Mathf.Abs(dir.Y) < 0.9f ? Vector3.Up : Vector3.Right).Normalized();
            var up = side.Cross(dir).Normalized();
            rings[i] = new Vector3[sides];
            for (var k = 0; k < sides; k++)
            {
                var a = Mathf.Tau * k / sides;
                rings[i][k] = path[i] + (side * Mathf.Cos(a) + up * Mathf.Sin(a)) * radius;
            }
        }
        for (var i = 0; i < path.Length - 1; i++)
            for (var k = 0; k < sides; k++)
            {
                var k2 = (k + 1) % sides;
                var a = rings[i][k];
                var b = rings[i][k2];
                var c = rings[i + 1][k];
                var d = rings[i + 1][k2];
                foreach (var v in new[] { a, c, b, b, c, d })
                {
                    st.SetNormal((v - path[i]).Normalized());
                    st.AddVertex(v);
                }
            }
        st.GenerateNormals();
        return st.Commit();
    }
}
