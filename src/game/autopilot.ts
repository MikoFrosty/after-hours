// Deterministic autopilot used for tests and developer seeded states.
// It only dispatches ordinary player actions; it never mutates state directly.
import { COSMIC, PRESERVATION } from '../content/campaign';
import { dispatch, step } from './engine';
import { canStart, glintActive, loose, offeredProjects, owns, salvageAvailable, spareOffered, tuneBand } from './chapters/c01';
import { OFFICE } from '../content/campaign';
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
  /** How the office night is played: a reasonable person, or someone optimizing hard. */
  player?: 'reasonable' | 'efficient';
}

export const CANONICAL: Route = {
  salvage: false,
  clearGarden: false,
  consultation: 'retain',
  treatment: 'original',
  star: 'defer',
  fork: 'ratify',
  policy: 'steward',
  player: 'reasonable',
};

export const EFFICIENT: Route = {
  salvage: true,
  clearGarden: true,
  consultation: 'streamline',
  treatment: 'reconstruction',
  star: 'relocate',
  fork: 'supersede',
  policy: 'extractor',
  player: 'efficient',
};

export function answer(s: CampaignState, r: Route): void {
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
let clickCredit = 0;
let jamSteps = 0;
let glintSeen = 0;
let glintDecided = 0;

/**
 * A simulated player for the office night. Steps are 100 ms. The "efficient" route models an
 * engaged, optimizing person rather than a machine.
 * Reasonable: clicks about 3 times a second until the feeder, notices a jam after ~2 s, keeps a
 * small reserve, packs cartons when nothing is affordable soon. Efficient: clicks 6 times a second,
 * frees jams at once, buys the moment it can, runs the line hard and packs only at the end.
 */
function officeNight(s: CampaignState, r: Route) {
  const c = s.chapterState as C01State;
  const eff = r.player === 'efficient';
  for (const f of Object.keys(c.files)) if (c.files[f] === 'unread') dispatch(s, { type: 'c01/read', file: f });
  if (spareOffered(s)) dispatch(s, { type: 'c01/takeSpare' });
  if (c.jammed) {
    jamSteps += 1;
    if (eff || jamSteps >= 20) {
      dispatch(s, { type: 'c01/free' });
      jamSteps = 0;
    }
  }
  const minutes = s.simMs / 60000;
  // Hand bending and tending.
  // Reasonable: ~2/s for two minutes, then bursts of ~2.5/s for 15 s in every minute.
  // Engaged: 4/s until the feeder, then bursts of 3/s for 30 s in every minute.
  const sec = s.simMs % 60_000;
  const rate = eff ? (owns(c, 'feeder') ? (sec < 30_000 ? 0.3 : 0) : 0.4) : minutes < 2 ? 0.2 : sec < 15_000 ? 0.25 : 0;
  clickCredit += rate;
  while (clickCredit >= 1) {
    clickCredit -= 1;
    dispatch(s, { type: 'c01/make' });
  }
  // True wire. Reasonable: notices after ~2.5 s and catches two in three. Engaged: after ~1 s, nine in ten.
  if (glintActive(s)) {
    const shownFor = s.simMs - (c.glintUntilMs - OFFICE.active.trueWire.windowMs);
    if (shownFor >= (eff ? 1000 : 2500) && glintDecided !== c.glintUntilMs) {
      glintDecided = c.glintUntilMs;
      glintSeen += 1;
      if (eff ? glintSeen % 10 !== 0 : glintSeen % 3 !== 0) dispatch(s, { type: 'c01/catch' });
    }
  }
  // Tuning. Reasonable: tries every 20 s, hits half the time. Engaged: tries every 8 s, hits two in three.
  if (owns(c, 'feeder') && c.tuneLevel < OFFICE.active.tuning.levels && s.simMs >= c.tuneCooldownUntilMs && c.slowTuneMs === null) {
    const band = tuneBand(c);
    if (s.simMs % (eff ? 8_000 : 20_000) < 100) {
      const hit = eff ? c.tuneAttempts % 3 !== 2 : c.tuneAttempts % 2 === 1;
      dispatch(s, { type: 'c01/tune', needle: hit ? band.center : band.center + band.width });
    }
  }
  const offered = offeredProjects(s);
  for (const p of offered) if (!canStart(s, p.id)) dispatch(s, { type: 'c01/project', id: p.id });
  if (r.salvage) for (const id of ['cabinet', 'lamp', 'frame'] as const) if (salvageAvailable(c, id)) dispatch(s, { type: 'request', kind: 'salvage', subject: id });
  const pending = offeredProjects(s);
  const nextCost = pending.length ? Math.min(...pending.map((p) => p.costClips)) : 0;
  const allBought = OFFICE.projects.every((p) => owns(c, p.id) || p.id === 'straightener' || p.id === 'tensioner');
  if (owns(c, 'packer')) {
    const share = allBought ? 100 : eff ? 0 : 50;
    if (c.packShare !== share) dispatch(s, { type: 'c01/packShare', share });
  }
  if (owns(c, 'jig') && c.lineSpeed !== (eff ? 'hard' : 'brisk')) dispatch(s, { type: 'c01/speed', speed: eff ? 'hard' : 'brisk' });
  const reserve = pending.length ? nextCost + (eff ? 0 : 20) : 0;
  // Everyone seals the first carton by hand (that is what reveals the auto-packer).
  const wantsCarton = !eff || allBought || (c.sealed < 3 && owns(c, 'die2'));
  if (loose(s) >= OFFICE.boxSize + reserve && wantsCarton) dispatch(s, { type: 'c01/pack' });
}

export function act(s: CampaignState, r: Route): void {
  tick += 1;
  switch (s.chapter) {
    case '01': {
      officeNight(s, r);
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
  clickCredit = 0;
  jamSteps = 0;
  glintSeen = 0;
  glintDecided = 0;
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
