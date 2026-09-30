import { ENVELOPES, SOLAR, beat } from '../../content/campaign';
import { SOLAR_PROJECT_MASS } from '../../content/world';
import { accrue, mulMilli } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C05State, CampaignState } from '../types';

const cs = (s: CampaignState) => s.chapterState as C05State;
export type Role = keyof C05State['alloc'];
export const ROLES: Role[] = ['collector', 'fabricator', 'radiator', 'support'];

export function overhead(s: CampaignState): number {
  return Number(s.flags.protectedSupportCost ?? 0);
}

/** Net power (milli): max(0, 4C − 2S − 0.05 × protectedSupportCost). Support is reserved first. */
export function netPower(s: CampaignState): number {
  const a = cs(s).alloc;
  return Math.max(0, a.collector * SOLAR.collectorPower - a.support * SOLAR.supportPower - overhead(s) * SOLAR.overheadPowerFactor);
}

export function limits(s: CampaignState): { power: number; fabrication: number; cooling: number } {
  const a = cs(s).alloc;
  const radiator = s.projects.radiators === 'complete' ? SOLAR.improvedRadiatorRate : SOLAR.radiatorRate;
  return {
    power: Math.floor((netPower(s) * 1000) / SOLAR.workEnergyCost),
    fabrication: a.fabricator * SOLAR.fabricatorRate,
    cooling: a.radiator * radiator,
  };
}

export function deferred(s: CampaignState): boolean {
  const c = cs(s);
  return c.starChoice !== null && !c.habitatRelocated;
}

/** Output (milli-work/sec) = min(netPower/2, 2F, 2R or 3R), less 10% while stellar extraction is deferred. */
export function output(s: CampaignState): number {
  const l = limits(s);
  const base = Math.min(l.power, l.fabrication, l.cooling);
  return deferred(s) ? mulMilli(base, SOLAR.deferFactor) : base;
}

export function limitingRole(s: CampaignState): 'power' | 'fabrication' | 'cooling' {
  const l = limits(s);
  if (l.cooling <= l.power && l.cooling <= l.fabrication) return 'cooling';
  if (l.fabrication <= l.power) return 'fabrication';
  return 'power';
}

export function thresholdReached(c: C05State, i: number): boolean {
  return c.cumulativeMilli >= SOLAR.thresholds[i];
}

export const c05: Controller = {
  id: '05',
  storyScale: (5000 * 31_557_600) / 1000, // five thousand story years per simulated second

  enter(s) {
    s.chapterState = {
      kind: '05',
      alloc: { ...SOLAR.defaultAlloc },
      cumulativeMilli: 0,
      spendableMilli: 0,
      residue: 0,
      processedUnits: 0,
      seedKits: 0,
      starChoice: null,
      habitatRelocated: false,
    };
    openAccount(s, 'solar.supply', 'raw', 'feedstock', 'Asteroid and solar supply', 'solar');
    openAccount(s, 'solar.capital', 'capital', 'machine', 'Orbital infrastructure', 'solar');
    openAccount(s, 'solar.kits', 'capital', 'kit', 'Interstellar seed kits', 'solar');
    mustCommit(s, { id: 'grant.05', from: 'unreached', input: ENVELOPES['05'].grant, outputs: [['solar.supply', ENVELOPES['05'].grant]] });
    Object.assign(s.anchors.sky, {
      fidelity: 'original',
      originalLocation: 'Above the habitat',
      currentLocation: 'Above the habitat',
      evidence: ['disclosed Act 5'],
    });
    s.projects.radiators = 'locked';
    s.projects.extractionStudy = 'locked';
    s.projects.seedFoundry = 'locked';
  },

  step(s, dt) {
    const c = cs(s);
    const out = output(s);
    if (out > 0) {
      const [g, r] = accrue(out, dt, c.residue);
      c.residue = r;
      c.cumulativeMilli += g;
      c.spendableMilli += g;
    }
    const units = Math.floor(c.cumulativeMilli / 1000);
    while (c.processedUnits < units) {
      c.processedUnits += 1;
      const input = minBig(ENVELOPES['05'].batch, mass(s, 'solar.supply'));
      if (input <= 0n) break;
      makeClips(s, 'c05.batch', 'solar.supply', input);
    }
  },

  events(s) {
    const c = cs(s);
    if (c.cumulativeMilli > 0) {
      const [t, x] = beat('05', 0);
      beatNow(s, '05', 0, t, x);
    }
    const names = ['radiators', 'extractionStudy', 'seedFoundry'] as const;
    names.forEach((p, i) => {
      if (thresholdReached(c, i) && s.projects[p] === 'locked') {
        s.projects[p] = 'available';
        log(s, {
          id: `c05.unlock.${p}`,
          kind: 'system',
          title: ['High-temperature radiators', 'Stellar extraction study', 'Seed foundry'][i],
          text: [
            'Cumulative orbital work 100. Radiator project available (20 work).',
            'Cumulative orbital work 250. Stellar extraction study available (20 work).',
            'Cumulative orbital work 500. Interstellar seed fabrication available (30 work per kit).',
          ][i],
        });
        emit({ type: 'sound', id: 'notice' });
        bump(s);
      }
    });
    if (s.projects.radiators !== 'locked') {
      const [t, x] = beat('05', 1);
      beatNow(s, '05', 1, t, x);
    }
    if (
      c.cumulativeMilli >= SOLAR.thresholds[2] &&
      s.projects.radiators === 'complete' &&
      s.projects.extractionStudy === 'complete' &&
      c.seedKits >= SOLAR.seedKits &&
      c.starChoice !== null &&
      !s.charters.autonomyCharter &&
      once(s, 'c05.charter')
    ) {
      ask(s, { id: 'c05.charter', kind: 'charter', subject: 'autonomyCharter', checkpoint: true, data: { checkpointLabel: 'Before: autonomy charter' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c05/shift': {
        if (a.from === a.to) return null;
        if (c.alloc[a.from] <= 0) return 'Nothing to move.';
        if (a.from === 'support' && c.alloc.support <= 1) return 'The protected support slot is non-negotiable.';
        c.alloc[a.from] -= 1;
        c.alloc[a.to] += 1;
        emit({ type: 'sound', id: 'tick' });
        return null;
      }
      case 'c05/project': {
        if (s.projects[a.id] !== 'available') return 'Not available.';
        if (c.spendableMilli < SOLAR.projectWork) return 'Requires 20 spendable work.';
        if (mass(s, 'solar.supply') < SOLAR_PROJECT_MASS) return 'Missing source material.';
        c.spendableMilli -= SOLAR.projectWork;
        mustCommit(s, { id: `c05.project.${a.id}`, from: 'solar.supply', input: SOLAR_PROJECT_MASS, outputs: [['solar.capital', SOLAR_PROJECT_MASS]] });
        s.projects[a.id] = 'complete';
        emit({ type: 'sound', id: 'install' });
        emit({ type: 'save', reason: 'project' });
        if (a.id === 'extractionStudy') {
          const [t, x] = beat('05', 2);
          beatNow(s, '05', 2, t, x);
          ask(s, { id: 'c05.star', kind: 'c05/star', checkpoint: true, data: { checkpointLabel: 'Before: the star’s schedule' } });
        }
        bump(s);
        return null;
      }
      case 'c05/seed': {
        if (s.projects.seedFoundry !== 'available' && s.projects.seedFoundry !== 'complete') return 'Seed foundry locked.';
        if (c.seedKits >= SOLAR.seedKits) return 'Three kits are ready.';
        if (c.spendableMilli < SOLAR.seedWork) return 'Requires 30 spendable work.';
        // Every seed reserves its material kit from solar raw before accepting its job.
        if (mass(s, 'solar.supply') < SOLAR.seedKitMass) return 'Missing source material.';
        mustCommit(s, { id: `c05.seed.${c.seedKits + 1}`, from: 'solar.supply', input: SOLAR.seedKitMass, outputs: [['solar.kits', SOLAR.seedKitMass]] });
        c.spendableMilli -= SOLAR.seedWork;
        c.seedKits += 1;
        if (c.seedKits >= SOLAR.seedKits) s.projects.seedFoundry = 'complete';
        emit({ type: 'sound', id: 'install' });
        emit({ type: 'save', reason: 'seed' });
        bump(s);
        return null;
      }
      case 'c05/relocate': {
        if (c.starChoice !== 'relocate' || c.habitatRelocated) return 'Not available.';
        if (c.spendableMilli < SOLAR.relocateWork) return 'Requires 30 spendable work.';
        c.spendableMilli -= SOLAR.relocateWork;
        const from = s.anchors.habitat.originalMassAccount!;
        openAccount(s, 'solar.habitat', 'livingProtected', 'living', 'Living habitat (powered shell)', 'solar', { protected: true, anchor: 'habitat' });
        const acc = s.ledger.accounts[from];
        acc.released = true;
        mustCommit(s, { id: 'c05.relocate', from, input: acc.mass, outputs: [['solar.habitat', acc.mass]], release: true });
        acc.released = false;
        c.habitatRelocated = true;
        const h = s.anchors.habitat;
        h.originalMassAccount = 'solar.habitat';
        h.currentLocation = 'Remote powered shell';
        h.evidence.push('relocated with continuing life support, Act 5');
        const sky = s.anchors.sky;
        sky.fidelity = 'absent';
        sky.currentLocation = 'Replaced by shell lighting';
        sky.evidence.push('stellar extraction began, Act 5');
        log(s, { id: 'loss.sky', kind: 'loss', title: 'Stellar extraction begins', text: 'Residents and life support transferred to the remote shell. The habitat’s sky is now shell lighting. The ten percent deferral is lifted.' });
        emit({ type: 'sound', id: 'dismantle' });
        bump(s);
        return null;
      }
      case 'request':
        if (a.kind === 'charter') {
          if (s.charters.autonomyCharter) return 'Already accepted.';
          if (!hasFired(s)) return 'Not yet offered.';
          ask(s, { id: `c05.charter.${s.seq++}`, kind: 'charter', subject: 'autonomyCharter', checkpoint: true, data: { checkpointLabel: 'Before: autonomy charter' } });
          return null;
        }
        return 'Unknown request';
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind === 'c05/star') {
      c.starChoice = option === 'relocate' ? 'relocate' : 'defer';
      log(s, {
        id: 'c05.star',
        kind: 'system',
        title: c.starChoice === 'defer' ? 'Dismantling deferred' : 'Relocation planned',
        text:
          c.starChoice === 'defer'
            ? 'The star remains over the habitat. Ordinary output ×0.90 while extraction is deferred.'
            : 'Relocation of the habitat to a remote powered shell costs 30 spendable work. Output ×0.90 until it is complete.',
      });
      bump(s);
      return;
    }
    if (choice.kind === 'charter') {
      if (option === 'accept') {
        s.charters.autonomyCharter = true;
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'decline') hold(s, 'protected');
    }
  },

  guard(s) {
    const c = cs(s);
    return (
      c.cumulativeMilli >= SOLAR.thresholds[2] &&
      s.projects.radiators === 'complete' &&
      s.projects.extractionStudy === 'complete' &&
      c.seedKits >= SOLAR.seedKits &&
      s.charters.autonomyCharter
    );
  },
};

function hasFired(s: CampaignState): boolean {
  return s.consumedEventIds.includes('c05.charter');
}
