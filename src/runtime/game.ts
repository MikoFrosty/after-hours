// Browser runtime: monotonic fixed-step clock, persistence, checkpoints and fast-forward.
// UI state (drawers, focus, audio nodes) stays outside the domain snapshot.
import { dispatch as domainDispatch, emit, onSignal, step, STEP_MS } from '../game/engine';
import type { Signal } from '../game/engine';
import { newCampaign } from '../game/state';
import {
  addCheckpoint,
  clone,
  parse,
  readCheckpoints,
  readSave,
  SAVE_KEY,
  serialize,
  writeSave,
  type Checkpoint,
} from '../game/save';
import type { Action, CampaignState, ChapterId } from '../game/types';
import { audio } from '../audio/engine';

export type Screen = 'title' | 'game';

export interface SaveStatus {
  ok: boolean;
  message: string;
  at: number;
}

export interface BeatToast {
  id: number;
  title: string;
  text: string;
}

const AUTOSAVE_MS = 5000;
const MAX_CATCHUP_MS = 1000;

class GameRuntime {
  state: CampaignState | null = null;
  screen: Screen = 'title';
  version = 0;
  speed: 1 | 4 = 1;
  paused = false;
  saveStatus: SaveStatus = { ok: true, message: 'Not saved yet', at: 0 };
  conflict = false;
  fastForward = false;
  lastError: string | null = null;
  toast: BeatToast | null = null;
  introChapter: ChapterId | null = null;
  lastRejection: { text: string; at: number } | null = null;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private sinceSave = 0;
  private ffCancel = false;
  private toastSeq = 0;
  private dirty = false;

  constructor() {
    onSignal((sig) => this.onSignal(sig));
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.save('visibility');
        this.last = 0; // award no hidden progress
        this.acc = 0;
      });
      window.addEventListener('storage', (e) => {
        if (e.key !== SAVE_KEY || !e.newValue || !this.state) return;
        const r = parse(e.newValue);
        if (r.status === 'ok' && r.state.revision > this.state.revision) {
          this.conflict = true;
          this.notify();
        }
      });
      window.addEventListener('pagehide', () => this.save('pagehide'));
    }
  }

  // ---------- subscription for useSyncExternalStore ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  notify() {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  // ---------- lifecycle ----------
  newGame() {
    this.load(newCampaign(), true);
    this.introChapter = '01';
    this.save('new');
    addCheckpoint(this.state!, 'Chapter 01 entry', 'chapter');
  }

  continueGame(): boolean {
    const r = readSave();
    if (r.status !== 'ok') return false;
    this.load(r.state, false);
    if (r.fromPrevious) this.setSave(true, 'Restored the previous valid snapshot.');
    return true;
  }

  load(s: CampaignState, fresh: boolean) {
    this.state = s;
    this.screen = 'game';
    this.paused = false;
    this.conflict = false;
    this.fastForward = false;
    this.toast = null;
    if (!fresh) this.introChapter = null;
    audio.setChapter(s.chapter, s);
    this.startClock();
    this.notify();
  }

  restoreCheckpoint(cp: Checkpoint) {
    const r = parse(cp.data);
    if (r.status !== 'ok') {
      this.lastError = 'That checkpoint is no longer valid.';
      this.notify();
      return;
    }
    this.load(r.state, false);
    this.save('restore');
  }

  toTitle() {
    this.save('title');
    this.stopClock();
    this.screen = 'title';
    this.state = null;
    audio.setChapter(null, null);
    this.notify();
  }

  // ---------- clock ----------
  private startClock() {
    this.stopClock();
    this.last = 0;
    this.acc = 0;
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      this.tick(t);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopClock() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(t: number) {
    const s = this.state;
    if (!s) return;
    if (this.last === 0 || document.hidden) {
      this.last = t;
      return;
    }
    const dt = Math.min(MAX_CATCHUP_MS, t - this.last);
    this.last = t;
    if (this.paused || this.fastForward || this.conflict || this.introChapter) return;
    this.acc += dt;
    let stepped = false;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      if (s.mode === 'playing' || s.mode === 'terminal') {
        s.activePlayMs += STEP_MS;
        // The office night cannot be accelerated until the wire feeder is installed.
        const n = s.mode === 'terminal' || (s.chapter === '01' && !s.flags['c01.pace']) ? 1 : this.speed;
        for (let i = 0; i < n; i++) step(s);
        stepped = true;
      }
    }
    this.sinceSave += dt;
    if (this.sinceSave >= AUTOSAVE_MS) this.save('interval');
    if (stepped || this.dirty) {
      this.dirty = false;
      this.notify();
    }
    audio.update(s);
  }

  // ---------- actions ----------
  dispatch = (a: Action): string | null => {
    const s = this.state;
    if (!s) return 'No game.';
    const err = domainDispatch(s, a);
    if (err) this.lastRejection = { text: err, at: Date.now() };
    this.notify();
    return err;
  };

  pauseReason: string | null = null;

  setPaused(p: boolean, reason: string | null = null) {
    this.paused = p;
    this.pauseReason = p ? reason : null;
    this.notify();
  }

  setSpeed(v: 1 | 4) {
    this.speed = v;
    this.notify();
  }

  dismissIntro() {
    this.introChapter = null;
    this.last = 0;
    this.notify();
  }

  /** Advance in bounded fixed-step chunks until something noteworthy happens. Yields every 20 ms. */
  async advanceToNextEvent(maxSimMs = 10 * 60_000) {
    const s = this.state;
    if (!s || s.choices.length > 0 || s.mode !== 'playing' || this.fastForward) return;
    this.fastForward = true;
    this.ffCancel = false;
    this.notify();
    const serial = s.flags.eventSerial;
    const chapter = s.chapter;
    const startMs = s.simMs;
    let lastProgress = progressSignature(s);
    let stalled = 0;
    while (!this.ffCancel) {
      const until = performance.now() + 20;
      while (performance.now() < until) {
        step(s);
        if (s.flags.eventSerial !== serial || s.choices.length || s.chapter !== chapter || s.mode !== 'playing') break;
      }
      if (s.flags.eventSerial !== serial || s.choices.length || s.chapter !== chapter || s.mode !== 'playing') break;
      if (s.simMs - startMs > maxSimMs) break;
      const sig = progressSignature(s);
      stalled = sig === lastProgress ? stalled + 1 : 0;
      lastProgress = sig;
      if (stalled > 50) break; // resource bottleneck: nothing is progressing
      this.notify();
      await new Promise((r) => setTimeout(r, 0));
    }
    this.fastForward = false;
    this.save('advance');
    this.notify();
  }

  cancelAdvance() {
    this.ffCancel = true;
  }

  // ---------- persistence ----------
  save(reason: string) {
    const s = this.state;
    this.sinceSave = 0;
    if (!s || this.conflict) return;
    s.revision += 1;
    const r = writeSave(s);
    this.setSave(r.ok, r.ok ? 'Saved' : r.error ?? 'Save failed', reason);
  }

  private setSave(ok: boolean, message: string, _reason?: string) {
    this.saveStatus = { ok, message, at: Date.now() };
    this.dirty = true;
  }

  manualCheckpoint() {
    if (!this.state) return;
    const r = addCheckpoint(this.state, `Manual · chapter ${this.state.chapter}`, 'manual');
    this.setSave(r.ok, r.ok ? 'Checkpoint stored' : r.error ?? 'Checkpoint failed');
    this.notify();
  }

  checkpoints(): Checkpoint[] {
    return readCheckpoints();
  }

  exportSave(): string | null {
    return this.state ? serialize(this.state) : null;
  }

  takeOverAfterConflict() {
    // Keep the local snapshot: export first is offered by the UI.
    this.conflict = false;
    this.save('takeover');
    this.notify();
  }

  reloadFromStorage() {
    const r = readSave();
    if (r.status === 'ok') this.load(r.state, false);
    this.conflict = false;
    this.notify();
  }

  private onSignal(sig: Signal) {
    const s = this.state;
    switch (sig.type) {
      case 'save':
        // Message deliveries can cluster; coalesce them to at most one write per second.
        if (s && (sig.reason !== 'message' || this.sinceSave >= 1000)) this.save(sig.reason);
        else this.dirty = true;
        break;
      case 'checkpoint':
        if (s) addCheckpoint(clone(s), sig.label, sig.kind);
        break;
      case 'beat':
        this.toastSeq += 1;
        this.toast = { id: this.toastSeq, title: sig.title, text: sig.text };
        this.dirty = true;
        {
          const id = this.toastSeq;
          window.setTimeout(() => {
            if (this.toast?.id === id) {
              this.toast = null;
              this.notify();
            }
          }, 7200);
        }
        break;
      case 'sound':
        audio.cue(sig.id);
        break;
      case 'transition':
        this.introChapter = sig.chapter;
        if (s) audio.setChapter(sig.chapter, s);
        break;
      case 'error':
        this.lastError = sig.message;
        console.error('[after-hours]', sig.message);
        break;
    }
  }
}

function progressSignature(s: CampaignState): string {
  return `${s.clips.currentMicrograms}|${s.messages.length}|${JSON.stringify(s.chapterState).length}|${s.log.length}`;
}

export const game = new GameRuntime();
export { emit };
