// Deterministic autopilot used for tests and developer seeded states.
// It only dispatches ordinary player actions; it never mutates state directly.
import { COSMIC, PRESERVATION } from '../content/campaign';
import { dispatch, step } from './engine';
import { bestUpgrade, burstReady, canStart, loose, offeredProjects, owns, paysInTime, sheetReady, spareOffered } from './chapters/c01';
import { clearable, OFFICE_ITEMS } from './officeSalvage';
import { cooling, heatGain, heatOpen, lineRate, price, roomRate, routeOpen, shopOpen, slowestRoom } from './chapters/c02';
import type { RoomId } from '../content/campaign';
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
    case 'office/salvage':
      option = 'confirm';
      break;
    case 'c01/report':
    case 'c02/charter':
    case 'charter':
      option = hold ? 'decline' : 'accept';
      break;
    case 'c02/office':
      option = r.salvage ? 'choose' : 'keep';
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
 * engaged, optimizing person rather than a machine. Both follow the panel's advice: buy the
 * upgrade that pays back soonest if it pays back before the van, otherwise pack a carton.
 * Relaxed: presses about twice a second for the first few minutes, then in short bursts; notices a
 * snag after ~2 s; grabs two speed bursts in three; picks overnight mode.
 * Engaged: presses four times a second, then three times a second for half of every minute;
 * frees snags at once; grabs nine bursts in ten; picks the foot pedal.
 */
function officeNight(s: CampaignState, r: Route) {
  const c = s.chapterState as C01State;
  const eff = r.player === 'efficient';
  for (const f of Object.keys(c.files)) if (c.files[f] === 'unread') dispatch(s, { type: 'c01/read', file: f });
  if (spareOffered(s)) dispatch(s, { type: 'c01/takeSpare' });
  if (c.trial === 'open' && loose(s) >= OFFICE.trial.clips) dispatch(s, { type: 'c01/sendTrial' });
  // The dark end of the desk: noticed after a few seconds (relaxed) or at once (engaged).
  if (sheetReady(s) && (eff || s.simMs % 3_000 < 100)) dispatch(s, { type: 'c01/lift' });
  if (c.jammed) {
    jamSteps += 1;
    if (eff || jamSteps >= 20) {
      dispatch(s, { type: 'c01/free' });
      jamSteps = 0;
    }
  }
  const minutes = s.simMs / 60000;
  const sec = s.simMs % 60_000;
  const rate = eff ? (minutes < 4 ? 0.4 : sec < 30_000 ? 0.3 : 0) : minutes < 3 ? 0.2 : sec < 15_000 ? 0.25 : 0;
  clickCredit += rate;
  while (clickCredit >= 1) {
    clickCredit -= 1;
    dispatch(s, { type: 'c01/make' });
  }
  if (burstReady(s)) {
    const shownFor = s.simMs - (c.burstReadyUntilMs - OFFICE.bursts.windowMs);
    if (shownFor >= (eff ? 1000 : 2500) && glintDecided !== c.burstReadyUntilMs) {
      glintDecided = c.burstReadyUntilMs;
      glintSeen += 1;
      if (eff ? glintSeen % 10 !== 0 : glintSeen % 3 !== 0) dispatch(s, { type: 'c01/catch' });
    }
  }
  // The late-night events. Relaxed: lets hot machines cool, takes the courier only with a carton's worth ready.
  // Engaged: keeps the machines running and always takes the courier.
  if (c.hot?.phase === 'offer' && s.simMs % 3_000 < 100) dispatch(s, { type: 'c01/hot', cool: !eff });
  if (c.courier?.phase === 'offer' && s.simMs % 3_000 < 100) dispatch(s, { type: 'c01/courier', accept: eff || loose(s) >= OFFICE.boxSize });
  if (c.courier?.phase === 'run' && loose(s) >= OFFICE.boxSize) dispatch(s, { type: 'c01/pack' });
  if (c.capped || c.installing) return;
  const l = loose(s);
  // The one either/or: overnight mode for a relaxed player, the foot pedal for an engaged one.
  const avoid = eff ? 'governor' : 'pedal';
  const offered = offeredProjects(s).filter((p) => p.id !== avoid);
  // Before the big order: buy whatever is on offer, then pack the carton.
  if (c.sealed === 0) {
    const buy = offered.find((p) => !canStart(s, p.id));
    if (buy) dispatch(s, { type: 'c01/project', id: buy.id });
    else if (c.trial === 'approved' && owns(c, 'calibrate') && l >= OFFICE.boxSize) dispatch(s, { type: 'c01/pack' });
    return;
  }
  // The big order: the wire spring if it is still on offer, then the best-paying upgrade if it pays before the van, else pack.
  for (const p of offered) if (p.id === 'tensioner' && !canStart(s, p.id)) dispatch(s, { type: 'c01/project', id: p.id });
  if (c.installing) return;
  const best = bestUpgrade(s);
  const chosen = best && best.id === avoid ? null : best;
  const target = chosen && paysInTime(s, chosen) ? chosen : (offered.find((p) => p.exclusive && paysInTime(s, p)) ?? null);
  if (target && !canStart(s, target.id)) {
    dispatch(s, { type: 'c01/project', id: target.id });
    return;
  }
  // Pack when the clips are not needed for something worth saving for.
  const saving = target ? target.costClips : 0;
  if (l >= OFFICE.boxSize && l - OFFICE.boxSize >= saving) dispatch(s, { type: 'c01/pack' });
}

let handCredit = 0;
let buildSteps = 0;
let buildBuys = 0;

/**
 * A simulated player for the building. Relaxed: unloads at about 1.5 a second while there is no dock
 * hand, looks at the shop every three seconds and usually (not always) buys for the slowest room,
 * takes two rush orders in three, and only buys a fan once the workshop has overheated. Engaged:
 * unloads as fast as hands allow, buys the moment it can for the slowest room, takes every rush and
 * buys fans before the workshop overheats.
 */
function buildingDay(s: CampaignState, r: Route) {
  const c = s.chapterState as C02State;
  const eff = r.player === 'efficient';
  buildSteps += 1;
  if (r.salvage) for (const id of OFFICE_ITEMS) if (clearable(s, id)) dispatch(s, { type: 'request', kind: 'salvage', subject: id });
  if (r.clearGarden && !c.directBuilt && routeOpen(c)) dispatch(s, { type: 'request', kind: 'clearGarden' });
  const dockShort = roomRate(c, 'dock') < lineRate(c) && c.wire < 40;
  const handRate = c.levels.dock === 0 ? (eff ? 0.25 : 0.15) : dockShort ? (eff ? 0.1 : 0.03) : 0;
  handCredit += handRate;
  while (handCredit >= 1) {
    handCredit -= 1;
    dispatch(s, { type: 'c02/unload' });
  }
  if (c.rush && !c.rush.taken && s.simMs >= c.rush.untilMs - (eff ? 19_000 : 15_000)) {
    if (eff || c.rush.target % 3 !== 0) dispatch(s, { type: 'c02/rush' });
  }
  if (!shopOpen(c) || (!eff && buildSteps % 30 !== 0)) return;
  let target: RoomId | 'fan' = dockShort ? 'dock' : slowestRoom(c).id;
  if (heatOpen(c) && (eff ? c.heatMilli > 50_000 && heatGain(c) > cooling(c) : c.throttled)) target = 'fan';
  else if (!eff && buildBuys % 4 === 3) target = 'workshop';
  if (c.stock >= price(c, target)) {
    if (!dispatch(s, { type: 'c02/buy', room: target })) buildBuys += 1;
  }
}

export function act(s: CampaignState, r: Route): void {
  tick += 1;
  switch (s.chapter) {
    case '01': {
      officeNight(s, r);
      return;
    }
    case '02': {
      buildingDay(s, r);
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
  // The simulated players test the whole campaign, past the demo's end.
  s.flags['campaign.full'] = true;
  tick = 0;
  clickCredit = 0;
  jamSteps = 0;
  glintSeen = 0;
  glintDecided = 0;
  handCredit = 0;
  buildSteps = 0;
  buildBuys = 0;
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
