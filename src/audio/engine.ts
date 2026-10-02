// Procedural audio: one original two-note motif that is mechanical and intimate in the office,
// becomes warm synth progressions in the city, drifts apart across distant offices, and ends
// with one note and a relay. Everything is synthesized; no audio files are required.
// Music is optional and never required to understand a state.
import { goodRate } from '../game/chapters/c01';
import type { CampaignState, ChapterId, C01State, C02State, C03State, C04State, C05State, C08State } from '../game/types';

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

type Layer = { gain: GainNode; stop: () => void; filter?: BiquadFilterNode };

// Motif: A4 → D5 (resolves upward to the tonic). The last desk plays only the A.
const MOTIF = [440, 587.33];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  settings: AudioSettings = { music: 0.55, sfx: 0.7, muted: false };
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private layers = new Map<string, Layer>();
  private chapter: ChapterId | null = null;
  private timer: number | null = null;
  private nextBeat = 0;
  private beatIndex = 0;
  private tempo = 0.5;
  private state: CampaignState | null = null;
  private finalPhrasePlayed = false;
  private silenced = false;
  // Rain: a muffled bed heard through the window, plus individually scheduled drops and drips.
  private rainBufs: AudioBuffer[] = [];
  private dropBus!: GainNode;
  private rainGust: GainNode | null = null;
  private rainTone: BiquadFilterNode | null = null;
  private rainLevel = 0;
  private nextDrop = 0;
  private nextDrip = 0;
  private nextGust = 0;
  private nextClack = 0;
  private nextThunk = 0;
  private jigStep = 0;
  private nextBird = 0;

  /** Create the audio context on the first user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.buildGraph(ctx);
    if (this.chapter) this.buildChapter(this.chapter);
    this.startScheduler();
  }

  /** Master, buses, reverb and the shared noise and rain sources. */
  private buildGraph(ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.music;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfx;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.musicBus);
    this.noiseBuf = this.makeNoise(4);
    // Two long pink-noise loops of different lengths: their sum never repeats audibly.
    this.rainBufs = [this.makePink(19.3), this.makePink(23.7)];
    // Drops on the glass: a gentle lowpass so they sound outside, with a little room reverb.
    const glass = ctx.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 3800;
    glass.Q.value = 0.4;
    this.dropBus = ctx.createGain();
    this.dropBus.gain.value = 1;
    this.dropBus.connect(glass);
    glass.connect(this.musicBus);
    const dropVerb = ctx.createGain();
    dropVerb.gain.value = 0.35;
    glass.connect(dropVerb).connect(this.reverbSend);
  }

  /**
   * Developer aid: render the office rain (bed, gusts, drops and drips) offline with the
   * same code paths, returning stereo samples. Used to measure and audition the ambience.
   */
  async renderRainPreview(seconds: number, level = 1): Promise<Float32Array[]> {
    const saved = { ...this } as Record<string, unknown>;
    const off = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
    this.ctx = off as unknown as AudioContext;
    this.buildGraph(off);
    this.musicBus.gain.value = this.settings.music;
    const layer = this.rainLayer(level === 1 ? 0.11 : 0.035);
    this.rainLevel = level;
    this.nextDrop = this.nextDrip = this.nextGust = 0;
    this.scheduleRain(off as unknown as AudioContext, seconds);
    const out = await off.startRendering();
    layer.stop = () => undefined;
    Object.assign(this, saved);
    return [out.getChannelData(0), out.getChannelData(1)];
  }

  applySettings(s: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
  }

  setChapter(ch: ChapterId | null, s: CampaignState | null) {
    this.state = s;
    if (ch === this.chapter) return;
    this.chapter = ch;
    this.finalPhrasePlayed = false;
    this.silenced = false;
    this.rainLevel = ch === '01' ? 1 : ch === '02' ? 0.3 : 0;
    if (!this.ctx) return;
    this.fadeAllLayers(2.5);
    if (ch) this.buildChapter(ch);
  }

  /** Called every animation tick with the current state to steer dynamic layers. */
  update(s: CampaignState) {
    this.state = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (s.chapter === '01') {
      const lamp = s.anchors.lamp.fidelity === 'original';
      this.layerLevel('hum', lamp ? 0.035 : 0.018, t);
      // The rain eases toward morning, following the story clock.
      const minute = s.storySeconds / 60;
      const rain = minute < 245 ? 1 : Math.max(0.15, 1 - (minute - 245) / 110);
      this.rainLevel = rain;
      this.layerLevel('rain', 0.11 * rain, t);
      // Past two in the morning a low pad comes in under the rain, opening up toward dawn.
      const c = s.chapterState as C01State;
      const night = c.capped ? 1 : Math.max(0, Math.min(1, (minute - 135) / 90));
      const dawn = Math.max(0, Math.min(1, (minute - 300) / 80));
      this.layerLevel('night', 0.028 * night * (s.mode === 'playing' || c.capped ? 1 : 0.5), t);
      const pad = this.layers.get('night');
      if (pad?.filter) pad.filter.frequency.setTargetAtTime(420 + 1500 * dawn, t, 2);
      // The machines: separate clicks at a slow rate blend into a soft running texture as the line speeds up.
      const rate = c.capped || c.jammed ? 0 : goodRate(s) / 1000;
      const blend = Math.max(0, Math.min(1, (rate - 2.5) / 6));
      this.layerLevel('machine', s.mode === 'playing' ? 0.05 * blend : 0, t);
      const m = this.layers.get('machine');
      if (m?.filter) m.filter.frequency.setTargetAtTime(900 + 900 * blend, t, 1);
    }
    if (s.chapter === '02') {
      const c = s.chapterState as C02State;
      this.layerLevel('vent', 0.05 + (c.heatMilli / 100_000) * 0.12, t);
    }
    if (s.chapter === '03') {
      const c = s.chapterState as C03State;
      const avg = c.scoresMilli.reduce((a, b) => a + b, 0) / 300_000;
      this.layerLevel('crowd', 0.015 + avg * 0.05, t);
    }
    if (s.chapter === '05') {
      const c = s.chapterState as C05State;
      this.layerLevel('drone', 0.05 + c.alloc.collector * 0.012, t);
    }
    if (s.chapter === '08') {
      const c = s.chapterState as C08State;
      if (c.committed && c.tasksDone.includes('main_compute') && !this.silenced) {
        this.silenced = true;
        this.fadeAllLayers(1.2);
      }
    }
  }

  // ---------- one-shot cues ----------
  cue(id: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    switch (id) {
      case 'relay':
        return this.relay(t, 1);
      case 'bend':
        // A hand-formed clip: a soft snap of wire, varied so rapid clicking never sounds mechanical.
        this.click(t, 2400 + Math.random() * 1600, 0.12, 0.012);
        return this.click(t + 0.03, 900 + Math.random() * 300, 0.06, 0.03);
      case 'tend':
        // A light hand on the feed: a soft tap, pitched a little differently each time.
        return this.click(t, 1100 + Math.random() * 500, 0.06, 0.02);
      case 'glint':
        // Light running along the wire: a quick rising shimmer.
        for (let i = 0; i < 5; i++) this.bell(t + i * 0.05, 1760 * Math.pow(1.122, i), 0.018, 0.9, true, -0.2 + i * 0.1);
        return;
      case 'catch':
        this.bell(t, 880, 0.05, 1.4, true);
        this.bell(t + 0.06, 1318.5, 0.04, 1.6, true);
        return this.bell(t + 0.12, 1760, 0.03, 1.8, true);
      case 'cleanEnd':
        return this.bell(t, 1318.5, 0.02, 0.8, true);
      case 'tuneHit':
        this.click(t, 3000, 0.15, 0.015);
        return this.bell(t + 0.02, 1174.7, 0.05, 1.2, true);
      case 'tuneMiss':
        return this.tone(t, 196, 0.05, 0.25, 'triangle');
      case 'handLevel':
        this.bell(t, 659.3, 0.04, 1.2, true);
        return this.bell(t + 0.12, 987.8, 0.035, 1.4, true);
      case 'jam':
        this.noiseHit(t, 1600, 0.12, 0.08, 'bandpass');
        return this.sweep(t, 520, 180, 0.05, 0.5);
      case 'free':
        this.click(t, 1800, 0.18, 0.02);
        return this.tone(t + 0.05, 740, 0.03, 0.18, 'triangle');
      case 'tape':
        // Packing tape pulled across a carton, then the carton set down on the stack.
        this.sweep(t, 1800, 3600, 0.035, 0.45, true);
        this.thump(t + 0.55, 82, 0.13);
        return this.noiseHit(t + 0.55, 380, 0.07, 0.12, 'lowpass');
      case 'boxFull':
        // The packer's carton is full: two soft knocks on cardboard.
        this.noiseHit(t, 420, 0.06, 0.08, 'lowpass');
        return this.noiseHit(t + 0.14, 380, 0.05, 0.08, 'lowpass');
      case 'wear':
        // The die has worn a little: a dull scrape and a flattened note.
        this.noiseHit(t, 1200, 0.04, 0.25, 'bandpass');
        return this.tone(t + 0.05, 233, 0.03, 0.3, 'triangle');
      case 'unload':
        // A coil set down on the dock by hand.
        this.thump(t, 75 + Math.random() * 20, 0.09);
        return this.metal(t + 0.01, 0.05);
      case 'ready':
        // Something in the workshop can be afforded now: a soft, short ping.
        return this.bell(t, 1567.98, 0.028, 0.9, false, 0.25);
      case 'fullSpeed':
        // Every station on the jig: the line swells to full speed.
        this.sweep(t, 140, 420, 0.035, 1.6);
        return this.chord(t + 0.4, [62, 66, 69, 74], 3.2, 0.03);
      case 'van':
        // A van idling across the street, then pulling away.
        return this.sweep(t, 55, 95, 0.05, 3.2, true);
      case 'file':
        this.tone(t, 1567, 0.025, 0.06, 'square');
        return this.tone(t + 0.07, 2093, 0.02, 0.08, 'square');
      case 'startInstall':
        for (let i = 0; i < 4; i++) this.click(t + i * 0.07, 2000 - i * 200, 0.08, 0.015);
        return;
      case 'orderComplete':
        this.relay(t, 1);
        return this.motif(t + 1.4, false, 0.8);
      case 'tick':
        return this.click(t, 5200, 0.05, 0.012);
      case 'install':
        this.relay(t, 0.9);
        this.relay(t + 0.11, 0.7);
        return this.tone(t + 0.2, 660, 0.18, 0.06, 'triangle');
      case 'salvage':
        this.noiseHit(t, 900, 0.25, 0.22, 'lowpass');
        return this.metal(t + 0.02, 0.18);
      case 'lampOff':
        return this.click(t, 1800, 0.25, 0.03);
      case 'notice':
        return this.bell(t, 1318.5, 0.09, 1.2);
      case 'choice':
        this.tone(t, 220, 0.06, 1.1, 'sine');
        return this.tone(t, 329.6, 0.04, 1.1, 'sine');
      case 'charter':
        this.noiseHit(t, 180, 0.3, 0.15, 'lowpass');
        return this.motif(t + 0.25, this.chapter === '08');
      case 'motif':
        return this.motif(t, false);
      case 'contract':
        return this.bell(t, 987.8, 0.1, 1.6);
      case 'throttle':
        this.tone(t, 392, 0.06, 0.25, 'triangle');
        return this.tone(t + 0.22, 311, 0.06, 0.4, 'triangle');
      case 'recover':
        this.tone(t, 311, 0.05, 0.2, 'triangle');
        return this.tone(t + 0.18, 392, 0.05, 0.35, 'triangle');
      case 'demolish':
      case 'dismantle':
        this.noiseHit(t, 140, 0.35, 1.6, 'lowpass');
        return this.sweep(t, 220, 55, 0.08, 1.8);
      case 'resolve':
        this.bell(t, 880, 0.06, 1.2);
        return this.bell(t + 0.14, 1174.7, 0.05, 1.4);
      case 'stamp':
        return this.noiseHit(t, 220, 0.4, 0.12, 'lowpass');
      case 'open':
        return this.noiseHit(t, 4000, 0.06, 0.18, 'highpass');
      case 'launch':
        return this.sweep(t, 90, 900, 0.05, 1.3, true);
      case 'receipt':
        this.tone(t, 1244, 0.04, 0.08, 'sine');
        return this.tone(t + 0.12, 1244, 0.04, 0.08, 'sine');
      case 'send':
        return this.tone(t, 988, 0.035, 0.1, 'sine');
      case 'audit':
        for (let i = 0; i < 9; i++) this.click(t + i * 0.06, 3000 + i * 150, 0.05, 0.01);
        return;
      case 'charge':
        return this.sweep(t, 110, 440, 0.04, 2.4);
      case 'start':
        return this.relay(t, 0.8);
      case 'stop':
        return this.relay(t, 0.5);
      case 'switch':
        return this.click(t, 2400, 0.12, 0.02);
      case 'commit':
        // The original relay sounds once.
        return this.relay(t, 1.2);
      case 'retire.relays':
      case 'retire.archive':
      case 'retire.sensors':
        return this.sweep(t, 180, 90, 0.05, 1.2);
      case 'retire.main_compute':
        this.fadeAllLayers(0.6);
        return this.sweep(t, 140, 40, 0.06, 2.2);
      case 'retire.controller':
        return this.click(t, 700, 0.08, 0.05);
      case 'finalPhrase':
        // One note. The phrase does not resolve.
        return this.bell(t, MOTIF[0], 0.09, 4.5, true);
      default:
        return;
    }
  }

  // ---------- chapter music ----------
  private buildChapter(ch: ChapterId) {
    const add = (id: string, l: Layer | null) => l && this.layers.set(id, l);
    switch (ch) {
      case '01':
        add('rain', this.rainLayer(0.11));
        add('hum', this.humLayer(120, 0.035));
        add('night', this.nightPadLayer());
        add('machine', this.machineLayer());
        this.tempo = 2.2;
        break;
      case '02':
        // Rain recedes behind freight and ventilation.
        add('rain', this.rainLayer(0.035));
        add('vent', this.noiseLayer(0.06, 'lowpass', 320, 1, 0.3));
        add('hum', this.humLayer(100, 0.02));
        this.tempo = 0.42;
        break;
      case '03':
        add('pad', this.padLayer([62, 66, 69, 73], 0.05));
        add('crowd', this.noiseLayer(0.03, 'bandpass', 900, 0.8, 0.9));
        this.tempo = 0.25;
        break;
      case '04':
        add('pad', this.padLayer([59, 62, 66, 69], 0.045));
        add('crowd', this.noiseLayer(0.02, 'bandpass', 900, 0.8, 0.9));
        this.tempo = 0.3;
        break;
      case '05':
        add('drone', this.humLayer(41.2, 0.08, true));
        add('pad', this.padLayer([50, 57, 64], 0.03));
        this.tempo = 1.6;
        break;
      case '06':
        add('pad', this.padLayer([45, 52, 59, 64], 0.022));
        add('hiss', this.noiseLayer(0.012, 'highpass', 5000, 0.5, 0.2));
        this.tempo = 1.1;
        break;
      case '07':
        add('hiss', this.noiseLayer(0.025, 'highpass', 3500, 0.5, 0.35));
        add('drone', this.humLayer(36.7, 0.03));
        this.tempo = 2.8;
        break;
      case '08':
        add('hiss', this.noiseLayer(0.008, 'highpass', 4500, 0.5, 0.2));
        this.tempo = 5;
        break;
    }
    this.beatIndex = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.5;
  }

  private startScheduler() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.chapter || ctx.state !== 'running') return;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      this.playBeat(this.chapter, this.nextBeat, this.beatIndex);
      this.nextBeat += this.tempo;
      this.beatIndex += 1;
    }
    this.scheduleRain(ctx);
    this.scheduleOffice(ctx);
  }

  /** The bench machines at their real rate, and birds once the rain thins at dawn. */
  private scheduleOffice(ctx: AudioContext) {
    const s = this.state;
    if (!s || s.chapter !== '01' || this.settings.muted || s.mode !== 'playing') return;
    const c = s.chapterState as C01State;
    const now = ctx.currentTime;
    const horizon = now + 0.3;
    const rate = c.capped || c.jammed ? 0 : goodRate(s) / 1000;
    if (rate > 0) {
      if (this.nextClack < now) this.nextClack = now + 0.05;
      // One clack per clip at a slow rate, each a little different. As the line speeds up the
      // clacks thin and soften while the running texture (the 'machine' layer) takes over.
      const blend = Math.max(0, Math.min(1, (rate - 2.5) / 6));
      const interval = 1 / Math.min(rate, 5);
      const g = 0.03 * (1 - 0.6 * blend);
      while (this.nextClack < horizon) {
        const accent = Math.random() < 0.15;
        this.click(this.nextClack, 1300 + Math.random() * 900, accent ? g * 1.5 : g, 0.015 + Math.random() * 0.01);
        if (blend < 0.7) this.thump(this.nextClack, 100 + Math.random() * 30, 0.012 * (1 - blend));
        this.nextClack += interval * (0.8 + Math.random() * 0.4);
      }
      if (c.owned.includes('jig')) {
        // The jig's stations strike in an uneven rhythm: one long, two short, never quite even.
        if (this.nextThunk < now) this.nextThunk = now + 0.1;
        const stations = c.owned.filter((id) => id.startsWith('station')).length;
        while (this.nextThunk < horizon && stations > 0) {
          this.thump(this.nextThunk, 64 + Math.random() * 14, 0.022 + stations * 0.003);
          this.click(this.nextThunk + 0.02, 520 + Math.random() * 200, 0.018, 0.05);
          this.jigStep = (this.jigStep + 1) % 3;
          this.nextThunk += (this.jigStep === 0 ? 0.78 : 0.36) * (0.9 + Math.random() * 0.25) * (1.2 - stations * 0.05);
        }
      }
    }
    const minute = s.storySeconds / 60;
    if (minute > 350) {
      if (this.nextBird < now) this.nextBird = now + 2 + Math.random() * 4;
      while (this.nextBird < horizon) {
        this.bird(this.nextBird);
        this.nextBird += 3 + Math.random() * 7;
      }
    }
  }

  /** A small bird somewhere outside: two or three quick rising chirps, faint. */
  private bird(t: number) {
    const ctx = this.ctx!;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, at + 0.05);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, at);
      e.gain.linearRampToValueAtTime(0.006, at + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      const p = ctx.createStereoPanner();
      p.pan.value = -0.6;
      o.connect(e).connect(p).connect(this.dropBus);
      o.start(at);
      o.stop(at + 0.1);
    }
  }

  /** Random (Poisson) drop timing, slow random gusts, and occasional drips from the gutter. */
  private scheduleRain(ctx: AudioContext, ahead = 0.3) {
    const level = this.rainLevel;
    if (level <= 0 || this.settings.muted) return;
    const now = ctx.currentTime;
    const horizon = now + ahead;
    if (this.nextDrop < now) this.nextDrop = now + 0.05;
    if (this.nextDrip < now) this.nextDrip = now + 2 + Math.random() * 4;
    if (this.nextGust < now) this.nextGust = now;
    while (this.nextDrop < horizon) {
      this.drop(this.nextDrop, level);
      // Mean rate ~7 drops/s at full rain; exponential gaps sound natural rather than rhythmic.
      this.nextDrop += -Math.log(1 - Math.random()) / (7 * level);
    }
    while (this.nextDrip < horizon) {
      this.drip(this.nextDrip, level);
      if (Math.random() < 0.3) this.drip(this.nextDrip + 0.18 + Math.random() * 0.25, level * 0.7);
      this.nextDrip += (2.5 + Math.random() * 6) / Math.max(0.3, level);
    }
    while (this.nextGust < horizon && this.rainGust && this.rainTone) {
      // The rain swells and eases a little, at irregular intervals.
      const g = 0.7 + Math.random() * 0.55;
      const tau = 1.5 + Math.random() * 2.5;
      this.rainGust.gain.setTargetAtTime(g, this.nextGust, tau);
      this.rainTone.frequency.setTargetAtTime(1300 + g * 700, this.nextGust, tau);
      this.nextGust += 4 + Math.random() * 7;
    }
  }

  /** A tiny tick of water on the window glass. Most are faint; a few are closer. */
  private drop(t: number, level: number) {
    const ctx = this.ctx!;
    const near = Math.random() < 0.12;
    const f = 2200 + Math.random() * 3800;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.03);
    const e = ctx.createGain();
    const peak = (near ? 0.012 + Math.random() * 0.01 : 0.002 + Math.random() * 0.005) * level;
    const dur = 0.012 + Math.random() * 0.025;
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(peak, t + 0.002);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    // The window is on the left wall: drops lean left but spread across the field.
    p.pan.value = -0.35 + (Math.random() - 0.5) * 1.1;
    o.connect(e).connect(p).connect(this.dropBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Water dripping from the gutter onto the sill: a soft, rounded plink. */
  private drip(t: number, level: number) {
    const ctx = this.ctx!;
    const f = 650 + Math.random() * 500;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.04);
    const e = ctx.createGain();
    const peak = (0.008 + Math.random() * 0.008) * level;
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(peak, t + 0.004);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const p = ctx.createStereoPanner();
    p.pan.value = -0.55 + Math.random() * 0.2;
    o.connect(e).connect(p).connect(this.dropBus);
    o.start(t);
    o.stop(t + 0.18);
  }

  private playBeat(ch: ChapterId, t: number, i: number) {
    const s = this.state;
    if (s?.mode === 'holding' || s?.mode === 'ended') return;
    switch (ch) {
      case '01':
        // Silence is comfortable. The motif marks only the night's turning points (see 'motif' cues).
        break;
      case '02': {
        // The relay becomes a soft mechanical rhythm.
        const c = s?.chapterState.kind === '02' ? (s.chapterState as C02State) : null;
        // The rhythm is the line itself: it only plays while work is actually moving.
        const running = c ? c.running && !c.awaitingInspection && c.shipRate > 0 : true;
        if (!running) break;
        const accent = i % 4 === 0;
        this.click(t, accent ? 1400 : 2600, accent ? 0.06 : 0.03, 0.015);
        if (i % 8 === 0) this.thump(t, 70, 0.08);
        if (i % 64 === 32) this.motif(t, false, 0.5);
        break;
      }
      case '03':
      case '04': {
        // Warm chords and arpeggios. In Act 4 channels disappear after each replacement.
        const prog = ch === '03' ? [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]] : [[59, 62, 66, 69], [55, 59, 62, 66], [52, 55, 59, 62], [54, 57, 61, 64]];
        const bar = Math.floor(i / 16) % prog.length;
        const chord = prog[bar];
        let channels = 4;
        if (ch === '04' && s?.chapterState.kind === '04') {
          const c = s.chapterState as C04State;
          const lost = Object.values(c.cases).filter((k) => k.resolved && (k.treatment === 'archive' || k.treatment === 'reconstruction' || k.treatment === 'absent')).length;
          channels = Math.max(0, 4 - lost);
        }
        if (i % 16 === 0) this.chord(t, chord, this.tempo * 16, ch === '03' ? 0.05 : 0.04);
        if (channels >= 1 && i % 16 === 0) this.bass(t, midi(chord[0] - 24), this.tempo * 8);
        if (channels >= 2) {
          const n = chord[[0, 1, 2, 3, 2, 1][i % 6]] + 12;
          this.pluck(t, midi(n), 0.035);
        }
        if (channels >= 3 && i % 4 === 2) this.click(t, 7000, 0.02, 0.01);
        if (channels >= 4 && i % 2 === 0) this.thump(t, 55, i % 8 === 0 ? 0.08 : 0.035);
        if (i % 64 === 48) this.motif(t, false, 0.6);
        break;
      }
      case '05': {
        // Spacious; long gaps between familiar notes.
        if (i % 6 === 0) this.bell(t, MOTIF[i % 12 === 0 ? 0 : 1] / 2, 0.035, 5);
        if (i % 17 === 5) this.bell(t, 1760, 0.012, 6);
        break;
      }
      case '06': {
        // Fragments of the motif answer from different channels, out of phase.
        if (i % 4 === 0) {
          const pan = [-0.8, 0.8, -0.3, 0.5, 0, -0.6][Math.floor(i / 4) % 6];
          const detune = [1, 1.003, 0.997, 1.006, 0.994, 1][Math.floor(i / 4) % 6];
          const note = MOTIF[Math.floor(i / 4) % 2] * detune;
          this.bell(t + (i % 3) * 0.13, note, 0.035, 3.5, false, pan);
        }
        break;
      }
      case '07': {
        if (i % 3 === 1) this.metal(t, 0.02);
        break;
      }
      case '08': {
        const c = s?.chapterState.kind === '08' ? (s.chapterState as C08State) : null;
        if (c?.finalLineShown && !this.finalPhrasePlayed && !c.tasksDone.includes('main_compute')) {
          this.finalPhrasePlayed = true;
          this.cue('finalPhrase');
        }
        break;
      }
    }
  }

  // ---------- synthesis primitives ----------
  private out(pan = 0, wet = 0): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.musicBus);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.reverbSend);
    }
    return p;
  }

  private tone(t: number, f: number, g: number, dur: number, type: OscillatorType, pan = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(e).connect(p).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private bell(t: number, f: number, g: number, dur: number, dry = false, pan = 0) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 2.001;
    mg.gain.setValueAtTime(f * 1.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(e).connect(this.out(pan, dry ? 0.25 : 0.8));
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
  }

  private motif(t: number, unresolved: boolean, level = 1) {
    this.bell(t, MOTIF[0], 0.07 * level, 2.4);
    if (!unresolved) this.bell(t + 0.42, MOTIF[1], 0.06 * level, 3);
  }

  private click(t: number, f: number, g: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 4;
    const e = ctx.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(e).connect(this.sfxBus);
    src.start(t, Math.random() * 3);
    src.stop(t + dur + 0.02);
  }

  private relay(t: number, level: number) {
    this.click(t, 3200, 0.35 * level, 0.012);
    this.click(t + 0.018, 1200, 0.2 * level, 0.03);
    this.thump(t, 140, 0.06 * level);
  }

  private thump(t: number, f: number, g: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const e = ctx.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(e).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, f: number, g: number, dur: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const e = ctx.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(e).connect(this.sfxBus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  private metal(t: number, g: number) {
    const ctx = this.ctx!;
    for (const f of [523, 1187, 1731]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const e = ctx.createGain();
      e.gain.setValueAtTime(g * 0.3, t);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 800;
      o.connect(hp).connect(e).connect(this.out((Math.random() - 0.5) * 0.8, 0.6));
      o.start(t);
      o.stop(t + 0.65);
    }
  }

  private sweep(t: number, f0: number, f1: number, g: number, dur: number, noise = false) {
    const ctx = this.ctx!;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + dur * 0.3);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      src.connect(bp).connect(e).connect(this.sfxBus);
      src.start(t);
      src.stop(t + dur + 0.05);
      return;
    }
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(e).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private chord(t: number, notes: number[], dur: number, g: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(800, t + dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + dur * 0.25);
    e.gain.linearRampToValueAtTime(g * 0.7, t + dur * 0.8);
    e.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    lp.connect(e).connect(this.out(0, 0.6));
    for (const n of notes) {
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = 0.18;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
  }

  private bass(t: number, f: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.09, t + 0.05);
    e.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(e).connect(this.out(0, 0));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(t: number, f: number, g: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    const e = ctx.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(lp).connect(e).connect(this.out(Math.sin(t) * 0.4, 0.7));
    o.start(t);
    o.stop(t + 0.5);
  }

  /** Steady rain heard through a closed window: soft pink noise, muffled, with slow gusts. */
  private rainLayer(g: number): Layer {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    hp.Q.value = 0.5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1700;
    tone.Q.value = 0.3;
    // A second gentle lowpass makes the roll-off smooth, like sound through glass.
    const tone2 = ctx.createBiquadFilter();
    tone2.type = 'lowpass';
    tone2.frequency.value = 3200;
    tone2.Q.value = 0.2;
    const gust = ctx.createGain();
    gust.gain.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(g, ctx.currentTime, 2.5);
    hp.connect(tone).connect(tone2).connect(gust).connect(gain).connect(this.musicBus);
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    gain.connect(wet).connect(this.reverbSend);
    const sources = this.rainBufs.map((buf, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const sg = ctx.createGain();
      sg.gain.value = i === 0 ? 0.6 : 0.5;
      src.connect(sg).connect(hp);
      src.start(ctx.currentTime, Math.random() * buf.duration);
      return src;
    });
    this.rainGust = gust;
    this.rainTone = tone;
    this.nextGust = 0;
    return {
      gain,
      stop: () => {
        sources.forEach((x) => x.stop());
        if (this.rainGust === gust) {
          this.rainGust = null;
          this.rainTone = null;
        }
      },
    };
  }

  /** Stereo pink noise (Paul Kellet's filter), each channel independent so the bed is wide. */
  private makePink(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const fade = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      // Generate a little past the end, then crossfade that overrun into the start:
      // the last sample flows into the first exactly as it was generated, so the loop has no seam.
      const g = new Float32Array(len + fade);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < g.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        g[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      const d = buf.getChannelData(ch);
      d.set(g.subarray(0, len));
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = g[len + i] * Math.cos((k * Math.PI) / 2) + g[i] * Math.sin((k * Math.PI) / 2);
      }
    }
    return buf;
  }

  private noiseLayer(g: number, type: BiquadFilterType, f: number, q: number, lfo: number): Layer {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(g, ctx.currentTime, 1.5);
    const mod = ctx.createOscillator();
    mod.frequency.value = lfo;
    const modG = ctx.createGain();
    modG.gain.value = g * 0.35;
    mod.connect(modG).connect(gain.gain);
    src.connect(flt).connect(gain).connect(this.musicBus);
    src.start();
    mod.start();
    return {
      gain,
      stop: () => {
        src.stop();
        mod.stop();
      },
    };
  }

  /** A low, soft chord for the small hours: triangle voices behind a lowpass that opens at dawn. */
  private nightPadLayer(): Layer {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    const oscs: OscillatorNode[] = [];
    for (const [n, d] of [
      [50, -4],
      [57, 3],
      [62, -2],
      [64, 5],
      [69, -6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n - 12);
      o.detune.value = d;
      const og = ctx.createGain();
      og.gain.value = 0.16;
      // Each voice breathes at its own slow rate.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + Math.random() * 0.05;
      const lg = ctx.createGain();
      lg.gain.value = 0.07;
      lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(lp);
      o.start();
      lfo.start();
      oscs.push(o, lfo);
    }
    lp.connect(gain);
    gain.connect(this.musicBus);
    const w = ctx.createGain();
    w.gain.value = 0.6;
    gain.connect(w).connect(this.reverbSend);
    return { gain, filter: lp, stop: () => oscs.forEach((o) => o.stop()) };
  }

  /** The line at speed: a soft, filtered rattle whose level and brightness follow the rate. */
  private machineLayer(): Layer {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    // A fast flutter so it reads as many small strikes rather than hiss.
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 11;
    const fg = ctx.createGain();
    fg.gain.value = 0.4;
    flutter.connect(fg).connect(am.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(am).connect(gain).connect(this.musicBus);
    src.start();
    flutter.start();
    return {
      gain,
      filter: bp,
      stop: () => {
        src.stop();
        flutter.stop();
      },
    };
  }

  private humLayer(f: number, g: number, wobble = false): Layer {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(g, ctx.currentTime, 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = wobble ? 200 : 600;
    const oscs = [f, f * 2, f * 3].map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = fr;
      const og = ctx.createGain();
      og.gain.value = [1, 0.3, 0.12][i];
      o.connect(og).connect(lp);
      o.start();
      return o;
    });
    let lfo: OscillatorNode | null = null;
    if (wobble) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 3;
      lfo.connect(lg);
      for (const o of oscs) lg.connect(o.frequency);
      lfo.start();
    }
    lp.connect(gain).connect(this.musicBus);
    return {
      gain,
      stop: () => {
        oscs.forEach((o) => o.stop());
        lfo?.stop();
      },
    };
  }

  private padLayer(notes: number[], g: number): Layer {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(g, ctx.currentTime, 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const oscs: OscillatorNode[] = [];
    for (const n of notes) {
      for (const d of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n - 12);
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = 0.12;
        o.connect(og).connect(lp);
        o.start();
        oscs.push(o);
      }
    }
    lp.connect(gain);
    gain.connect(this.musicBus);
    const w = ctx.createGain();
    w.gain.value = 0.5;
    gain.connect(w).connect(this.reverbSend);
    return { gain, stop: () => oscs.forEach((o) => o.stop()) };
  }

  private layerLevel(id: string, g: number, t: number) {
    const l = this.layers.get(id);
    if (l) l.gain.gain.setTargetAtTime(g, t, 0.8);
  }

  private fadeAllLayers(sec: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [id, l] of this.layers) {
      l.gain.gain.cancelScheduledValues(ctx.currentTime);
      l.gain.gain.setTargetAtTime(0, ctx.currentTime, sec / 3);
      window.setTimeout(() => {
        try {
          l.stop();
        } catch {
          /* already stopped */
        }
      }, sec * 1000 + 200);
      this.layers.delete(id);
    }
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}

export const audio = new AudioEngine();
