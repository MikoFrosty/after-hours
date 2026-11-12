// The title screen, the pause menu and the settings, over the room.
using System;
using Godot;

namespace AfterHours.Game;

public partial class Menu : CanvasLayer
{
    public event Action<string>? Command;
    public event Action? SettingsChanged;
    public Settings S = new();

    Control root = null!;
    VBoxContainer title = null!, pause = null!, settings = null!;
    Button continueBtn = null!;
    Label continueNote = null!;
    string back = "title";
    public bool Open => root.Visible;
    public bool OnTitle => root.Visible && (title.Visible || (settings.Visible && back == "title"));

    static readonly Color Ink = new(0.91f, 0.89f, 0.84f), Muted = new(0.64f, 0.65f, 0.62f), Accent = new(0.84f, 0.64f, 0.4f);

    static Label Text(string s, int size, Color c)
    {
        var l = new Label { Text = s, HorizontalAlignment = HorizontalAlignment.Center };
        l.AddThemeFontSizeOverride("font_size", size);
        l.AddThemeColorOverride("font_color", c);
        return l;
    }

    Button Btn(VBoxContainer parent, string text, string cmd)
    {
        var b = new Button { Text = text, CustomMinimumSize = new Vector2(300, 46) };
        b.AddThemeFontSizeOverride("font_size", 18);
        b.Pressed += () => Command?.Invoke(cmd);
        parent.AddChild(b);
        return b;
    }

    public override void _Ready()
    {
        Layer = 10;
        root = new Control { Visible = false };
        root.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        AddChild(root);
        var dim = new ColorRect { Color = new Color(0.02f, 0.025f, 0.03f, 0.62f) };
        dim.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        root.AddChild(dim);
        var center = new CenterContainer();
        center.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        root.AddChild(center);
        var stack = new VBoxContainer();
        center.AddChild(stack);

        title = new VBoxContainer();
        title.AddThemeConstantOverride("separation", 12);
        title.AddChild(Text("AFTER HOURS", 54, Ink));
        title.AddChild(Text("Room 1104 · the night desk", 18, Accent));
        title.AddChild(new Control { CustomMinimumSize = new Vector2(0, 24) });
        continueBtn = Btn(title, "Continue the night", "continue");
        continueNote = Text("", 13, Muted);
        title.AddChild(continueNote);
        Btn(title, "New night", "new");
        Btn(title, "Settings", "settings");
        Btn(title, "Quit", "quit");
        stack.AddChild(title);

        pause = new VBoxContainer { Visible = false };
        pause.AddThemeConstantOverride("separation", 12);
        pause.AddChild(Text("PAUSED", 34, Ink));
        pause.AddChild(new Control { CustomMinimumSize = new Vector2(0, 12) });
        Btn(pause, "Resume", "resume");
        Btn(pause, "Settings", "settings");
        Btn(pause, "Save and return to the title", "title");
        Btn(pause, "Quit (the night is saved)", "quit");
        stack.AddChild(pause);

        settings = new VBoxContainer { Visible = false };
        settings.AddThemeConstantOverride("separation", 10);
        stack.AddChild(settings);
        Command += OnCommand;
    }

    void OnCommand(string cmd)
    {
        if (cmd == "settings") ShowSettings();
        if (cmd == "back") { if (back == "title") ShowTitle(SaveFile.Exists, null); else ShowPause(); }
    }

    public void ShowTitle(bool canContinue, string? savedAt)
    {
        root.Visible = true;
        title.Visible = true;
        pause.Visible = false;
        settings.Visible = false;
        back = "title";
        continueBtn.Visible = canContinue;
        continueNote.Visible = canContinue && savedAt != null;
        continueNote.Text = savedAt != null ? $"Saved {savedAt}" : "";
    }

    public void ShowPause()
    {
        root.Visible = true;
        title.Visible = false;
        pause.Visible = true;
        settings.Visible = false;
        back = "pause";
    }

    public void Close() => root.Visible = false;

    void ShowSettings()
    {
        title.Visible = false;
        pause.Visible = false;
        settings.Visible = true;
        foreach (var c in settings.GetChildren()) c.QueueFree();
        settings.AddChild(Text("SETTINGS", 30, Ink));
        void Slider(string label, float min, float max, float value, Func<float, string> show, Action<float> set)
        {
            var row = new HBoxContainer { CustomMinimumSize = new Vector2(520, 36) };
            var l = new Label { Text = label, CustomMinimumSize = new Vector2(190, 0) };
            l.AddThemeColorOverride("font_color", Ink);
            var v = new Label { Text = show(value), CustomMinimumSize = new Vector2(70, 0), HorizontalAlignment = HorizontalAlignment.Right };
            v.AddThemeColorOverride("font_color", Muted);
            var s = new HSlider { MinValue = min, MaxValue = max, Step = (max - min) / 100, Value = value, SizeFlagsHorizontal = Control.SizeFlags.ExpandFill, SizeFlagsVertical = Control.SizeFlags.ShrinkCenter };
            s.ValueChanged += x =>
            {
                set((float)x);
                v.Text = show((float)x);
                SettingsChanged?.Invoke();
            };
            row.AddChild(l);
            row.AddChild(s);
            row.AddChild(v);
            settings.AddChild(row);
        }
        string Pct(float x) => $"{Math.Round(x * 100)}%";
        Slider("Mouse sensitivity", 0.3f, 3f, S.Sensitivity, x => $"{x:0.0}×", x => S.Sensitivity = x);
        Slider("Brightness", 0.6f, 1.8f, S.Brightness, Pct, x => S.Brightness = x);
        Slider("Volume", 0, 1, S.Master, Pct, x => S.Master = x);
        Slider("Effects", 0, 1, S.Effects, Pct, x => S.Effects = x);
        Slider("Rain and room", 0, 1, S.Ambience, Pct, x => S.Ambience = x);
        Slider("3D resolution", 0.5f, 1f, S.RenderScale, Pct, x => S.RenderScale = x);
        var q = new HBoxContainer { CustomMinimumSize = new Vector2(520, 36) };
        var ql = new Label { Text = "Graphics", CustomMinimumSize = new Vector2(190, 0) };
        ql.AddThemeColorOverride("font_color", Ink);
        q.AddChild(ql);
        var opt = new OptionButton { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill };
        opt.AddItem("Low: no fog, shadows or ambient shading");
        opt.AddItem("Medium: shadows and ambient shading");
        opt.AddItem("High: everything, with light in the air");
        opt.Selected = S.Quality;
        opt.ItemSelected += i =>
        {
            S.Quality = (int)i;
            SettingsChanged?.Invoke();
        };
        q.AddChild(opt);
        settings.AddChild(q);
        void Check(string label, bool value, Action<bool> set)
        {
            var c = new CheckBox { Text = label, ButtonPressed = value };
            c.Toggled += on =>
            {
                set(on);
                SettingsChanged?.Invoke();
            };
            settings.AddChild(c);
        }
        Check("Full screen", S.Fullscreen, on => S.Fullscreen = on);
        Check("Invert mouse look up and down", S.InvertY, on => S.InvertY = on);
        settings.AddChild(new Control { CustomMinimumSize = new Vector2(0, 8) });
        Btn(settings, "Back", "back");
    }
}
