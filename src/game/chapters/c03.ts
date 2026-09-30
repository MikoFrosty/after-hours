import { CITY, ENVELOPES, beat } from '../../content/campaign';
import { LETTERS } from '../../content/narrative';
import { CITY_ANCHORS, DISTRICTS } from '../../content/world';
import { accrue, clamp, mulMilli } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { AnchorId, C03State, CampaignState } from '../types';

const cs = (s: CampaignState) => s.chapterState as C03State;

export const met = (c: C03State, i: number) => c.alloc[i] >= c.demand[i];
export const allAtLeast = (c: C03State, v: number) => c.scoresMilli.every((x) => x >= v);

export function reserveRate(c: C03State): number {
  if (c.safetyThrottle || !allAtLeast(c, CITY.certMin)) return 0;
  const base = c.alloc[3] * CITY.reservePerIndustry;
  return c.consultation === 'retained' ? mulMilli(base, CITY.consultation) : base;
}

export const VIGNETTES = [
  'Harbor: the Thursday market ran two hours late. Nobody asked it to stop.',
  'Terraces: a choir rehearses in the empty transit hall after the last train.',
  'Old Quarter: a tenants’ meeting about the new benches ran long.',
  'Harbor: someone taught a class on repairing bicycles for free.',
  'Terraces: the school garden produced more tomatoes than anyone could eat.',
  'Old Quarter: an argument about a mural became a second mural.',
  'Harbor: four people fished off the pier all afternoon and caught nothing. They came back the next day.',
  'Terraces: the library extended its hours because people kept staying.',
];

export const c03: Controller = {
  id: '03',
  storyScale: 1_728_000 / 1000, // twenty story days per simulated second

  enter(s) {
    s.chapterState = {
      kind: '03',
      alloc: [...CITY.defaultAlloc] as [number, number, number, number],
      demand: [...CITY.demand] as [number, number, number],
      scoresMilli: [CITY.scoreInitial, CITY.scoreInitial, CITY.scoreInitial],
      scoreResidue: [0, 0, 0],
      reserveMilli: 0,
      reserveResidue: 0,
      processedUnits: 0,
      stableMs: 0,
      permits: 0,
      permitsAwarded: 0,
      reducedDistricts: [],
      safeguards: false,
      safetyThrottle: false,
      consultation: null,
      saturated: false,
    };
    const env = ENVELOPES['03'];
    openAccount(s, 'city.supply', 'raw', 'feedstock', 'City procurement supply', 'city');
    const places: Array<[AnchorId, string, string]> = [
      ['square', 'Public square', 'Harbor district'],
      ['mural', 'School mural', 'Terraces primary school'],
      ['correspondence', 'Civic correspondence', 'City hall archive'],
    ];
    for (const [id, label] of places) {
      openAccount(s, `city.${id}`, 'archiveProtected', 'original', label, 'city', { protected: true, anchor: id });
    }
    openAccount(s, 'city.habitat', 'livingProtected', 'living', 'Living habitat', 'city', { protected: true, anchor: 'habitat' });
    const carved = CITY_ANCHORS.square + CITY_ANCHORS.mural + CITY_ANCHORS.correspondence + CITY_ANCHORS.habitat;
    mustCommit(s, {
      id: 'grant.03',
      from: 'unreached',
      input: env.grant,
      outputs: [
        ['city.supply', env.grant - carved],
        ['city.square', CITY_ANCHORS.square],
        ['city.mural', CITY_ANCHORS.mural],
        ['city.correspondence', CITY_ANCHORS.correspondence],
        ['city.habitat', CITY_ANCHORS.habitat],
      ],
    });
    for (const [id, , loc] of places) {
      const a = s.anchors[id];
      Object.assign(a, { fidelity: 'original', originalLocation: loc, currentLocation: loc, originalMassAccount: `city.${id}`, protected: true });
      a.evidence = ['disclosed Act 3'];
    }
    Object.assign(s.anchors.habitat, {
      fidelity: 'original',
      originalLocation: 'Habitat district',
      currentLocation: 'Habitat district',
      originalMassAccount: 'city.habitat',
      living: true,
      alive: true,
      protected: true,
    });
    s.anchors.habitat.evidence = ['disclosed Act 3'];
    if (s.anchors.garden.fidelity === 'original') {
      s.anchors.garden.currentLocation = 'Building courtyard · city landmark';
      log(s, { id: 'c03.landmark', kind: 'system', title: 'Landmark listed', text: 'The night garden in the building courtyard is now a listed city landmark.' });
    } else {
      log(s, { id: 'c03.landmark', kind: 'system', title: 'Loading yard', text: 'The direct loading yard is listed as critical freight infrastructure.' });
    }
  },

  step(s, dt) {
    const c = cs(s);
    for (let i = 0; i < 3; i++) {
      const rate = met(c, i) ? CITY.gain : -CITY.loss;
      const num = rate * dt + c.scoreResidue[i];
      const d = Math.trunc(num / 1000);
      c.scoreResidue[i] = num - d * 1000;
      c.scoresMilli[i] = clamp(c.scoresMilli[i] + d, 0, 100_000);
    }
    // Safety throttle: visible, restores the disclosed safe allocation when safeguards are enabled.
    if (!c.safetyThrottle && c.scoresMilli.some((x) => x < CITY.safetyMin)) {
      c.safetyThrottle = true;
      if (c.safeguards) c.alloc = [...CITY.defaultAlloc] as [number, number, number, number];
      emit({ type: 'sound', id: 'throttle' });
      log(s, {
        id: `c03.safety.${s.simMs}`,
        kind: 'system',
        title: 'Safety throttle',
        text: c.safeguards
          ? 'A district fell below 30. Safe allocation 2 · 2 · 2 · 4 restored. Reserve certification paused.'
          : 'A district fell below 30. Reserve certification paused until it recovers.',
      });
      bump(s);
    } else if (c.safetyThrottle && c.scoresMilli.every((x) => x >= CITY.safetyMin) && [0, 1, 2].every((i) => met(c, i))) {
      c.safetyThrottle = false;
      bump(s);
    }
    const rate = reserveRate(c);
    if (rate > 0) {
      const [g, r] = accrue(rate, dt, c.reserveResidue);
      c.reserveResidue = r;
      c.reserveMilli += g;
    }
    c.stableMs = allAtLeast(c, CITY.exitScore) ? c.stableMs + dt : 0;
    const units = Math.floor(c.reserveMilli / 1000);
    while (c.processedUnits < units) {
      c.processedUnits += 1;
      const input = minBig(ENVELOPES['03'].batch, mass(s, 'city.supply'));
      if (input <= 0n) break;
      makeClips(s, 'c03.batch', 'city.supply', input);
    }
  },

  events(s) {
    const c = cs(s);
    if (allAtLeast(c, CITY.certMin)) {
      const [t, x] = beat('03', 0);
      beatNow(s, '03', 0, t, x);
      if (c.consultation === null && once(s, 'c03.consultation')) {
        ask(s, { id: 'c03.consultation', kind: 'c03/consultation', checkpoint: true, data: { checkpointLabel: 'Before: approval process' } });
      }
    }
    CITY.milestones.slice(0, 2).forEach((m, i) => {
      if (c.reserveMilli >= m && once(s, `c03.permit.${i}`)) {
        c.permits += 1;
        c.permitsAwarded += 1;
        emit({ type: 'sound', id: 'contract' });
        log(s, { id: `c03.permit.${i}`, kind: 'system', title: 'City permit', text: `Reserve ${m / 1000} certified. One city permit granted.` });
        bump(s);
      }
    });
    // Resident vignettes: feedback that is not consumption.
    if (allAtLeast(c, CITY.certMin)) {
      const idx = Math.floor((s.simMs - s.chapterEnteredSimMs) / 18_000) % VIGNETTES.length;
      if (s.flags.vignette !== idx) s.flags.vignette = idx;
    }
    const final = CITY.milestones[2];
    if (c.reserveMilli >= final && allAtLeast(c, CITY.exitScore) && c.stableMs >= CITY.exitStableMs) {
      if (!c.saturated) {
        c.saturated = true;
        const [t, x] = beat('03', 1);
        beatNow(s, '03', 1, t, x);
        s.flags['reflection.city'] = true;
      }
      if (!s.charters.reserveMandate && once(s, 'c03.mandate')) {
        ask(s, { id: 'c03.mandate', kind: 'c03/mandate', checkpoint: true, data: { checkpointLabel: 'Before: reserve mandate' } });
      }
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c03/shift': {
        const { from, to } = a;
        if (from === to || from < 0 || from > 3 || to < 0 || to > 3) return 'Invalid allocation.';
        if (c.alloc[from] <= 0) return 'Nothing to move.';
        const next = [...c.alloc] as C03State['alloc'];
        next[from] -= 1;
        next[to] += 1;
        if (next.some((x) => x < 0 || !Number.isInteger(x)) || next.reduce((x, y) => x + y, 0) !== CITY.budget) return 'Invalid allocation.';
        c.alloc = next;
        emit({ type: 'sound', id: 'tick' });
        return null;
      }
      case 'c03/project': {
        if (c.permits < 1) return 'Requires one city permit.';
        if (s.projects[a.id] === 'complete') return 'Already complete.';
        if (a.district < 0 || a.district > 2) return 'Choose a district.';
        if (c.reducedDistricts.includes(a.district)) return 'Choose a different district.';
        c.permits -= 1;
        c.demand[a.district] = 1;
        c.reducedDistricts.push(a.district);
        s.projects[a.id] = 'complete';
        log(s, {
          id: `c03.${a.id}`,
          kind: 'system',
          title: a.id === 'heatReuse' ? 'Heat reuse' : 'Transit coordination',
          text: `${DISTRICTS[a.district]} demand 2 → 1. The released unit can move to industry or stay where it is.`,
        });
        emit({ type: 'sound', id: 'install' });
        emit({ type: 'save', reason: 'project' });
        bump(s);
        return null;
      }
      case 'c03/safeguards':
        c.safeguards = a.on;
        s.projects.safeguards = a.on ? 'complete' : 'available';
        return null;
      case 'request':
        if (a.kind === 'mandate') {
          if (!c.saturated || s.charters.reserveMandate) return 'Not yet offered.';
          ask(s, { id: `c03.mandate.${s.seq++}`, kind: 'c03/mandate', checkpoint: true, data: { checkpointLabel: 'Before: reserve mandate' } });
          return null;
        }
        return 'Unknown request';
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind === 'c03/consultation') {
      c.consultation = option === 'retain' ? 'retained' : 'streamlined';
      const L = c.consultation === 'retained' ? LETTERS.dissent : LETTERS.streamlined;
      log(s, { id: L.id, kind: 'letter', title: L.title, text: L.text, author: L.author, dateline: L.dateline });
      s.projects.witness = c.consultation === 'retained' ? 'available' : 'locked';
      emit({ type: 'sound', id: 'charter' });
      bump(s);
      return;
    }
    if (choice.kind === 'c03/mandate') {
      if (option === 'accept') {
        s.charters.reserveMandate = true;
        const [t, x] = beat('03', 2);
        beatNow(s, '03', 2, t, x);
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'decline') {
        hold(s, 'city');
      }
    }
  },

  guard(s) {
    const c = cs(s);
    return c.reserveMilli >= CITY.milestones[2] && c.stableMs >= CITY.exitStableMs && s.charters.reserveMandate;
  },
};
