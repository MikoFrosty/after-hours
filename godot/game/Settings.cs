// The player's settings, kept in user://settings.json, and the save file for the night in user://night.json.
using System;
using System.Text.Json;
using AfterHours.Sim;
using Godot;

namespace AfterHours.Game;

public sealed class Settings
{
    public float Sensitivity { get; set; } = 1f;
    public bool InvertY { get; set; }
    public float Brightness { get; set; } = 1f;
    public float Master { get; set; } = 0.9f;
    public float Effects { get; set; } = 0.9f;
    public float Ambience { get; set; } = 0.7f;
    /// <summary>0 low, 1 medium, 2 high.</summary>
    public int Quality { get; set; } = 2;
    /// <summary>The 3D view's resolution as a share of the window's (the interface stays sharp).</summary>
    public float RenderScale { get; set; } = 1f;
    public bool Fullscreen { get; set; }

    const string Path = "user://settings.json";

    public static Settings Load()
    {
        try
        {
            if (FileAccess.FileExists(Path)) return JsonSerializer.Deserialize<Settings>(FileAccess.GetFileAsString(Path)) ?? new Settings();
        }
        catch (Exception e)
        {
            GD.PushWarning($"Settings could not be read, using defaults: {e.Message}");
        }
        return new Settings();
    }

    public void Save()
    {
        using var f = FileAccess.Open(Path, FileAccess.ModeFlags.Write);
        f?.StoreString(JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }
}

/// <summary>The night on disk: the Night itself, what is in the player's hands, and where they stand.</summary>
public sealed class SaveFile
{
    public NightSnapshot Night { get; set; } = new();
    public int Held { get; set; }
    public int Loaded { get; set; }
    public bool Bent { get; set; }
    public int BentCount { get; set; }
    public float X { get; set; }
    public float Z { get; set; }
    public float Yaw { get; set; }
    public float Pitch { get; set; }
    public string SavedAt { get; set; } = "";

    const string Path = "user://night.json";

    public static bool Exists => FileAccess.FileExists(Path);

    public static SaveFile? Load()
    {
        try
        {
            return Exists ? JsonSerializer.Deserialize<SaveFile>(FileAccess.GetFileAsString(Path)) : null;
        }
        catch (Exception e)
        {
            GD.PushWarning($"The saved night could not be read: {e.Message}");
            return null;
        }
    }

    public void Write()
    {
        SavedAt = DateTime.Now.ToString("g");
        // write to a temporary file first, so a crash mid-write never leaves a broken save
        using (var f = FileAccess.Open(Path + ".tmp", FileAccess.ModeFlags.Write))
        {
            if (f == null) return;
            f.StoreString(JsonSerializer.Serialize(this));
        }
        DirAccess.RenameAbsolute(ProjectSettings.GlobalizePath(Path + ".tmp"), ProjectSettings.GlobalizePath(Path));
    }

    public static void Delete()
    {
        if (Exists) DirAccess.RemoveAbsolute(ProjectSettings.GlobalizePath(Path));
    }
}
