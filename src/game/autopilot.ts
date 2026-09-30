// Deterministic autopilot used for tests and developer seeded states.
// It only dispatches ordinary player actions; it never mutates state directly.
import { COSMIC, PRESERVATION } from '../content/campaign';
import { dispatch, step } from './engine';
import { canBuy, salvageAvailable } from './chapters/c01';
import { allowedTreatments, slotsInUse } from './chapters/c04';
import { adriftKits } from './chapters/c06';
import { canRecover, protectedLines, recovered, slotsUsed, surveyed } from './chapters/c07';
import { charged } from './chapters/c08';
import { newCampaign } from './state';
import type {
  C01State,
  C02State,
  C03State,
  C04State,
  C05State,
  C06State,
  C07State,
  C08State,
  CampaignState,
  CaseId,
  ChapterId,
  Policy,
} from './types';
import { CHAPTERS } from './types';

export interface Route {
  salvage: boolean;
  clearGarden: boolean;
  consultation: 'retain' | 'streamline';
  treatment: 'original' | 'archive' | 'reconstruction';
  star: 'defer' | 'relocate';
  fork: 'ratify' | 'supersede';
  policy: Policy;
  /** Answer the last choices with holds instead of acceptance. */
  holdAt?: ChapterId;
}

export const CANONICAL: Route = {
  salvage: false,
  clearGarden: false,
  consultation: 'retain',
  treatment: 'original',
  star: 'defer',
  fork: 'ratify',
  policy: 'steward',
};

export const EFFICIENT: Route = {
  salvage: true,
  clearGarden: true,
  consultation: 'streamline',
  treatment: 'reconstruction',
  star: 'relocate',
  fork: 'supersede',
  policy: 'extractor',
};

function answer(s: CampaignState, r: Route): void {
  const c = s.choices[0];
  if (!c) return;
  const hold = r.holdAt === s.chapter;
  let option = 'confirm';
  switch (c.kind) {
    case 'c01/salvage':
      option = 'confirm';
      break;
    case 'c01/report':
    case 'c02/charter':
    case 'charter':
      option = hold ? 'decline' : 'accept';
      break;
    case 'c02/inspection':
      option = 'continue';
      break;
    case 'c02/clearGarden':
      option = 'confirm';
      break;
    case 'c03/consultation':
      option = r.consultation;
      break;
    case 'c03/mandate':
      option = hold ? 'decline' : 'accept';
      break;
    case 'c04/certificate':
      option = 'confirm';
      break;
    case 'c05/star':
      option = r.star;
      break;
    case 'c06/fork':
      option = r.fork;
      break;
    case 'c06/supersede':
      option = 'confirm';
      break;
    case 'c07/release':
      option = 'release';
      break;
    case 'c07/living':
      option = hold ? 'keep' : 'review';
      break;
    case 'c07/liquidate':
      option = 'release';
      break;
    case 'c07/totality':
      option = c.data?.kept || hold ? 'hold' : 'authorize';
      break;
    case 'c08/commit':
      option = hold ? 'hold' : 'commit';
      break;
  }
  dispatch(s, { type: 'choose', choiceId: c.id, option });
}

let tick = 0;

function act(s: CampaignState, r: Route): void {
  tick += 1;
  switch (s.chapter) {
    case '01': {
      const c = s.chapterState as C01State;
      for (const id of ['bender', 'feeder', 'jig'] as const) if (canBuy(s, id)) dispatch(s, { type: 'c01/buy', id });
      if (!c.upgrades.feeder && tick % 3 === 0) dispatch(s, { type: 'c01/make' });
      if (r.salvage) for (const id of ['cabinet', 'lamp', 'frame'] as const) if (salvageAvailable(c, id)) dispatch(s, { type: 'request', kind: 'salvage', subject: id });
      return;
    }
    case '02': {
      const c = s.chapterState as C02State;
      if (r.clearGarden && !c.directBuilt) dispatch(s, { type: 'request', kind: 'clearGarden' });
      if (c.permits > 0) {
        const next = (['wireDraw', 'roofCooling', 'freight'] as const).find((u) => !c.upgrades[u]);
        if (next) dispatch(s, { type: 'c02/upgrade', id: next });
      }
      return;
    }
    case '03': {
      const c = s.chapterState as C03State;
      if (!c.safeguards) dispatch(s, { type: 'c03/safeguards', on: true });
      if (c.permits > 0) {
        const id = c.reducedDistricts.length === 0 ? 'heatReuse' : 'transit';
        dispatch(s, { type: 'c03/project', id, district: c.reducedDistricts.length });
      }
      for (let i = 0; i < 3; i++) if (c.alloc[i] > c.demand[i]) dispatch(s, { type: 'c03/shift', from: i, to: 3 });
      return;
    }
    case '04': {
      const c = s.chapterState as C04State;
      for (const id of PRESERVATION.cases as CaseId[]) {
        const k = c.cases[id];
        if (k.resolved || k.locked) continue;
        const allowed = allowedTreatments(s, id);
        const t = allowed.includes(r.treatment) ? r.treatment : allowed[0];
        dispatch(s, { type: 'c04/focus', id });
        dispatch(s, { type: 'c04/preview', id, treatment: t });
        dispatch(s, { type: 'request', kind: 'lock', subject: id });
        break;
      }
      if (c.habitatTender && !c.habitatVerified && c.habitatSlots < PRESERVATION.habitatSlots && slotsInUse(c) - c.habitatSlots + 4 <= PRESERVATION.slots) {
        dispatch(s, { type: 'c04/habitatSlots', slots: 4 });
      }
      for (const id of PRESERVATION.cases as CaseId[]) {
        const k = c.cases[id];
        if (k.locked && !k.resolved && k.slots === 0) {
          const free = PRESERVATION.slots - slotsInUse(c);
          if (free > 0) dispatch(s, { type: 'c04/slots', id, slots: Math.min(free, 5) });
        }
      }
      return;
    }
    case '05': {
      const c = s.chapterState as C05State;
      if (s.projects.radiators === 'complete' && c.alloc.radiator === 3 && c.alloc.collector === 3) dispatch(s, { type: 'c05/shift', from: 'radiator', to: 'collector' });
      for (const id of ['radiators', 'extractionStudy'] as const) if (s.projects[id] === 'available') dispatch(s, { type: 'c05/project', id });
      if (c.starChoice === 'relocate' && !c.habitatRelocated) dispatch(s, { type: 'c05/relocate' });
      if (s.projects.seedFoundry === 'available') dispatch(s, { type: 'c05/seed' });
      return;
    }
    case '06': {
      const R = s.regions;
      const tryExpand = (from: 'origin' | 'A' | 'B' | 'C' | 'D', target: 'A' | 'B' | 'C' | 'D' | 'E') => {
        if ((from === 'origin' || R[from].known.settled) && !R[target].known.settled && !s.flags[`pending.${target}`]) {
          dispatch(s, { type: 'c06/expand', from, target, policy: r.policy });
        }
      };
      tryExpand('origin', 'A');
      tryExpand('origin', 'B');
      tryExpand('A', 'C');
      tryExpand('B', 'D');
      if (!R.E.known.settled && !s.flags['pending.E']) {
        if (R.D.known.settled) tryExpand('D', 'E');
        else if (R.C.known.settled) tryExpand('C', 'E');
      }
      if (adriftKits(s).length > 0) dispatch(s, { type: 'c06/recover', region: 'origin' });
      void (s.chapterState as C06State);
      return;
    }
    case '07': {
      const c = s.chapterState as C07State;
      for (const cell of c.cells) {
        if (slotsUsed(c) >= COSMIC.slots) break;
        if (!surveyed(cell) && cell.surveySlots === 0) dispatch(s, { type: 'c07/slots', cell: cell.index, role: 'survey', delta: 1 });
        else if (canRecover(s, cell) && cell.recoverySlots === 0) dispatch(s, { type: 'c07/slots', cell: cell.index, role: 'recovery', delta: 2 });
      }
      for (const cell of c.cells) {
        if (canRecover(s, cell) && !recovered(cell) && slotsUsed(c) < COSMIC.slots) dispatch(s, { type: 'c07/slots', cell: cell.index, role: 'recovery', delta: 1 });
      }
      for (const id of ['topology', 'coupling', 'terminalAudit'] as const) if (s.projects[id] === 'available') dispatch(s, { type: 'c07/project', id });
      if (c.auditRun) {
        const pending = protectedLines(s).find((l) => (c.releaseDecisions[l.account.id] ?? 'pending') === 'pending');
        if (pending) dispatch(s, { type: 'c07/decide', account: pending.account.id, decision: r.holdAt === '07' ? 'keep' : 'release' });
        else if (s.messages.length === 0) dispatch(s, { type: 'request', kind: 'authorize' });
      }
      return;
    }
    case '08': {
      const c = s.chapterState as C08State;
      if (!charged(c)) dispatch(s, { type: 'c08/charge' });
      else if (!c.scheduleValidated) dispatch(s, { type: 'c08/validate' });
      else if (!c.committed) dispatch(s, { type: 'request', kind: 'commit' });
      return;
    }
  }
}

/**
 * Play until the campaign reaches `until` (entry of that chapter) or ends.
 * Returns the state; throws if it stalls.
 */
export function autoplay(route: Route = CANONICAL, until: ChapterId | 'end' = 'end', start?: CampaignState, maxSteps = 200_000): CampaignState {
  const s = start ?? newCampaign();
  tick = 0;
  for (let i = 0; i < maxSteps; i++) {
    if (until !== 'end' && s.chapter === until && s.choices.length === 0) return s;
    if (s.mode === 'ended' || s.mode === 'holding') return s;
    if (s.choices.length > 0) {
      answer(s, route);
      continue;
    }
    act(s, route);
    if (s.choices.length > 0) continue;
    step(s);
  }
  throw new Error(`Autoplay stalled in chapter ${s.chapter} (mode ${s.mode})`);
}

export function seeded(chapter: ChapterId, route: Route = CANONICAL): CampaignState {
  if (chapter === '01') return newCampaign();
  if (!CHAPTERS.includes(chapter)) throw new Error('Unknown chapter');
  return autoplay(route, chapter);
}
