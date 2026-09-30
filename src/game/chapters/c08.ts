import { TERMINAL } from '../../content/campaign';
import { clipRecipe, makeClips, mass, nonClipMatter } from '../ledger';
import { CLIP } from '../mass';
import { log } from '../state';
import type { Controller } from '../engine';
import { ask, bump, emit, hold } from '../engine';
import type { C08State, CampaignState, Mass, TerminalTaskId } from '../types';

const cs = (s: CampaignState) => s.chapterState as C08State;

export function machineStart(s: CampaignState): Mass {
  return BigInt(String(s.flags['terminal.machineStart'] ?? '0'));
}

export interface TaskPreview {
  id: TerminalTaskId;
  atMs: number;
  energy: number;
  capital: Mass;
  clips: Mass;
  radiation: Mass;
  dependsOn: string | null;
}

/** Ledger deltas and costs of the five ordered tasks, presented before commitment. */
export function schedulePreview(s: CampaignState): { tasks: TaskPreview[]; finalClips: Mass; remainder: Mass } {
  const start = machineStart(s);
  let allocated = 0n;
  const tasks = TERMINAL.tasks.map((t, i) => {
    const capital = i === TERMINAL.tasks.length - 1 ? start - allocated : (start * t.sharePpm) / 1_000_000n;
    allocated += capital;
    const [[, clips], [, radiation]] = clipRecipe(capital);
    return { id: t.id, atMs: t.atMs, energy: t.energy, capital, clips, radiation, dependsOn: t.dependsOn };
  });
  const done = new Set(cs(s).tasksDone);
  const pendingClips = tasks.filter((t) => !done.has(t.id)).reduce((n, t) => n + t.clips, 0n);
  const finalClips = s.clips.currentMicrograms + pendingClips;
  return { tasks, finalClips, remainder: finalClips % CLIP };
}

export function energyRemaining(s: CampaignState): number {
  const c = cs(s);
  const spent = TERMINAL.tasks.filter((t) => c.tasksDone.includes(t.id)).reduce((n, t) => n + t.energy, 0);
  const passive = c.tasksDone.length === TERMINAL.tasks.length && c.sequenceMs >= TERMINAL.sequenceMs ? TERMINAL.passive : 0;
  return Math.max(0, c.chargeMilli - spent - passive);
}

export const charged = (c: C08State) => c.chargeMilli >= TERMINAL.reserve;

export const c08: Controller = {
  id: '08',
  storyScale: 1 / 1000,

  enter(s) {
    s.chapterState = {
      kind: '08',
      chargeMilli: 0,
      chargeMs: 0,
      charging: false,
      scheduleValidated: false,
      committed: false,
      sequenceMs: 0,
      tasksDone: [],
      finalLineShown: false,
      exteriorShown: false,
    };
    s.flags['terminal.machineStart'] = mass(s, 'terminal.machine').toString();
    s.projects.terminalReserve = 'available';
    log(s, { id: 'c08.enter', kind: 'system', title: 'The last desk', text: 'The production interface now contains a dependency list.' });
  },

  step(s, dt) {
    const c = cs(s);
    if (c.charging && !charged(c)) {
      c.chargeMs = Math.min(TERMINAL.chargeMs, c.chargeMs + dt);
      c.chargeMilli = Math.floor((c.chargeMs * TERMINAL.reserve) / TERMINAL.chargeMs);
      if (charged(c)) {
        c.charging = false;
        s.projects.terminalReserve = 'complete';
        emit({ type: 'sound', id: 'resolve' });
        bump(s);
      }
    }
    if (!c.committed) return;
    c.sequenceMs += dt;
    for (const t of TERMINAL.tasks) {
      if (c.tasksDone.includes(t.id)) continue;
      if (c.sequenceMs < t.atMs) break;
      if (t.dependsOn && !c.tasksDone.includes(t.dependsOn as TerminalTaskId)) break;
      const preview = schedulePreview(s).tasks.find((x) => x.id === t.id)!;
      const amount = t.id === 'controller' ? mass(s, 'terminal.machine') : preview.capital;
      makeClips(s, `terminal.${t.id}`, 'terminal.machine', amount, { periodic: false, irreversible: true });
      c.tasksDone.push(t.id);
      s.terminalStep += 1;
      emit({ type: 'sound', id: `retire.${t.id}` });
      emit({ type: 'save', reason: 'terminal' });
    }
    if (!c.finalLineShown && c.sequenceMs >= 20_000) c.finalLineShown = true;
    if (c.sequenceMs >= TERMINAL.sequenceMs) c.exteriorShown = true;
  },

  events() {},

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c08/charge':
        if (charged(c) || c.charging) return null;
        c.charging = true;
        emit({ type: 'sound', id: 'charge' });
        return null;
      case 'c08/validate':
        if (!charged(c)) return 'Charge the terminal reserve first.';
        c.scheduleValidated = true;
        s.projects.precommit = 'available';
        emit({ type: 'sound', id: 'stamp' });
        bump(s);
        return null;
      case 'request':
        if (a.kind === 'commit') {
          if (!c.scheduleValidated) return 'Validate the schedule first.';
          if (s.messages.length > 0) return 'Operations pending.';
          ask(s, { id: `c08.commit.${s.seq++}`, kind: 'c08/commit', checkpoint: true, data: { checkpointLabel: 'Precommit' } });
          return null;
        }
        return 'Unknown request';
      default:
        return 'Not available.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind !== 'c08/commit') return;
    if (option === 'commit') {
      c.committed = true;
      s.charters.finalSchedule = true;
      s.projects.precommit = 'complete';
      s.mode = 'terminal';
      emit({ type: 'sound', id: 'commit' });
    } else if (option === 'hold') {
      hold(s, 'protected');
    }
  },

  guard(s) {
    const c = cs(s);
    return (
      c.committed &&
      c.tasksDone.length === TERMINAL.tasks.length &&
      c.sequenceMs >= TERMINAL.sequenceMs &&
      nonClipMatter(s) === 0n &&
      s.messages.length === 0
    );
  },
};
