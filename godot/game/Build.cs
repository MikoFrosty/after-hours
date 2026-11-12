// Helpers for building the room in code: rounded boxes, turned shapes, tubes, surface materials and click targets.
using System;
using System.Collections.Generic;
using Godot;

namespace AfterHours.Game;

public static class Build
{
    // ---------- materials ----------

    public static StandardMaterial3D Mat(Color c, float rough = 0.8f, float metal = 0f) =>
        new() { AlbedoColor = c, Roughness = rough, Metallic = metal };

    public static StandardMaterial3D Glow(Color c, float energy = 1f) =>
        new() { AlbedoColor = c, EmissionEnabled = true, Emission = c, EmissionEnergyMultiplier = energy, ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded };

    static NoiseTexture2D Noise(float frequency, int seed, bool normal, float bump = 4, int octaves = 4, FastNoiseLite.NoiseTypeEnum type = FastNoiseLite.NoiseTypeEnum.Perlin) =>
        new()
        {
            Noise = new FastNoiseLite { Frequency = frequency, Seed = seed, FractalOctaves = octaves, NoiseType = type },
            Seamless = true,
            Width = 512,
            Height = 512,
            AsNormalMap = normal,
            BumpStrength = bump,
        };

    /// <summary>
    /// A surface with grain: noise in colour and relief. UVs are in metres (see RoundBox), so scale is repeats per metre;
    /// stretch one axis for wood or brushed metal.
    /// </summary>
    public static StandardMaterial3D Grain(Color c, Vector3 scale, float rough = 0.85f, float frequency = 0.02f, int seed = 1, float relief = 0.35f, float metal = 0f, float contrast = 1f)
    {
        var tex = Noise(frequency, seed, false);
        var grad = new Gradient();
        grad.SetColor(0, c.Darkened(0.3f * contrast));
        grad.SetColor(1, c.Lightened(0.1f * contrast));
        tex.ColorRamp = grad;
        var m = new StandardMaterial3D { AlbedoTexture = tex, Uv1Scale = scale, Roughness = rough, Metallic = metal };
        if (relief > 0)
        {
            m.NormalEnabled = true;
            m.NormalTexture = Noise(frequency * 1.7f, seed + 50, true, 6);
            m.NormalScale = relief;
        }
        return m;
    }

    /// <summary>A material from a texture drawn in code (carpet tiles, ceiling tiles, labels), with optional relief.</summary>
    public static StandardMaterial3D Painted(Image img, Vector3 scale, float rough = 0.9f, float relief = 0.25f, int seed = 3, float freq = 0.08f)
    {
        img.GenerateMipmaps();
        var m = new StandardMaterial3D { AlbedoTexture = ImageTexture.CreateFromImage(img), Uv1Scale = scale, Roughness = rough };
        if (relief > 0)
        {
            m.NormalEnabled = true;
            m.NormalTexture = Noise(freq, seed, true, 5);
            m.NormalScale = relief;
        }
        return m;
    }

    /// <summary>Carpet tiles: half-metre squares, each a slightly different shade, with fibre speckle.</summary>
    public static Image CarpetImage(Color c)
    {
        const int n = 256;
        var img = Image.CreateEmpty(n, n, false, Image.Format.Rgb8);
        var noise = new FastNoiseLite { Frequency = 0.35f, Seed = 9, NoiseType = FastNoiseLite.NoiseTypeEnum.Value };
        var rng = new Random(2);
        var shades = new float[4];
        for (var i = 0; i < 4; i++) shades[i] = (float)(rng.NextDouble() * 0.12 - 0.06);
        for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var tile = (x < n / 2 ? 0 : 1) + (y < n / 2 ? 0 : 2);
                var seam = x % (n / 2) < 2 || y % (n / 2) < 2 ? -0.08f : 0;
                var speck = noise.GetNoise2D(x, y) * 0.12f;
                // tiles laid in alternating directions show as faint stripes
                var stripe = (tile % 3 == 0 ? Mathf.Sin(x * 0.9f) : Mathf.Sin(y * 0.9f)) * 0.025f;
                var k = 1 + shades[tile] + seam + speck + stripe;
                img.SetPixel(x, y, new Color(c.R * k, c.G * k, c.B * k));
            }
        return img;
    }

    /// <summary>Suspended ceiling: sixty-centimetre tiles with pinholes and a metal grid.</summary>
    public static Image CeilingImage()
    {
        const int n = 256;
        var img = Image.CreateEmpty(n, n, false, Image.Format.Rgb8);
        var rng = new Random(5);
        img.Fill(new Color(0.42f, 0.41f, 0.38f));
        for (var i = 0; i < 2600; i++) img.SetPixel(rng.Next(n), rng.Next(n), new Color(0.3f, 0.29f, 0.27f));
        for (var i = 0; i < n; i++)
            for (var w = 0; w < 3; w++)
            {
                img.SetPixel(i, w, new Color(0.25f, 0.25f, 0.24f));
                img.SetPixel(w, i, new Color(0.25f, 0.25f, 0.24f));
            }
        return img;
    }

    /// <summary>A sheet of paper with grey lines of text.</summary>
    public static Image PaperImage(int seed, int lines = 22, bool heading = true)
    {
        const int w = 128, h = 176;
        var img = Image.CreateEmpty(w, h, false, Image.Format.Rgb8);
        img.Fill(new Color(0.86f, 0.84f, 0.78f));
        var rng = new Random(seed);
        var ink = new Color(0.25f, 0.25f, 0.28f);
        var y = 14;
        if (heading)
        {
            img.FillRect(new Rect2I(12, y, 60, 5), ink);
            y += 14;
        }
        for (var i = 0; i < lines && y < h - 12; i++)
        {
            var len = i % 6 == 5 ? rng.Next(20, 60) : rng.Next(80, 104);
            img.FillRect(new Rect2I(12, y, len, 2), new Color(0.45f, 0.45f, 0.47f));
            y += i % 6 == 5 ? 12 : 6;
        }
        return img;
    }

    // ---------- meshes ----------

    static readonly Dictionary<(Vector3, float), ArrayMesh> roundCache = new();

    /// <summary>
    /// A box with rounded edges: catches light along its edges like real furniture and equipment. UVs are in metres
    /// on each face, so textures keep the same scale on every object.
    /// </summary>
    public static ArrayMesh RoundBoxMesh(Vector3 size, float r)
    {
        var h = size / 2;
        r = Mathf.Min(r, Mathf.Min(h.X, Mathf.Min(h.Y, h.Z)) * 0.95f);
        if (roundCache.TryGetValue((size, r), out var cached)) return cached;
        float[] Axis(float hh) => hh - r <= -hh + r + 0.0001f
            ? new[] { -hh, -hh + r * 0.29f, 0, hh - r * 0.29f, hh }
            : new[] { -hh, -hh + r * 0.29f, -hh + r, hh - r, hh - r * 0.29f, hh };
        var inner = h - new Vector3(r, r, r);
        Vector3 Shape(Vector3 p)
        {
            var c = new Vector3(Mathf.Clamp(p.X, -inner.X, inner.X), Mathf.Clamp(p.Y, -inner.Y, inner.Y), Mathf.Clamp(p.Z, -inner.Z, inner.Z));
            var d = p - c;
            return d.LengthSquared() < 1e-10f ? p : c + d.Normalized() * r;
        }
        Vector3 Norm(Vector3 p, Vector3 face)
        {
            var c = new Vector3(Mathf.Clamp(p.X, -inner.X, inner.X), Mathf.Clamp(p.Y, -inner.Y, inner.Y), Mathf.Clamp(p.Z, -inner.Z, inner.Z));
            var d = p - c;
            return d.LengthSquared() < 1e-10f ? face : d.Normalized();
        }
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);
        for (var axis = 0; axis < 3; axis++)
            for (var sign = -1; sign <= 1; sign += 2)
            {
                var ua = (axis + 1) % 3;
                var va = (axis + 2) % 3;
                var us = Axis(h[ua]);
                var vs = Axis(h[va]);
                var face = Vector3.Zero;
                face[axis] = sign;
                for (var i = 0; i < us.Length - 1; i++)
                    for (var j = 0; j < vs.Length - 1; j++)
                    {
                        Vector3 P(int a, int b)
                        {
                            var p = Vector3.Zero;
                            p[axis] = sign * h[axis];
                            p[ua] = us[a];
                            p[va] = vs[b];
                            return p;
                        }
                        var quad = new[] { P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1) };
                        void V(Vector3 p)
                        {
                            st.SetNormal(Norm(p, face));
                            st.SetUV(new Vector2(p[ua], -p[va]));
                            st.AddVertex(Shape(p));
                        }
                        Tri(quad[0], quad[1], quad[2], face, V);
                        Tri(quad[0], quad[2], quad[3], face, V);
                    }
            }
        st.GenerateTangents();
        var mesh = st.Commit();
        roundCache[(size, r)] = mesh;
        return mesh;
    }

    /// <summary>Emit a triangle wound so it faces along n (Godot treats clockwise as the front).</summary>
    static void Tri(Vector3 a, Vector3 b, Vector3 c, Vector3 n, Action<Vector3> v)
    {
        if ((b - a).Cross(c - a).Dot(n) > 0) (b, c) = (c, b);
        v(a);
        v(b);
        v(c);
    }

    /// <summary>A shape turned on a lathe around the Y axis from a profile of (radius, height) points.</summary>
    public static ArrayMesh LatheMesh((float r, float y)[] profile, int segments = 32, bool flipFaces = false)
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);
        for (var i = 0; i < profile.Length - 1; i++)
            for (var s = 0; s < segments; s++)
            {
                float a0 = Mathf.Tau * s / segments, a1 = Mathf.Tau * (s + 1) / segments;
                Vector3 P(int k, float a) => new(profile[k].r * Mathf.Cos(a), profile[k].y, profile[k].r * Mathf.Sin(a));
                var p00 = P(i, a0);
                var p01 = P(i, a1);
                var p10 = P(i + 1, a0);
                var p11 = P(i + 1, a1);
                var mid = (p00 + p11) / 2;
                var outward = new Vector3(mid.X, 0, mid.Z).Normalized();
                // the profile's own slope tilts the normal
                var dr = profile[i + 1].r - profile[i].r;
                var dy = profile[i + 1].y - profile[i].y;
                var n = (outward * dy - Vector3.Up * dr).Normalized();
                if (n.LengthSquared() < 0.5f) n = outward;
                if (flipFaces) n = -n;
                void V(Vector3 p)
                {
                    var o = new Vector3(p.X, 0, p.Z).Normalized();
                    var pn = (o * dy - Vector3.Up * dr).Normalized();
                    st.SetNormal(flipFaces ? -pn : pn);
                    st.SetUV(new Vector2(Mathf.Atan2(p.Z, p.X) / Mathf.Tau, p.Y));
                    st.AddVertex(p);
                }
                Tri(p00, p10, p11, n, V);
                Tri(p00, p11, p01, n, V);
            }
        st.GenerateTangents();
        return st.Commit();
    }

    /// <summary>A tube along a path (springs, wire, paperclips, cables).</summary>
    public static ArrayMesh Tube(Vector3[] path, float radius, int sides = 6)
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);
        var rings = new Vector3[path.Length][];
        var normals = new Vector3[path.Length][];
        var prevSide = Vector3.Zero;
        for (var i = 0; i < path.Length; i++)
        {
            var dir = (i < path.Length - 1 ? path[i + 1] - path[i] : path[i] - path[i - 1]).Normalized();
            var side = prevSide == Vector3.Zero ? dir.Cross(Mathf.Abs(dir.Y) < 0.9f ? Vector3.Up : Vector3.Right).Normalized() : (prevSide - dir * prevSide.Dot(dir)).Normalized();
            prevSide = side;
            var up = side.Cross(dir).Normalized();
            rings[i] = new Vector3[sides];
            normals[i] = new Vector3[sides];
            for (var k = 0; k < sides; k++)
            {
                var a = Mathf.Tau * k / sides;
                normals[i][k] = side * Mathf.Cos(a) + up * Mathf.Sin(a);
                rings[i][k] = path[i] + normals[i][k] * radius;
            }
        }
        for (var i = 0; i < path.Length - 1; i++)
            for (var k = 0; k < sides; k++)
            {
                var k2 = (k + 1) % sides;
                var n = (normals[i][k] + normals[i][k2] + normals[i + 1][k] + normals[i + 1][k2]).Normalized();
                void V(Vector3 p)
                {
                    st.SetNormal(n);
                    st.AddVertex(p);
                }
                Tri(rings[i][k], rings[i + 1][k], rings[i][k2], n, V);
                Tri(rings[i][k2], rings[i + 1][k], rings[i + 1][k2], n, V);
            }
        return st.Commit();
    }

    public static ArrayMesh Torus(float major, float minor, int segments = 32, int sides = 10)
    {
        var path = new Vector3[segments + 1];
        for (var i = 0; i <= segments; i++) path[i] = new Vector3(Mathf.Cos(Mathf.Tau * i / segments) * major, 0, Mathf.Sin(Mathf.Tau * i / segments) * major);
        return Tube(path, minor, sides);
    }

    // ---------- nodes ----------

    static MeshInstance3D Add(Node3D parent, Mesh mesh, Vector3 pos, Material m, bool shadow = true)
    {
        var mi = new MeshInstance3D { Mesh = mesh, MaterialOverride = m, Position = pos };
        mi.CastShadow = shadow ? GeometryInstance3D.ShadowCastingSetting.On : GeometryInstance3D.ShadowCastingSetting.Off;
        parent.AddChild(mi);
        return mi;
    }

    public static MeshInstance3D Box(Node3D parent, Vector3 size, Vector3 pos, Material m, bool shadow = true) =>
        Add(parent, new BoxMesh { Size = size }, pos, m, shadow);

    /// <summary>A box with rounded edges (radius r, default a fifth of the smallest side, at most 1.5 cm).</summary>
    public static MeshInstance3D RBox(Node3D parent, Vector3 size, Vector3 pos, Material m, float r = -1, bool shadow = true) =>
        Add(parent, RoundBoxMesh(size, r < 0 ? Mathf.Min(0.015f, Mathf.Min(size.X, Mathf.Min(size.Y, size.Z)) * 0.2f) : r), pos, m, shadow);

    public static MeshInstance3D Cyl(Node3D parent, float rTop, float rBottom, float h, Vector3 pos, Material m, int seg = 24) =>
        Add(parent, new CylinderMesh { TopRadius = rTop, BottomRadius = rBottom, Height = h, RadialSegments = seg }, pos, m);

    public static MeshInstance3D Ball(Node3D parent, float r, Vector3 pos, Material m) =>
        Add(parent, new SphereMesh { Radius = r, Height = r * 2, RadialSegments = 16, Rings = 8 }, pos, m);

    public static MeshInstance3D Lathe(Node3D parent, (float r, float y)[] profile, Vector3 pos, Material m, int seg = 32) =>
        Add(parent, LatheMesh(profile, seg), pos, m);

    public static MeshInstance3D TubeNode(Node3D parent, Vector3[] path, float radius, Material m, int sides = 6) =>
        Add(parent, Tube(path, radius, sides), Vector3.Zero, m);

    /// <summary>A rod between two points.</summary>
    public static MeshInstance3D Rod(Node3D parent, Vector3 a, Vector3 b, float radius, Material m, int seg = 10)
    {
        var rod = Cyl(parent, radius, radius, a.DistanceTo(b), (a + b) / 2, m, seg);
        rod.Basis = new Basis(new Quaternion(Vector3.Up, (b - a).Normalized()));
        return rod;
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

    /// <summary>Every mesh under a node, for fading things in and out.</summary>
    public static List<GeometryInstance3D> Meshes(Node node)
    {
        var list = new List<GeometryInstance3D>();
        void Walk(Node n)
        {
            if (n is GeometryInstance3D g) list.Add(g);
            foreach (var c in n.GetChildren()) Walk(c);
        }
        Walk(node);
        return list;
    }
}
