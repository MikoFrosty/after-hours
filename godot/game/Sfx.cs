// Every sound in the room, synthesized when the game starts: no audio files. Short effects for the night's
// events and the player's hands, and loops for the rain, the room, the machines and the terminal.
using System;
using System.Collections.Generic;
using Godot;

namespace AfterHours.Game;

public static class Sfx
{
    const int Rate = 22050;
    static readonly Random rng = new(7);

    static float[] Buf(double seconds) => new float[(int)(seconds * Rate)];
    static float Noise() => (float)(rng.NextDouble() * 2 - 1);

    /// <summary>Add a tone: frequency sweeps from f0 to f1, with an attack and an exponential decay.</summary>
    static void Tone(float[] b, double start, double dur, double f0, double f1, float vol, double attack = 0.005, double decay = 6, string wave = "sine")
    {
        var s0 = (int)(start * Rate);
        var n = (int)(dur * Rate);
        double phase = 0;
        for (var i = 0; i < n && s0 + i < b.Length; i++)
        {
            var u = (double)i / n;
            var f = f0 + (f1 - f0) * u;
            phase += f / Rate;
            var x = wave switch
            {
                "square" => Math.Sign(Math.Sin(phase * Math.Tau)) * 0.6,
                "saw" => (phase % 1) * 2 - 1,
                "tri" => 1 - 4 * Math.Abs((phase % 1) - 0.5),
                _ => Math.Sin(phase * Math.Tau),
            };
            var t = (double)i / Rate;
            var env = Math.Min(1, t / attack) * Math.Exp(-decay * u);
            b[s0 + i] += (float)(x * env * vol);
        }
    }

    /// <summary>Add filtered noise: low-pass cutoff from c0 to c1 (0-1), with a decay.</summary>
    static void Hiss(float[] b, double start, double dur, float vol, double c0 = 0.3, double c1 = 0.3, double attack = 0.003, double decay = 5, bool high = false)
    {
        var s0 = (int)(start * Rate);
        var n = (int)(dur * Rate);
        float lp = 0;
        for (var i = 0; i < n && s0 + i < b.Length; i++)
        {
            var u = (double)i / n;
            var c = (float)(c0 + (c1 - c0) * u);
            var x = Noise();
            lp += c * (x - lp);
            var y = high ? x - lp : lp;
            var t = (double)i / Rate;
            var env = Math.Min(1, t / attack) * Math.Exp(-decay * u);
            b[s0 + i] += (float)(y * env * vol);
        }
    }

    /// <summary>A metallic ping: a few inharmonic partials ringing down.</summary>
    static void Ping(float[] b, double start, double f, float vol, double dur = 0.25)
    {
        foreach (var (mult, v) in new[] { (1.0, 1f), (2.76, 0.5f), (5.4, 0.25f), (8.9, 0.12f) })
            Tone(b, start, dur, f * mult, f * mult, vol * v, 0.001, 9 + mult);
    }

    static AudioStreamWav Wav(float[] b, bool loop = false, float gain = 1)
    {
        var peak = 0f;
        foreach (var x in b) peak = Math.Max(peak, Math.Abs(x));
        var k = peak > 0.95f ? 0.95f / peak : 1f;
        var data = new byte[b.Length * 2];
        for (var i = 0; i < b.Length; i++)
        {
            var v = (short)Math.Clamp(b[i] * k * gain * 32767, -32768, 32767);
            data[i * 2] = (byte)(v & 0xff);
            data[i * 2 + 1] = (byte)((v >> 8) & 0xff);
        }
        var w = new AudioStreamWav { Format = AudioStreamWav.FormatEnum.Format16Bits, MixRate = Rate, Stereo = false, Data = data };
        if (loop)
        {
            w.LoopMode = AudioStreamWav.LoopModeEnum.Forward;
            w.LoopBegin = 0;
            w.LoopEnd = b.Length;
        }
        return w;
    }

    /// <summary>Make a loop seamless by crossfading its end into its start.</summary>
    static float[] Seamless(float[] b, double fade = 0.25)
    {
        var n = (int)(fade * Rate);
        var outp = new float[b.Length - n];
        Array.Copy(b, outp, outp.Length);
        for (var i = 0; i < n; i++)
        {
            var u = (float)i / n;
            outp[i] = b[i] * u + b[outp.Length + i] * (1 - u);
        }
        return outp;
    }

    public static Dictionary<string, AudioStreamWav> All()
    {
        var s = new Dictionary<string, AudioStreamWav>();
        float[] b;

        // ---------- hands ----------
        b = Buf(0.35); Hiss(b, 0, 0.3, 0.5f, 0.6, 0.15, 0.02, 3, true); Ping(b, 0.25, 2400, 0.15f, 0.1); s["wirePull"] = Wav(b);
        b = Buf(0.3); Hiss(b, 0, 0.18, 0.35f, 0.5, 0.2, 0.01, 4, true); Ping(b, 0.17, 900, 0.4f, 0.12); Hiss(b, 0.17, 0.05, 0.4f, 0.4, 0.4, 0.001, 8); s["feed"] = Wav(b);
        b = Buf(0.45); Tone(b, 0, 0.3, 140, 90, 0.25f, 0.05, 2, "saw"); Hiss(b, 0, 0.3, 0.12f, 0.08, 0.04, 0.05, 2); Ping(b, 0.3, 320, 0.6f, 0.15); Hiss(b, 0.3, 0.08, 0.6f, 0.5, 0.1, 0.001, 9); s["bend"] = Wav(b);
        b = Buf(0.25); Hiss(b, 0, 0.04, 0.9f, 0.9, 0.5, 0.0005, 10, true); Ping(b, 0, 3200, 0.35f, 0.15); Ping(b, 0.01, 1800, 0.25f, 0.12); s["snip"] = Wav(b);
        b = Buf(0.35); Ping(b, 0, 4200, 0.3f, 0.12); Ping(b, 0.07, 3700, 0.22f, 0.1); Ping(b, 0.13, 4600, 0.15f, 0.1); s["clipDrop"] = Wav(b);
        b = Buf(0.18); Hiss(b, 0, 0.15, 0.6f, 0.12, 0.04, 0.002, 7); Tone(b, 0, 0.1, 80, 50, 0.3f, 0.002, 8); s["step"] = Wav(b);
        b = Buf(0.08); Hiss(b, 0, 0.05, 0.4f, 0.8, 0.6, 0.0005, 12, true); Tone(b, 0, 0.04, 1400, 1200, 0.15f, 0.0005, 10); s["key"] = Wav(b);
        b = Buf(0.06); Tone(b, 0, 0.05, 1800, 1600, 0.25f, 0.001, 10); s["ui"] = Wav(b);
        b = Buf(0.7); Hiss(b, 0, 0.6, 0.35f, 0.1, 0.25, 0.05, 2); Tone(b, 0.55, 0.12, 120, 80, 0.4f, 0.002, 8); s["drawer"] = Wav(b);
        b = Buf(0.9); Tone(b, 0, 0.8, 300, 520, 0.08f, 0.1, 1, "saw"); Hiss(b, 0, 0.8, 0.06f, 0.2, 0.2, 0.1, 1); Ping(b, 0.75, 600, 0.3f, 0.15); s["lampTurn"] = Wav(b);

        // ---------- the night's events (the sound ids the Night signals) ----------
        b = Buf(1.1); Hiss(b, 0, 0.45, 0.4f, 0.7, 0.2, 0.01, 1.5, true); Hiss(b, 0.5, 0.4, 0.35f, 0.6, 0.15, 0.01, 1.5, true); Tone(b, 0.95, 0.1, 140, 90, 0.4f, 0.002, 8); s["tape"] = Wav(b);
        b = Buf(1.2); for (var i = 0; i < 6; i++) Tone(b, i * 0.12, 0.5, 520 * Math.Pow(1.26, i), 520 * Math.Pow(1.26, i), 0.12f, 0.01, 4, "tri"); Ping(b, 0.75, 880, 0.3f, 0.4); s["install"] = Wav(b);
        b = Buf(0.9); for (var i = 0; i < 5; i++) Tone(b, i * 0.07, 0.05, 1200 + i * 150, 1200 + i * 150, 0.15f, 0.002, 5, "square"); Hiss(b, 0.35, 0.5, 0.2f, 0.05, 0.4, 0.2, 2); s["startInstall"] = Wav(b);
        b = Buf(2.2); Tone(b, 0, 1.2, 392, 392, 0.25f, 0.02, 3, "tri"); Tone(b, 0.45, 1.6, 587, 587, 0.22f, 0.02, 3, "tri"); Tone(b, 0.45, 1.6, 294, 294, 0.12f, 0.05, 3); s["motif"] = Wav(b);
        b = Buf(0.8); Ping(b, 0, 1320, 0.25f, 0.7); s["notice"] = Wav(b);
        b = Buf(0.4); Tone(b, 0, 0.08, 1760, 1760, 0.15f, 0.002, 3, "square"); Tone(b, 0.12, 0.08, 2200, 2200, 0.15f, 0.002, 3, "square"); s["file"] = Wav(b);
        b = Buf(1.0); for (var i = 0; i < 7; i++) Ping(b, i * 0.06, 2000 + i * 260, 0.15f, 0.5); s["glint"] = Wav(b);
        b = Buf(0.8); Hiss(b, 0, 0.6, 0.35f, 0.05, 0.6, 0.05, 2, true); Tone(b, 0, 0.6, 300, 900, 0.15f, 0.05, 2, "tri"); s["catch"] = Wav(b);
        b = Buf(0.9); Tone(b, 0, 0.08, 90, 50, 0.6f, 0.001, 6); Hiss(b, 0, 0.12, 0.6f, 0.4, 0.1, 0.001, 6); Tone(b, 0.08, 0.6, 70, 60, 0.25f, 0.01, 3, "saw"); Hiss(b, 0.08, 0.6, 0.15f, 0.3, 0.3, 0.01, 3, true); s["jam"] = Wav(b);
        b = Buf(0.5); Ping(b, 0, 700, 0.4f, 0.3); Hiss(b, 0, 0.2, 0.3f, 0.5, 0.2, 0.001, 6, true); s["free"] = Wav(b);
        b = Buf(2.4); for (var r = 0; r < 2; r++) for (var i = 0; i < 18; i++) { Tone(b, r * 1.1 + i * 0.045, 0.04, 1100, 1100, 0.18f, 0.001, 2, "square"); Tone(b, r * 1.1 + i * 0.045, 0.04, 1350, 1350, 0.12f, 0.001, 2, "square"); } s["phone"] = Wav(b);
        b = Buf(2.6); Tone(b, 0, 0.5, 330, 330, 0.25f, 0.02, 1, "saw"); Tone(b, 0, 0.5, 415, 415, 0.2f, 0.02, 1, "saw"); Hiss(b, 0.5, 2, 0.25f, 0.05, 0.02, 0.4, 1.5); Tone(b, 0.5, 2, 60, 45, 0.25f, 0.4, 1.5, "saw"); s["van"] = Wav(b);
        b = Buf(0.12); Tone(b, 0, 0.03, 2400, 2000, 0.3f, 0.001, 10); Hiss(b, 0, 0.03, 0.3f, 0.6, 0.6, 0.0005, 10, true); s["switch"] = Wav(b);
        b = Buf(0.8); Tone(b, 0, 0.7, 900, 300, 0.12f, 0.01, 3, "tri"); s["cleanEnd"] = Wav(b);
        b = Buf(1.4); Tone(b, 0, 1.3, 60, 120, 0.25f, 0.3, 1.5, "saw"); Hiss(b, 0, 1.3, 0.12f, 0.05, 0.2, 0.3, 1.5); s["fullSpeed"] = Wav(b);
        b = Buf(3.0); foreach (var (f, d) in new[] { (262.0, 0.0), (330.0, 0.15), (392.0, 0.3), (523.0, 0.45) }) Tone(b, d, 2.4, f, f, 0.15f, 0.02, 2.5, "tri"); s["orderComplete"] = Wav(b);
        b = Buf(2.2); foreach (var (f, d) in new[] { (220.0, 0.0), (277.0, 0.1), (330.0, 0.2) }) Tone(b, d, 1.8, f, f, 0.16f, 0.05, 2.5, "tri"); s["charter"] = Wav(b);
        b = Buf(0.6); Ping(b, 0, 990, 0.2f, 0.5); Ping(b, 0.12, 1320, 0.15f, 0.4); s["choice"] = Wav(b);

        // ---------- loops ----------
        // rain on the glass and the street: soft broadband noise with a few drops
        b = Buf(4.25);
        Hiss(b, 0, 4.25, 0.35f, 0.25, 0.25, 0.001, 0);
        for (var i = 0; i < 160; i++) Ping(b, rng.NextDouble() * 4.0, 1800 + rng.NextDouble() * 3000, 0.03f + (float)rng.NextDouble() * 0.04f, 0.05);
        s["rainLoop"] = Wav(Seamless(b), true);
        // the room: the building's low hum and moving air
        b = Buf(4.25);
        Tone(b, 0, 4.25, 50, 50, 0.12f, 0.001, 0);
        Tone(b, 0, 4.25, 100, 100, 0.06f, 0.001, 0);
        Hiss(b, 0, 4.25, 0.12f, 0.03, 0.03, 0.001, 0);
        s["roomLoop"] = Wav(Seamless(b), true);
        // the clip machine: a whirr with a clunk on every stroke
        b = Buf(1.25);
        Tone(b, 0, 1.25, 180, 180, 0.06f, 0.001, 0, "saw");
        Hiss(b, 0, 1.25, 0.08f, 0.15, 0.15, 0.001, 0);
        for (var i = 0; i < 4; i++) { Tone(b, i * 0.25, 0.06, 120, 70, 0.35f, 0.001, 7); Ping(b, i * 0.25 + 0.02, 650, 0.12f, 0.08); }
        s["machineLoop"] = Wav(Seamless(b, 0.05), true);
        // the terminal's faint high whine
        b = Buf(2.25);
        Tone(b, 0, 2.25, 7800, 7800, 0.02f, 0.001, 0);
        Hiss(b, 0, 2.25, 0.015f, 0.6, 0.6, 0.001, 0, true);
        s["crtLoop"] = Wav(Seamless(b), true);
        return s;
    }
}
