// The best night so far, kept in this browser. A per-player convenience: if storage is unavailable
// (a private window, blocked site data) the report simply shows no previous best.

export interface NightResult {
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  /** Cartons of the big order that left before 7:00 (van and courier). */
  early: number;
  seconds: number;
}

interface Stored {
  best: NightResult | null;
  /** The night last recorded, and what the best was before it, so re-rendering the report is idempotent. */
  lastKey: string | null;
  bestBeforeLast: NightResult | null;
}

const KEY = 'after-hours.bestNight';

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return { best: null, lastKey: null, bestBeforeLast: null };
}

function save(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Not saved; the game works without it.
  }
}

/** More cartons out early is better; with the same count, the faster night wins. */
export function better(a: NightResult, b: NightResult | null): boolean {
  if (!b) return true;
  if (a.early !== b.early) return a.early > b.early;
  return a.seconds < b.seconds;
}

/**
 * Record a finished night (once per night key) and return the best from before it, so the report
 * can say "a new best" or show the one to beat.
 */
export function recordNight(key: string, result: NightResult): NightResult | null {
  const v = load();
  if (v.lastKey === key) return v.bestBeforeLast;
  const before = v.best;
  save({ best: better(result, before) ? result : before, lastKey: key, bestBeforeLast: before });
  return before;
}

export const fmtNightTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
