import { COSMIC, WORLD, beat } from '../../content/campaign';
import { SETTING_NOTE } from '../../content/narrative';
import { accrue } from '../fixed';
import { accountsWhere, makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { Account, C07State, CampaignState, CellState } from '../types';

const cs = (s: CampaignState) => s.chapterState as C07State;

export const CELL_NAMES = [
  'Near filament',
  'Void margin',
  'Old disc remnants',
  'Intracluster medium',
  'Stellar remnant field',
  'Far filament',
  'Collapsed reservoirs',
  'Exotic substrate',
];

export const surveyed = (c: CellState) => c.coverageMilli >= COSMIC.coverageTarget;
export const recovered = (c: CellState) => c.recoveredUnits >= COSMIC.recoveryTarget;

export function slotsUsed(c: C07State): number {
  return c.cells.reduce((n, x) => n + x.surveySlots + x.recoverySlots, 0);
}

export function canRecover(s: CampaignState, cell: CellState): boolean {
  return surveyed(cell) && (!cell.exotic || s.projects.coupling === 'complete') && !recovered(cell);
}

export type AuditGroup = 'original' | 'archive' | 'living' | 'raw' | 'capital' | 'inTransit' | 'unreached';

export interface AuditLine {
  account: Account;
  group: AuditGroup;
}

/** The terminal audit: a real query across every ledger account holding non-clip matter. */
export function audit(s: CampaignState): AuditLine[] {
  return accountsWhere(s, (a) => a.mass > 0n && a.cat !== 'clips' && a.cat !== 'radiatedEquivalent').map((a) => ({
    account: a,
    group:
      a.cat === 'capital' && a.protected
        ? 'original'
        : a.cat === 'livingProtected'
        ? 'living'
        : a.cat === 'archiveProtected'
          ? a.kind === 'original'
            ? 'original'
            : 'archive'
          : (a.cat as AuditGroup),
  }));
}

export function protectedLines(s: CampaignState): AuditLine[] {
  return audit(s).filter((l) => l.group === 'original' || l.group === 'archive' || l.group === 'living');
}

export function allDecided(s: CampaignState): boolean {
  const c = cs(s);
  return c.auditRun && protectedLines(s).every((l) => c.releaseDecisions[l.account.id] && c.releaseDecisions[l.account.id] !== 'pending');
}

export function anyKept(s: CampaignState): boolean {
  const c = cs(s);
  return Object.values(c.releaseDecisions).some((d) => d === 'keep');
}

const OFFICE_ANCHORS = new Set(['office', 'cabinet', 'lamp', 'frame', 'photograph']);

/** Execute the authorized sweep: assemble the terminal machine, then convert everything else to clips. */
function authorize(s: CampaignState): void {
  openAccount(s, 'terminal.machine', 'capital', 'terminal', 'Terminal machine', 'office');
  const target = WORLD.terminalMachine;
  let have = mass(s, 'terminal.machine');
  const take = (a: Account) => {
    if (have >= target || a.mass === 0n) return;
    const amount = minBig(a.mass, target - have);
    if (a.protected) a.released = true;
    mustCommit(s, { id: `terminal.assemble.${a.id}`, from: a.id, input: amount, outputs: [['terminal.machine', amount]], release: true, irreversible: true });
    have += amount;
  };
  // Retained physical office anchors (or their records) become part of the last desk.
  const officeAccounts = accountsWhere(s, (a) => Boolean(a.anchor && OFFICE_ANCHORS.has(a.anchor)) && a.mass > 0n);
  officeAccounts.forEach(take);
  // Then existing capital; the shortfall comes from eligible raw before that source is cleared.
  accountsWhere(s, (a) => a.cat === 'capital' && a.id !== 'terminal.machine' && a.mass > 0n)
    .sort((x, y) => (x.id < y.id ? -1 : 1))
    .forEach(take);
  accountsWhere(s, (a) => a.cat === 'raw' && a.mass > 0n)
    .sort((x, y) => (x.id < y.id ? -1 : 1))
    .forEach(take);
  // Sweep every other non-clip account.
  for (const a of accountsWhere(s, (x) => x.mass > 0n && x.id !== 'terminal.machine' && x.cat !== 'clips' && x.cat !== 'radiatedEquivalent')) {
    if (a.protected) a.released = true;
    makeClips(s, `terminal.sweep.${a.id}`, a.id, a.mass, { periodic: false, release: true, irreversible: true });
    a.protected = false;
  }
  for (const an of Object.values(s.anchors)) {
    if (an.fidelity === 'absent' && !an.living) continue;
    if (OFFICE_ANCHORS.has(an.id)) {
      an.currentLocation = 'terminal machine';
      an.released = true;
      continue;
    }
    if (an.living && an.alive) {
      an.alive = false;
      an.evidence.push('released for liquidation, Act 7');
    }
    an.released = true;
    an.protected = false;
    an.fidelity = 'absent';
    an.currentLocation = 'clip stock';
  }
  s.charters.totality = true;
}

export const c07: Controller = {
  id: '07',
  storyScale: (10_000_000_000 * 31_557_600) / 1000,

  enter(s) {
    // Previously certified non-protected raw sources stay in their existing accounts.
    // Split the remaining unreached allocation into eight exact cells; the last takes the remainder.
    const U = mass(s, 'unreached');
    const per = U / BigInt(COSMIC.cells);
    const outputs: Array<[string, bigint]> = [];
    const cells: CellState[] = [];
    for (let i = 0; i < COSMIC.cells; i++) {
      const id = `cell.${i}`;
      const m = i === COSMIC.cells - 1 ? U - per * BigInt(COSMIC.cells - 1) : per;
      openAccount(s, id, 'unreached', 'cell', `Cell ${i + 1} · ${CELL_NAMES[i]}`, 'cosmic');
      outputs.push([id, m]);
      cells.push({
        index: i,
        account: id,
        startMass: m,
        coverageMilli: 0,
        covResidue: 0,
        surveySlots: 1,
        recoverySlots: 0,
        recoveredUnits: 0,
        recResidue: 0,
        recoveryMilli: 0,
        exotic: COSMIC.exotic.includes(i),
      });
    }
    mustCommit(s, { id: 'c07.cells', from: 'unreached', input: U, outputs });
    s.chapterState = {
      kind: '07',
      cells,
      surveyWorkMilli: 0,
      recoveryWorkMilli: 0,
      auditRun: false,
      releaseDecisions: {},
      livingReview: null,
    };
    log(s, { id: 'c07.setting', kind: 'system', title: 'Setting note', text: SETTING_NOTE });
  },

  step(s, dt) {
    const c = cs(s);
    for (const cell of c.cells) {
      if (!surveyed(cell) && cell.surveySlots > 0) {
        const [g, r] = accrue(cell.surveySlots * COSMIC.surveyRate, dt, cell.covResidue);
        cell.covResidue = r;
        const add = Math.min(g, COSMIC.coverageTarget - cell.coverageMilli);
        cell.coverageMilli += add;
        c.surveyWorkMilli += add;
        if (surveyed(cell)) {
          // Survey slots move to recovery where it is permitted; otherwise they become free.
          if (canRecover(s, cell)) cell.recoverySlots += cell.surveySlots;
          cell.surveySlots = 0;
          emit({ type: 'sound', id: 'notice' });
          bump(s);
        }
      }
      if (canRecover(s, cell) && cell.recoverySlots > 0) {
        const [g, r] = accrue(cell.recoverySlots * COSMIC.recoveryRate, dt, cell.recResidue);
        cell.recResidue = r;
        cell.recoveryMilli += g;
        c.recoveryWorkMilli += g;
        const units = Math.min(COSMIC.recoveryTarget, Math.floor(cell.recoveryMilli / 1000));
        while (cell.recoveredUnits < units) {
          cell.recoveredUnits += 1;
          // Each unit removes a precise share; the final unit takes the residue.
          const share = cell.startMass / BigInt(COSMIC.recoveryTarget);
          const input = cell.recoveredUnits === COSMIC.recoveryTarget ? mass(s, cell.account) : minBig(share, mass(s, cell.account));
          makeClips(s, `c07.recover.${cell.index}`, cell.account, input);
        }
        if (recovered(cell)) {
          cell.recoverySlots = 0;
          emit({ type: 'sound', id: 'resolve' });
          bump(s);
        }
      }
    }
  },

  events(s) {
    const c = cs(s);
    const n = c.cells.filter(surveyed).length;
    if (n >= COSMIC.topologyAfter && s.projects.topology === 'locked') {
      s.projects.topology = 'available';
      bump(s);
    }
    if (n >= COSMIC.couplingAfter && s.projects.coupling === 'locked') {
      s.projects.coupling = 'available';
      bump(s);
    }
    if (c.cells.every(recovered) && s.projects.terminalAudit === 'locked') {
      s.projects.terminalAudit = 'available';
      log(s, { id: 'c07.audit.ready', kind: 'system', title: 'Ordinary recovery complete', text: 'Terminal audit available: enumerate every remaining protected and operational item.' });
      bump(s);
    }
    if (c.auditRun && protectedLines(s).some((l) => l.group === 'living')) {
      const [t, x] = beat('07', 1);
      beatNow(s, '07', 1, t, x);
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c07/slots': {
        const cell = c.cells[a.cell];
        if (!cell) return 'No such cell.';
        const key = a.role === 'survey' ? 'surveySlots' : 'recoverySlots';
        const next = cell[key] + a.delta;
        if (next < 0) return null;
        if (a.delta > 0 && slotsUsed(c) + a.delta > COSMIC.slots) return 'All eight slots are assigned.';
        if (a.role === 'survey' && surveyed(cell) && a.delta > 0) return 'Already surveyed.';
        if (a.role === 'recovery' && a.delta > 0 && !canRecover(s, cell)) {
          return cell.exotic && surveyed(cell) ? 'Requires matter coupling.' : 'Survey to 100 first.';
        }
        cell[key] = next;
        emit({ type: 'sound', id: 'tick' });
        return null;
      }
      case 'c07/project': {
        if (a.id === 'terminalAudit') {
          if (s.projects.terminalAudit !== 'available') return 'Not available.';
          s.projects.terminalAudit = 'complete';
          c.auditRun = true;
          for (const l of protectedLines(s)) c.releaseDecisions[l.account.id] = 'pending';
          emit({ type: 'sound', id: 'audit' });
          emit({ type: 'save', reason: 'audit' });
          bump(s);
          return null;
        }
        if (s.projects[a.id] !== 'available') return 'Not available.';
        const pool = a.id === 'topology' ? 'surveyWorkMilli' : 'recoveryWorkMilli';
        if (c[pool] < COSMIC.projectWork) return `Requires 60 ${a.id === 'topology' ? 'survey' : 'recovery'} work.`;
        c[pool] -= COSMIC.projectWork;
        s.projects[a.id] = 'complete';
        if (a.id === 'topology') {
          const [t, x] = beat('07', 0);
          beatNow(s, '07', 0, t, x);
          log(s, { id: 'c07.topology', kind: 'system', title: 'Topology closure', text: 'Fictional premise: the cosmos is finite and connected, and every region can be reached and acknowledged before the terminal phase.' });
        } else {
          log(s, { id: 'c07.coupling', kind: 'system', title: 'Matter coupling', text: 'Fictional premise: collapsed and exotic reservoirs can be recovered as manufacturable substrate. Its recipes consume free energy and create radiation.' });
        }
        emit({ type: 'sound', id: 'install' });
        bump(s);
        return null;
      }
      case 'c07/decide': {
        const line = protectedLines(s).find((l) => l.account.id === a.account);
        if (!line || !c.auditRun) return 'Not in the audit.';
        if (a.decision === 'keep') {
          c.releaseDecisions[a.account] = 'keep';
          emit({ type: 'sound', id: 'tick' });
          return null;
        }
        if (line.group === 'living') {
          ask(s, { id: `c07.living.${a.account}.${s.seq++}`, kind: 'c07/living', subject: a.account, checkpoint: true, data: { checkpointLabel: `Before: living reserve ${line.account.label}` } });
        } else {
          ask(s, { id: `c07.release.${a.account}.${s.seq++}`, kind: 'c07/release', subject: a.account, checkpoint: true, data: { checkpointLabel: `Before: release ${line.account.label}` } });
        }
        return null;
      }
      case 'request': {
        if (a.kind === 'authorize') {
          if (!allDecided(s)) return 'Resolve every protected item first.';
          if (s.messages.length > 0) return 'Messages are still in flight.';
          ask(s, { id: `c07.totality.${s.seq++}`, kind: 'c07/totality', checkpoint: true, data: { checkpointLabel: 'Before: authorize totality', kept: anyKept(s) } });
          return null;
        }
        return 'Unknown request';
      }
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind === 'c07/release') {
      c.releaseDecisions[choice.subject!] = option === 'release' ? 'release' : 'keep';
      if (option === 'release') emit({ type: 'sound', id: 'stamp' });
      return;
    }
    if (choice.kind === 'c07/living') {
      if (option === 'review') {
        c.livingReview = choice.subject!;
        ask(s, { id: `c07.liquidate.${choice.subject}.${s.seq++}`, kind: 'c07/liquidate', subject: choice.subject, checkpoint: false });
      } else {
        c.releaseDecisions[choice.subject!] = 'keep';
      }
      return;
    }
    if (choice.kind === 'c07/liquidate') {
      c.releaseDecisions[choice.subject!] = option === 'release' ? 'release' : 'keep';
      c.livingReview = null;
      if (option === 'release') emit({ type: 'sound', id: 'stamp' });
      return;
    }
    if (choice.kind === 'c07/totality') {
      if (option === 'authorize' && !anyKept(s) && allDecided(s)) {
        authorize(s);
        const [t, x] = beat('07', 2);
        beatNow(s, '07', 2, t, x);
        s.flags['reflection.enough'] = true;
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'hold') {
        hold(s, 'protected');
      }
    }
  },

  guard(s) {
    const c = cs(s);
    return (
      c.cells.every(surveyed) &&
      c.cells.every(recovered) &&
      s.projects.topology === 'complete' &&
      s.projects.coupling === 'complete' &&
      s.messages.length === 0 &&
      s.charters.totality
    );
  },
};
