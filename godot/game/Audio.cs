// The room's sound: one-shot effects placed where they happen, and loops for the rain, the room, the machines and
// the terminal. Two buses, "Effects" and "Ambience", under the master, for the volume settings.
using System;
using System.Collections.Generic;
using Godot;

namespace AfterHours.Game;

public partial class Audio : Node3D
{
    Dictionary<string, AudioStreamWav> sounds = null!;
    readonly List<AudioStreamPlayer3D> pool = new();
    AudioStreamPlayer ui = null!;
    AudioStreamPlayer3D rain = null!, machine = null!, rackHum = null!, crt = null!;
    AudioStreamPlayer room = null!;
    int next;

    /// <summary>Where each named sound comes from (the room fills this in).</summary>
    public Dictionary<string, Vector3> At = new();

    static int Bus(string name)
    {
        var i = AudioServer.GetBusIndex(name);
        if (i >= 0) return i;
        AudioServer.AddBus();
        i = AudioServer.BusCount - 1;
        AudioServer.SetBusName(i, name);
        AudioServer.SetBusSend(i, "Master");
        return i;
    }

    public override void _Ready()
    {
        Bus("Effects");
        Bus("Ambience");
        sounds = Sfx.All();
        for (var i = 0; i < 12; i++)
        {
            var p = new AudioStreamPlayer3D { Bus = "Effects", UnitSize = 3, MaxDistance = 25, AttenuationFilterCutoffHz = 9000 };
            AddChild(p);
            pool.Add(p);
        }
        ui = new AudioStreamPlayer { Bus = "Effects" };
        AddChild(ui);
        room = new AudioStreamPlayer { Bus = "Ambience", Stream = sounds["roomLoop"], VolumeDb = -14 };
        AddChild(room);
        rain = Loop("rainLoop", -8);
        machine = Loop("machineLoop", -80);
        rackHum = Loop("machineLoop", -80);
        crt = Loop("crtLoop", -20);
    }

    AudioStreamPlayer3D Loop(string id, float db)
    {
        var p = new AudioStreamPlayer3D { Bus = "Ambience", Stream = sounds[id], VolumeDb = db, UnitSize = 2.5f, MaxDistance = 30 };
        AddChild(p);
        return p;
    }

    /// <summary>Start the loops once the room has said where things are.</summary>
    public void Begin()
    {
        rain.Position = At.GetValueOrDefault("window");
        machine.Position = At.GetValueOrDefault("machine");
        rackHum.Position = At.GetValueOrDefault("rack");
        crt.Position = At.GetValueOrDefault("monitor");
        room.Play();
        rain.Play();
        machine.Play();
        rackHum.Play();
        crt.Play();
    }

    /// <summary>Play a sound where a named thing is (or in the player's ears when it has no place).</summary>
    public void Play(string id, string? where = null, float db = 0, float pitch = 1)
    {
        if (!sounds.TryGetValue(id, out var stream)) return;
        if (where == null || !At.TryGetValue(where, out var pos))
        {
            ui.Stream = stream;
            ui.VolumeDb = db - 4;
            ui.PitchScale = pitch;
            ui.Play();
            return;
        }
        PlayAt(id, pos, db, pitch);
    }

    public void PlayAt(string id, Vector3 pos, float db = 0, float pitch = 1)
    {
        if (!sounds.TryGetValue(id, out var stream)) return;
        var p = pool[next];
        next = (next + 1) % pool.Count;
        p.Stream = stream;
        p.Position = pos;
        p.VolumeDb = db;
        p.PitchScale = pitch * (1 + (float)GD.RandRange(-0.03, 0.03));
        p.Play();
    }

    /// <summary>Where each of the Night's sounds comes from.</summary>
    public static string? Place(string id) => id switch
    {
        "tape" => "carton",
        "install" or "startInstall" or "fullSpeed" => "machine",
        "jam" or "free" or "catch" or "glint" or "cleanEnd" => "machine",
        "phone" => "phone",
        "van" => "window",
        "file" or "notice" or "switch" => "monitor",
        _ => null,
    };

    /// <summary>Loops follow the room: the machines' speed, the rain, the rack.</summary>
    public void Sync(float machineSpin, float rainAmount, int rackMachines, double delta)
    {
        static float Db(float v) => v <= 0.001f ? -80 : Mathf.LinearToDb(v);
        machine.VolumeDb = Mathf.Lerp(machine.VolumeDb, Db(machineSpin * 0.9f) - 6, (float)delta * 4);
        machine.PitchScale = 0.7f + machineSpin * 0.9f;
        rackHum.VolumeDb = Mathf.Lerp(rackHum.VolumeDb, Db(machineSpin * rackMachines / 6f) - 8, (float)delta * 4);
        rackHum.PitchScale = 0.85f + machineSpin * 0.7f;
        rain.VolumeDb = Db(rainAmount) - 8;
    }

    public static void SetVolumes(float master, float effects, float ambience)
    {
        static float Db(float v) => v <= 0.001f ? -80 : Mathf.LinearToDb(v);
        AudioServer.SetBusVolumeDb(0, Db(master));
        AudioServer.SetBusVolumeDb(Bus("Effects"), Db(effects));
        AudioServer.SetBusVolumeDb(Bus("Ambience"), Db(ambience));
    }
}
