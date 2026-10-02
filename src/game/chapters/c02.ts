import { BUILDING, ENVELOPES, beat, type BuildingUpgradeId } from '../../content/campaign';
import { GARDEN_MASS } from '../../content/world';
import { clamp, mulMilli } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { BuildingStation, C02State, CampaignState } from '../types';
import { clearable, salvageOfficeItem, type OfficeItem } from '../officeSalvage';

// The building: six contracts, each introducing one thing. Work flows from the loading dock through
// the stations as real queues, so the slowest station shows itself by the queue piling up in front of it.

const cs = (s: CampaignState) => s.chapterState as C02State;

export type Station = BuildingStation;
export const STATIONS: Station[] = ['dock', 'drawing', 'bender', 'dispatch'];
export const CONTRACTS = BUILDING.contractList;
export const LAST = CONTRACTS.length;

/** The contract being worked on (or the last one, once all are delivered). */
export const currentContract = (c: C02State) => CONTRACTS[Math.min(c.contractIndex, LAST - 1)];

/** Stations open so far: the bench and the dock first, drawing from contract 2, dispatch from contract 3. */
export function onlineStations(c: C02State): Station[] {
  const list: Station[] = ['dock'];
  if (c.contractIndex >= 1) list.push('drawing');
  list.push('bender');
  if (c.contractIndex >= 2) list.push('dispatch');
  return list;
}

/** What each contract introduced, in the order the player meets it. */
export const heatIntroduced = (c: C02State) => c.contractIndex >= 3 || c.heatMilli >= 30_000;
export const routeIntroduced = (c: C02State) => c.contractIndex >= 4;

export const routeFactor = (c: C02State) => (c.route === 'direct' ? BUILDING.routes.direct : BUILDING.routes.courtyard);

/** Each station's automatic rate in milli-units per second (0 for a dock with no crew). */
export function stationRates(c: C02State): Record<Station, number> {
  const throttle = (r: number) => (c.throttled ? mulMilli(r, BUILDING.heat.throttleFactor) : r);
  return {
    dock: c.upgrades.dockCrew ? mulMilli(BUILDING.stations.dock, routeFactor(c)) : 0,
    drawing: throttle(c.upgrades.wireDraw ? BUILDING.upgraded.drawing : BUILDING.stations.drawing),
    bender: throttle(c.upgrades.secondBender ? BUILDING.upgraded.bender : BUILDING.stations.bender),
    dispatch: c.upgrades.freight ? BUILDING.upgraded.dispatch : BUILDING.stations.dispatch,
  };
}

/** The slowest open station: where the queue piles up. */
export function bottleneck(c: C02State): Station {
  const r = stationRates(c);
  let best: Station = 'dock';
  for (const st of onlineStations(c)) if (r[st] < r[best]) best = st;
  return best;
}

/** Steady-state throughput (milli-units per second) with no hands: the slowest open station. */
export function baseThroughput(c: C02State): number {
  const r = stationRates(c);
  return Math.min(...onlineStations(c).map((st) => r[st]));
}

/** Heat added per second when the bench runs at full rate, in milli-heat. */
export function heatGainRate(c: C02State): number {
  const r = stationRates(c);
  const benchRate = Math.min(baseThroughput(c), r.bender);
  return mulMilli(benchRate, BUILDING.heat.gainPerWork);
}

export function coolingRate(c: C02State): number {
  return c.upgrades.roofCooling ? BUILDING.heat.improvedCooling : BUILDING.heat.cooling;
}

export function throughput(c: C02State): number {
  if (!c.running || c.awaitingInspection || c.contractIndex >= LAST) return 0;
  return baseThroughput(c);
}

/** Upgrades that a permit could buy now, in campaign order. */
export function availableUpgrades(c: C02State): BuildingUpgradeId[] {
  return BUILDING.upgrades.filter((u) => !c.upgrades[u.id] && c.contractIndex >= u.afterContract).map((u) => u.id);
}

/** Throughput a given upgrade would give (for permit choices). */
export function throughputWith(c: C02State, id: BuildingUpgradeId): number {
  return baseThroughput({ ...c, throttled: false, upgrades: { ...c.upgrades, [id]: true } });
}

export function newBuildingState(simMs: number): C02State {
  return {
    kind: '02',
    route: 'courtyard',
    directBuilt: false,
    running: true,
    heatMilli: 0,
    heatResidue: 0,
    throttled: false,
    contractIndex: 0,
    contractWorkMilli: 0,
    cumulativeWorkMilli: 0,
    workResidue: 0,
    processedUnits: 0,
    permits: 0,
    upgrades: { dockCrew: false, wireDraw: false, secondBender: false, freight: false, roofCooling: false },
    awaitingInspection: false,
    queues: { dock: 0, drawing: 0, bender: 0 },
    hands: BUILDING.hands.maxPerSecond,
    handAt: 'dock',
    shipRate: 0,
    contractStartMs: simMs,
    peakHeatMilli: 0,
    throttledMs: 0,
  };
}

/** The queue a station takes from (null for the dock, which takes from the supply). */
function inputOf(c: C02State, st: Station): Station | null {
  const list = onlineStations(c);
  const i = list.indexOf(st);
  return i <= 0 ? null : list[i - 1];
}

const isLast = (c: C02State, st: Station) => onlineStations(c).at(-1) === st;

/** Move up to `want` milli-units through one station, limited by its input and the space after it. */
function process(s: CampaignState, st: Station, want: number): number {
  const c = cs(s);
  if (want <= 0) return 0;
  // Nothing leaves the building between contracts.
  if (isLast(c, st) && (c.awaitingInspection || c.contractIndex >= LAST)) return 0;
  const from = inputOf(c, st);
  const available = from === null ? Infinity : c.queues[from as keyof C02State['queues']];
  const space = isLast(c, st) ? Infinity : BUILDING.bufferCap - c.queues[st as keyof C02State['queues']];
  const amt = Math.max(0, Math.min(want, available, space));
  if (amt <= 0) return 0;
  if (from !== null) c.queues[from as keyof C02State['queues']] -= amt;
  if (isLast(c, st)) ship(s, amt);
  else c.queues[st as keyof C02State['queues']] += amt;
  if (st === 'bender') c.heatMilli = clamp(c.heatMilli + mulMilli(amt, BUILDING.heat.gainPerWork), 0, 100_000);
  return amt;
}

/** Work leaving the building counts toward the contract; each whole unit draws a batch from the supply. */
function ship(s: CampaignState, amt: number) {
  const c = cs(s);
  if (c.contractIndex >= LAST || c.awaitingInspection) return;
  c.contractWorkMilli += amt;
  c.cumulativeWorkMilli += amt;
  c.shippedThisStep = (c.shippedThisStep ?? 0) + amt;
  const units = Math.floor(c.cumulativeWorkMilli / 1000);
  const batch = ENVELOPES['02'].batch;
  while (c.processedUnits < units) {
    c.processedUnits += 1;
    const input = minBig(batch, mass(s, 'building.supply'));
    if (input <= 0n) break;
    makeClips(s, 'c02.batch', 'building.supply', input);
  }
  if (c.contractWorkMilli >= currentContract(c).work) completeContract(s);
}

function completeContract(s: CampaignState) {
  const c = cs(s);
  const n = c.contractIndex + 1;
  const data = {
    contract: n,
    seconds: Math.round((s.simMs - c.contractStartMs) / 1000),
    peakHeat: Math.round(c.peakHeatMilli / 1000),
    throttledSeconds: Math.round(c.throttledMs / 1000),
  };
  c.contractIndex = n;
  c.contractWorkMilli = 0;
  // The first contract's line ("the lights stayed on…") is the inspection's title; keep it in the log only.
  if (n === 1 && once(s, 'beat.02.0')) {
    const [t, x] = beat('02', 0);
    log(s, { id: 'beat.02.0', kind: 'beat', title: t, text: x });
    emit({ type: 'sound', id: 'motif' });
  }
  // A permit for every contract but the last, which the charters follow.
  if (n < LAST) c.permits += 1;
  c.awaitingInspection = true;
  emit({ type: 'sound', id: 'contract' });
  ask(s, { id: `c02.inspection.${n}`, kind: 'c02/inspection', checkpoint: false, data });
}

function buyUpgrade(s: CampaignState, id: BuildingUpgradeId): string | null {
  const c = cs(s);
  if (c.upgrades[id]) return 'Already installed.';
  if (!availableUpgrades(c).includes(id)) return 'Not offered yet.';
  if (c.permits < 1) return 'Requires one permit.';
  c.permits -= 1;
  c.upgrades[id] = true;
  if (id === 'wireDraw' || id === 'freight' || id === 'roofCooling') s.projects[id] = 'complete';
  emit({ type: 'sound', id: 'install' });
  emit({ type: 'save', reason: 'upgrade' });
  bump(s);
  return null;
}

/** The next contract begins: say what it brings, once, as a caption and in the log. */
function startContract(s: CampaignState) {
  const c = cs(s);
  c.awaitingInspection = false;
  c.contractStartMs = s.simMs;
  c.peakHeatMilli = c.heatMilli;
  c.throttledMs = 0;
  if (c.contractIndex >= LAST) return;
  const k = CONTRACTS[c.contractIndex];
  if (once(s, `c02.start.${k.id}`)) {
    log(s, { id: `c02.start.${k.id}`, kind: 'system', title: `Contract ${c.contractIndex + 1} · ${k.title}`, text: k.text });
    emit({ type: 'beat', title: `Contract ${c.contractIndex + 1} · ${k.title}`, text: k.text });
    emit({ type: 'sound', id: 'notice' });
  }
  bump(s);
}

/** Lend a hand at one station: push up to one unit through it now. Hands refill at two units a second. */
export function lendHand(s: CampaignState, st: Station): string | null {
  const c = cs(s);
  if (c.awaitingInspection || c.contractIndex >= LAST) return 'No contract running.';
  if (!onlineStations(c).includes(st)) return 'That station is not open yet.';
  c.handAt = st;
  // Presses faster than hands can work are simply absorbed.
  if (c.hands < BUILDING.hands.perPress) return null;
  const moved = process(s, st, BUILDING.hands.perPress);
  if (moved <= 0) {
    const from = inputOf(c, st);
    return from === null ? 'The dock is clear.' : `Nothing waiting at ${NAMES[st].toLowerCase()}.`;
  }
  c.hands -= BUILDING.hands.perPress;
  emit({ type: 'sound', id: st === 'dock' ? 'unload' : 'tend' });
  return null;
}

export const NAMES: Record<Station, string> = { dock: 'Loading dock', drawing: 'Wire drawing', bender: 'Bench', dispatch: 'Dispatch' };

/** Where a hand helps most: the furthest-downstream station with a full queue in front of it, else the dock while it has no crew, else the station last helped. */
export function handTarget(c: C02State): Station {
  if (!c.upgrades.dockCrew) return 'dock';
  const list = onlineStations(c);
  for (let i = list.length - 1; i > 0; i--) if (c.queues[list[i - 1] as keyof C02State['queues']] >= BUILDING.bufferCap) return list[i];
  return list.includes(c.handAt) ? c.handAt : bottleneck(c);
}

/** One line for the dock: what the building needs from the player now. */
export function buildingGoal(s: CampaignState): string {
  const c = cs(s);
  if (c.contractIndex >= LAST) return 'All contracts delivered.';
  if (c.awaitingInspection) return 'Inspection under way.';
  if (!c.running) return 'Production is stopped. Start it again when the workshop has cooled.';
  if (c.throttled) return 'The workshop is throttled to 25% until heat falls to 50. Next time, a short stop before 80 avoids it.';
  if (!c.upgrades.dockCrew) return 'No one is on the dock: unload coils by hand to keep the bench fed.';
  const r = stationRates(c);
  const bn = bottleneck(c);
  if (heatIntroduced(c) && c.heatMilli >= 60_000 && heatGainRate(c) > coolingRate(c)) {
    return `Heat ${Math.round(c.heatMilli / 1000)} and rising: at 80 the workshop throttles to 25%. A short stop now keeps it running.`;
  }
  const from = inputOf(c, bn);
  if (from !== null && c.queues[from as keyof C02State['queues']] >= BUILDING.bufferCap / 2) {
    return `Work is piling up in front of ${NAMES[bn].toLowerCase()}: that is the slowest station (${(r[bn] / 1000).toFixed(1)}/s). Lend it a hand.`;
  }
  return `${currentContract(c).title}: ${Math.floor(c.contractWorkMilli / 1000)} of ${currentContract(c).work / 1000} shipped.`;
}

export const c02: Controller = {
  id: '02',
  storyScale: BUILDING.storyPerMs, // six story hours per simulated second

  enter(s) {
    s.chapterState = newBuildingState(s.simMs);
    const env = ENVELOPES['02'];
    openAccount(s, 'building.supply', 'raw', 'feedstock', 'Building wire supply', 'building');
    openAccount(s, 'building.garden', 'archiveProtected', 'original', 'Night garden', 'building', {
      protected: true,
      anchor: 'garden',
    });
    mustCommit(s, {
      id: 'grant.02',
      from: 'unreached',
      input: env.grant,
      outputs: [
        ['building.supply', env.grant - GARDEN_MASS],
        ['building.garden', GARDEN_MASS],
      ],
    });
    const g = s.anchors.garden;
    g.fidelity = 'original';
    g.originalLocation = 'Building courtyard';
    g.currentLocation = 'Building courtyard';
    g.originalMassAccount = 'building.garden';
    g.protected = true;
    g.evidence = ['disclosed Act 2'];
    // Office inventory remains in its accounts and joins building stock.
    log(s, {
      id: 'c02.clearing',
      kind: 'system',
      title: 'The 11th floor',
      text: 'The office is being cleared for the lease. The desk, the terminal and the bench come along to the building. The cabinet, the lamp and the frame can come too, or go to the line.',
    });
    log(s, {
      id: 'c02.intro',
      kind: 'system',
      title: 'Building access',
      text: 'A ground-floor workshop and a loading dock. More of the building opens with each contract. Material is purchased from a finite disclosed allocation.',
    });
    startContract(s);
  },

  step(s, dt) {
    const c = cs(s);
    c.shippedThisStep = 0;
    // Hands refill.
    c.hands = Math.min(BUILDING.hands.maxPerSecond, c.hands + Math.floor((BUILDING.hands.maxPerSecond * dt) / 1000));
    if (c.running && !c.awaitingInspection && c.contractIndex < LAST) {
      // Downstream first, so space frees before work arrives.
      const r = stationRates(c);
      const list = onlineStations(c);
      for (let i = list.length - 1; i >= 0; i--) process(s, list[i], Math.floor((r[list[i]] * dt) / 1000));
      c.peakHeatMilli = Math.max(c.peakHeatMilli, c.heatMilli);
      if (c.throttled) c.throttledMs += dt;
    }
    // Cooling runs whether or not production does.
    c.heatMilli = clamp(c.heatMilli - Math.floor((coolingRate(c) * dt) / 1000), 0, 100_000);
    if (!c.throttled && c.heatMilli >= BUILDING.heat.throttleOn) {
      c.throttled = true;
      emit({ type: 'sound', id: 'throttle' });
      log(s, { id: `c02.throttle.${s.simMs}`, kind: 'system', title: 'Thermal throttle', text: 'Heat 80. The workshop runs at 25% until it cools to 50.' });
      bump(s);
    } else if (c.throttled && c.heatMilli <= BUILDING.heat.throttleOff) {
      c.throttled = false;
      emit({ type: 'sound', id: 'recover' });
      bump(s);
    }
    // Smoothed shipping rate for display (milli-units per second).
    const inst = Math.floor(((c.shippedThisStep ?? 0) * 1000) / dt);
    c.shipRate = Math.floor(c.shipRate * 0.95 + inst * 0.05);
  },

  events(s) {
    const c = cs(s);
    if (c.contractIndex >= LAST && !c.awaitingInspection && !s.charters.maintenanceCharter && once(s, 'c02.maintenance')) {
      ask(s, { id: 'c02.maintenance', kind: 'c02/charter', subject: 'maintenanceCharter', checkpoint: true, data: { checkpointLabel: 'Before: maintenance charter' } });
    }
    if (s.charters.maintenanceCharter && !s.charters.cityTender && once(s, 'c02.tender')) {
      const [t, x] = beat('02', 2);
      beatNow(s, '02', 2, t, x);
      ask(s, { id: 'c02.tender', kind: 'c02/charter', subject: 'cityTender', checkpoint: true, data: { checkpointLabel: 'Before: city tender' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c02/run':
        c.running = a.running;
        emit({ type: 'sound', id: a.running ? 'start' : 'stop' });
        return null;
      case 'c02/hand':
        return lendHand(s, a.station);
      case 'c02/route':
        if (a.route === 'direct' && !c.directBuilt) return 'The direct route has not been built.';
        c.route = a.route; // switching between built routes is free and applies to future work only
        emit({ type: 'sound', id: 'switch' });
        return null;
      case 'c02/upgrade':
        return buyUpgrade(s, a.id);
      case 'request':
        // Deciding to keep the old office folds the clearing card away; it can be reopened while the offer stands.
        if (a.kind === 'keepOffice' || a.kind === 'reviewOffice') {
          s.flags['c02.officeKept'] = a.kind === 'keepOffice';
          if (a.kind === 'keepOffice' && once(s, 'c02.officeKept.log')) {
            log(s, { id: 'c02.officeKept', kind: 'system', title: 'The 11th floor', text: 'The old office comes to the building as it was: cabinet, lamp and frame with it.' });
          }
          emit({ type: 'sound', id: 'switch' });
          return null;
        }
        if (a.kind === 'salvage') {
          const id = a.subject as OfficeItem;
          if (!clearable(s, id)) return 'Not available.';
          ask(s, { id: `office.salvage.${id}`, kind: 'office/salvage', subject: id, checkpoint: true, data: { checkpointLabel: `Before: send the ${id} to the line` } });
          return null;
        }
        if (a.kind === 'clearGarden') {
          if (c.directBuilt) return 'Already built.';
          if (!routeIntroduced(c)) return 'Deliveries do not need another route yet.';
          ask(s, { id: 'c02.clearGarden', kind: 'c02/clearGarden', subject: 'garden', checkpoint: true, data: { checkpointLabel: 'Before: clear the garden' } });
          return null;
        }
        if (a.kind === 'charter') {
          const id = a.subject as 'maintenanceCharter' | 'cityTender';
          if (s.charters[id]) return 'Already accepted.';
          if (id === 'maintenanceCharter' && c.contractIndex < LAST) return 'Not yet offered.';
          if (id === 'cityTender' && !s.charters.maintenanceCharter) return 'Not yet offered.';
          ask(s, { id: `c02.${id}.${s.seq++}`, kind: 'c02/charter', subject: id, checkpoint: true, data: { checkpointLabel: `Before: ${id}` } });
          return null;
        }
        return 'Unknown request';
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind === 'c02/inspection') {
      // The permit can be spent here, in the inspection, or kept for later.
      if (option.startsWith('buy:')) buyUpgrade(s, option.slice(4) as BuildingUpgradeId);
      startContract(s);
      return;
    }
    if (choice.kind === 'office/salvage') {
      const id = choice.subject as OfficeItem;
      if (option === 'confirm' && clearable(s, id)) salvageOfficeItem(s, id);
      return;
    }
    if (choice.kind === 'c02/clearGarden') {
      if (option !== 'confirm' || c.directBuilt) return;
      const acc = s.ledger.accounts['building.garden'];
      acc.released = true;
      mustCommit(s, {
        id: 'c02.clearGarden',
        from: 'building.garden',
        input: acc.mass,
        outputs: [['building.supply', acc.mass]],
        release: true,
        irreversible: true,
      });
      acc.protected = false;
      c.directBuilt = true;
      c.route = 'direct';
      const g = s.anchors.garden;
      g.fidelity = 'absent';
      g.protected = false;
      g.released = true;
      g.currentLocation = 'Direct loading route';
      g.evidence.push('cleared for direct loading, Act 2');
      log(s, { id: 'loss.garden', kind: 'loss', title: 'Night garden cleared', text: 'Fourteen beds, two linden trees and a bench removed. 2 t of material joined the building supply. The direct route is open.' });
      emit({ type: 'sound', id: 'demolish' });
      bump(s);
      return;
    }
    if (choice.kind === 'c02/charter') {
      const id = choice.subject as 'maintenanceCharter' | 'cityTender';
      if (option === 'accept') {
        s.charters[id] = true;
        emit({ type: 'sound', id: 'charter' });
        if (id === 'maintenanceCharter') {
          const [t, x] = beat('02', 1);
          beatNow(s, '02', 1, t, x);
        }
      } else if (option === 'decline') {
        hold(s, 'building');
      }
    }
  },

  guard(s) {
    const c = cs(s);
    return c.contractIndex >= LAST && s.charters.maintenanceCharter && s.charters.cityTender;
  },
};
