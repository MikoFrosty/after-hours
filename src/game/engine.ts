import { CLOCK } from '../content/campaign';
import { checkInvariant } from './ledger';
import { enqueueChoice, log, once, resolveChoice } from './state';
import type { Action, CampaignState, ChapterId, PendingChoice } from './types';
import { CHAPTERS } from './types';
import { c01 } from './chapters/c01';
import { c02 } from './chapters/c02';
import { c03 } from './chapters/c03';
import { c04 } from './chapters/c04';
import { c05 } from './chapters/c05';
import { c06, deliverMessages } from './chapters/c06';
import { c07 } from './chapters/c07';
import { c08 } from './chapters/c08';

export const STEP_MS = CLOCK.stepMs;

export interface Controller {
  id: ChapterId;
  /** Initialize chapter state and disclose this chapter's grants. */
  enter(s: CampaignState): void;
  /** Rates and material transactions for one fixed step. */
  step(s: CampaignState, dtMs: number): void;
  /** Milestone evaluation (idempotent via consumedEventIds). */
  events(s: CampaignState): void;
  /** Apply a player action; return an error string when rejected. */
  act(s: CampaignState, a: Action): string | null;
  /** Resolve a chapter choice. */
  choose(s: CampaignState, c: PendingChoice, option: string): void;
  guard(s: CampaignState): boolean;
  /** Story seconds per simulated millisecond (presentation scale only). */
  storyScale: number;
}

export const CONTROLLERS: Record<ChapterId, Controller> = {
  '01': c01,
  '02': c02,
  '03': c03,
  '04': c04,
  '05': c05,
  '06': c06,
  '07': c07,
  '08': c08,
};

// ---------- signals: out-of-domain notifications for persistence, audio and UI ----------

export type Signal =
  | { type: 'save'; reason: string }
  | { type: 'checkpoint'; label: string; kind: 'chapter' | 'decision' | 'precommit' }
  | { type: 'beat'; title: string; text: string }
  | { type: 'sound'; id: string }
  | { type: 'transition'; chapter: ChapterId }
  | { type: 'error'; message: string };

type Listener = (sig: Signal) => void;
const listeners = new Set<Listener>();
export function onSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(sig: Signal): void {
  for (const l of listeners) l(sig);
}

/** Mark that something noteworthy happened; used by Advance-to-next-event. */
export function bump(s: CampaignState): void {
  s.flags.eventSerial = Number(s.flags.eventSerial ?? 0) + 1;
}

export function beatNow(s: CampaignState, chapter: ChapterId, index: number, title: string, text: string): void {
  const id = `beat.${chapter}.${index}`;
  if (!once(s, id)) return;
  log(s, { id, kind: 'beat', title, text });
  emit({ type: 'beat', title, text });
  emit({ type: 'sound', id: 'motif' });
  bump(s);
}

export function ask(s: CampaignState, choice: PendingChoice): void {
  if (s.choices.some((c) => c.id === choice.id)) return;
  enqueueChoice(s, choice);
  if (choice.checkpoint) {
    // Snapshot after enqueueing so restoring the checkpoint reopens this decision.
    const label = String(choice.data?.checkpointLabel ?? `Before: ${choice.kind}`);
    emit({ type: 'checkpoint', label, kind: choice.kind === 'c08/commit' ? 'precommit' : 'decision' });
  }
  emit({ type: 'sound', id: 'choice' });
  emit({ type: 'save', reason: 'choice' });
  bump(s);
}

// ---------- the fixed step ----------

/**
 * One 100 ms step in the documented order:
 * (1) deliver due messages, (2) queued actions are applied by dispatch, (3–5) chapter rates, support
 * and transactions, (6) milestones, (7) pause on a queued decision, (8) guards and transition.
 */
export function step(s: CampaignState): void {
  if (s.mode !== 'playing' && s.mode !== 'terminal') return;
  s.simMs += STEP_MS;
  const ctrl = CONTROLLERS[s.chapter];
  s.storySeconds += ctrl.storyScale * STEP_MS;
  deliverMessages(s);
  ctrl.step(s, STEP_MS);
  ctrl.events(s);
  if (s.choices.length > 0 && s.mode === 'playing') s.mode = 'choice';
  evaluateGuard(s);
}

export function evaluateGuard(s: CampaignState): void {
  const ctrl = CONTROLLERS[s.chapter];
  if (s.mode === 'holding' || s.mode === 'ended') return;
  if (!ctrl.guard(s)) return;
  const i = CHAPTERS.indexOf(s.chapter);
  if (i === CHAPTERS.length - 1) {
    s.mode = 'ended';
    s.ending = { kind: 'totality', chapter: '08' };
    emit({ type: 'save', reason: 'ended' });
    return;
  }
  transition(s, CHAPTERS[i + 1]);
}

export function transition(s: CampaignState, next: ChapterId): void {
  s.summaries[s.chapter] = {
    chapter: s.chapter,
    activePlayMs: s.activePlayMs - s.chapterEnteredPlayMs,
    simMs: s.simMs - s.chapterEnteredSimMs,
    notes: [],
  };
  s.chapter = next;
  s.chapterEnteredSimMs = s.simMs;
  s.chapterEnteredPlayMs = s.activePlayMs;
  s.mode = 'playing';
  CONTROLLERS[next].enter(s);
  s.revision += 1;
  bump(s);
  const err = checkInvariant(s);
  if (err) emit({ type: 'error', message: err });
  emit({ type: 'transition', chapter: next });
  emit({ type: 'checkpoint', label: `Chapter ${next} entry`, kind: 'chapter' });
  emit({ type: 'save', reason: 'transition' });
}

/** Apply a player action outside of render. Returns an error string for rejected actions. */
export function dispatch(s: CampaignState, a: Action): string | null {
  if (s.mode === 'ended') return 'The campaign has ended.';
  const ctrl = CONTROLLERS[s.chapter];
  let err: string | null = null;
  if (a.type === 'choose') {
    const c = s.choices.find((x) => x.id === a.choiceId);
    if (!c) return 'No such decision';
    resolveChoice(s, c.id);
    ctrl.choose(s, c, a.option);
    s.revision += 1;
    emit({ type: 'save', reason: 'decision' });
  } else {
    if (s.mode === 'holding') return 'Holding.';
    if (s.mode === 'choice' && a.type !== 'request') return 'A decision is pending.';
    err = ctrl.act(s, a);
  }
  if (!err) {
    ctrl.events(s);
    if (s.choices.length > 0 && s.mode === 'playing') s.mode = 'choice';
    evaluateGuard(s);
  }
  const inv = checkInvariant(s);
  if (inv) emit({ type: 'error', message: inv });
  return err;
}

/** Enter the holding epilogue for the current condition. */
export function hold(s: CampaignState, kind: 'office' | 'building' | 'city' | 'protected', variant?: string): void {
  s.mode = 'holding';
  s.ending = { kind, chapter: s.chapter, variant };
  s.choices = [];
  emit({ type: 'save', reason: 'holding' });
}

/** Developer/test helper: run n steps. */
export function run(s: CampaignState, steps: number): void {
  for (let i = 0; i < steps; i++) step(s);
}

export { CHAPTERS };
