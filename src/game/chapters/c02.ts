import { BUILDING, ENVELOPES, beat } from '../../content/campaign';
import { GARDEN_MASS } from '../../content/world';
import { accrue, clamp, mulMilli } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C02State, CampaignState } from '../types';
import { clearable, salvageOfficeItem, type OfficeItem } from '../officeSalvage';

const cs = (s: CampaignState) => s.chapterState as C02State;

export type Station = 'dock' | 'drawing' | 'bender' | 'dispatch';
export const STATIONS: Station[] = ['dock', 'drawing', 'bender', 'dispatch'];

export function stationRates(c: C02State): Record<Station, number> {
  return {
    dock: BUILDING.stations.dock,
    drawing: c.upgrades.wireDraw ? BUILDING.upgradedDrawing : BUILDING.stations.drawing,
    bender: BUILDING.stations.bender,
    dispatch: c.upgrades.freight ? BUILDING.upgradedDispatch : BUILDING.stations.dispatch,
  };
}

export function bottleneck(c: C02State): Station {
  const r = stationRates(c);
  let best: Station = 'dock';
  for (const st of STATIONS) if (r[st] < r[best]) best = st;
  return best;
}

/** Unthrottled pipeline throughput (milli-work/sec): minimum station rate × route factor. */
export function baseThroughput(c: C02State): number {
  const r = stationRates(c);
  const min = Math.min(...STATIONS.map((st) => r[st]));
  return mulMilli(min, c.route === 'direct' ? BUILDING.routes.direct : BUILDING.routes.courtyard);
}

export function throughput(c: C02State): number {
  if (!c.running || c.awaitingInspection || c.contractIndex >= BUILDING.contracts.length) return 0;
  const t = baseThroughput(c);
  return c.throttled ? mulMilli(t, BUILDING.heat.throttleFactor) : t;
}

export function coolingRate(c: C02State): number {
  return c.upgrades.roofCooling ? BUILDING.heat.improvedCooling : BUILDING.heat.cooling;
}

export function heatGainRate(c: C02State): number {
  return mulMilli(throughput(c), BUILDING.heat.gainPerWork);
}

export const c02: Controller = {
  id: '02',
  storyScale: 43_200 / 1000, // twelve story hours per simulated second

  enter(s) {
    s.chapterState = {
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
      upgrades: { wireDraw: false, freight: false, roofCooling: false },
      awaitingInspection: false,
      contractStartMs: s.simMs,
      peakHeatMilli: 0,
      throttledMs: 0,
    };
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
      text: 'The office is being cleared for the lease. The desk, the terminal and the bench come along. The cabinet, the lamp and the frame can come too, or go to the line.',
    });
    log(s, {
      id: 'c02.intro',
      kind: 'system',
      title: 'Building access',
      text: 'Loading dock, wire workshop, freight lift and shipping floor. Material is purchased from a finite disclosed allocation.',
    });
  },

  step(s, dt) {
    const c = cs(s);
    const t = throughput(c);
    if (t > 0) {
      const [gain, res] = accrue(t, dt, c.workResidue);
      c.workResidue = res;
      c.contractWorkMilli += gain;
      c.cumulativeWorkMilli += gain;
    }
    // Heat: rises by throughput × 0.8 and cools continuously; clamped to [0, 100].
    const net = heatGainRate(c) - coolingRate(c);
    const num = net * dt + c.heatResidue;
    const delta = Math.trunc(num / 1000);
    c.heatResidue = num - delta * 1000;
    c.heatMilli = clamp(c.heatMilli + delta, 0, 100_000);
    if (c.heatMilli === 0 || c.heatMilli === 100_000) c.heatResidue = 0;
    if (!c.awaitingInspection && c.contractIndex < BUILDING.contracts.length) {
      c.peakHeatMilli = Math.max(c.peakHeatMilli ?? 0, c.heatMilli);
      if (c.throttled) c.throttledMs = (c.throttledMs ?? 0) + dt;
    }
    if (!c.throttled && c.heatMilli >= BUILDING.heat.throttleOn) {
      c.throttled = true;
      emit({ type: 'sound', id: 'throttle' });
      log(s, { id: `c02.throttle.${s.simMs}`, kind: 'system', title: 'Thermal throttle', text: 'Heat 80. Output limited to 25% until the plant cools to 50.' });
      bump(s);
    } else if (c.throttled && c.heatMilli <= BUILDING.heat.throttleOff) {
      c.throttled = false;
      emit({ type: 'sound', id: 'recover' });
      bump(s);
    }
    // Whole work units schedule bounded batches from the disclosed supply.
    const units = Math.floor(c.cumulativeWorkMilli / 1000);
    const batch = ENVELOPES['02'].batch;
    while (c.processedUnits < units) {
      c.processedUnits += 1;
      const input = minBig(batch, mass(s, 'building.supply'));
      if (input <= 0n) break;
      makeClips(s, 'c02.batch', 'building.supply', input);
    }
    const target = BUILDING.contracts[c.contractIndex];
    if (target !== undefined && c.contractWorkMilli >= target && !c.awaitingInspection) {
      c.contractIndex += 1;
      c.contractWorkMilli = 0;
      c.permits += 1;
      c.awaitingInspection = true;
      emit({ type: 'sound', id: 'contract' });
      // The inspection reports how this contract went, so it can inform the next permit.
      const started = c.contractStartMs ?? s.chapterEnteredSimMs;
      const data = {
        contract: c.contractIndex,
        seconds: Math.round((s.simMs - started) / 1000),
        peakHeat: Math.round((c.peakHeatMilli ?? 0) / 1000),
        throttledSeconds: Math.round((c.throttledMs ?? 0) / 1000),
      };
      c.contractStartMs = s.simMs;
      c.peakHeatMilli = c.heatMilli;
      c.throttledMs = 0;
      ask(s, { id: `c02.inspection.${c.contractIndex}`, kind: 'c02/inspection', checkpoint: false, data });
    }
  },

  events(s) {
    const c = cs(s);
    if (c.contractIndex >= 1) {
      const [t, x] = beat('02', 0);
      beatNow(s, '02', 0, t, x);
    }
    if (c.contractIndex >= 3 && !c.awaitingInspection && !s.charters.maintenanceCharter && once(s, 'c02.maintenance')) {
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
      case 'c02/route':
        if (a.route === 'direct' && !c.directBuilt) return 'The direct route has not been built.';
        c.route = a.route; // switching between built routes is free and applies to future work only
        emit({ type: 'sound', id: 'switch' });
        return null;
      case 'c02/upgrade': {
        if (c.upgrades[a.id]) return 'Already installed.';
        if (c.permits < 1) return 'Requires one permit.';
        c.permits -= 1;
        c.upgrades[a.id] = true;
        s.projects[a.id] = 'complete';
        emit({ type: 'sound', id: 'install' });
        emit({ type: 'save', reason: 'upgrade' });
        bump(s);
        return null;
      }
      case 'request':
        if (a.kind === 'salvage') {
          const id = a.subject as OfficeItem;
          if (!clearable(s, id)) return 'Not available.';
          ask(s, { id: `office.salvage.${id}`, kind: 'office/salvage', subject: id, checkpoint: true, data: { checkpointLabel: `Before: send the ${id} to the line` } });
          return null;
        }
        if (a.kind === 'clearGarden') {
          if (c.directBuilt) return 'Already built.';
          ask(s, { id: 'c02.clearGarden', kind: 'c02/clearGarden', subject: 'garden', checkpoint: true, data: { checkpointLabel: 'Before: clear the garden' } });
          return null;
        }
        if (a.kind === 'charter') {
          const id = a.subject as 'maintenanceCharter' | 'cityTender';
          if (s.charters[id]) return 'Already accepted.';
          if (id === 'maintenanceCharter' && c.contractIndex < 3) return 'Not yet offered.';
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
      c.awaitingInspection = false;
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
    return c.contractIndex >= 3 && s.charters.maintenanceCharter && s.charters.cityTender;
  },
};
