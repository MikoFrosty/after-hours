import { OFFICE, beat } from '../../content/campaign';
import { MARA } from '../../content/narrative';
import { CLIP } from '../mass';
import { commit, mass, mustCommit } from '../ledger';
import { hasFired, log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C01State, CampaignState } from '../types';

const cs = (s: CampaignState) => s.chapterState as C01State;

export const UPGRADE_ORDER = ['bender', 'feeder', 'jig'] as const;

export function autoRate(c: C01State): number {
  let r = 0;
  for (const u of OFFICE.upgrades) if (c.upgrades[u.id]) r += u.addedRate;
  return r;
}

function remainingQuota(c: C01State): number {
  return Math.max(0, OFFICE.quota - c.madeClips);
}

/** Bend n clips from the wire coil. Zero-loss simplification for phase 1. */
function bend(s: CampaignState, n: number): number {
  const c = cs(s);
  const wireClips = Number(mass(s, 'office.wire') / CLIP);
  const k = Math.min(n, remainingQuota(c), wireClips);
  if (k <= 0) return 0;
  const m = BigInt(k) * CLIP;
  const r = commit(s, { id: 'c01.bend', from: 'office.wire', input: m, outputs: [['clips', m]], periodic: true });
  if (!r.ok) return 0;
  c.madeClips += k;
  s.clips.lifetimeMadeMicrograms += m;
  return k;
}

export function salvageAvailable(c: C01State, id: 'cabinet' | 'lamp' | 'frame'): boolean {
  const def = OFFICE.salvage.find((x) => x.id === id)!;
  return !c.salvaged[id] && !c.capped && c.madeClips >= def.threshold;
}

export function canBuy(s: CampaignState, id: 'bender' | 'feeder' | 'jig'): boolean {
  const c = cs(s);
  const i = UPGRADE_ORDER.indexOf(id);
  if (c.upgrades[id]) return false;
  if (i > 0 && !c.upgrades[UPGRADE_ORDER[i - 1]]) return false;
  const cost = OFFICE.upgrades[i].costClips;
  return s.clips.currentMicrograms >= BigInt(cost) * CLIP && !c.capped;
}

export const c01: Controller = {
  id: '01',
  storyScale: 60 / 1000, // one story minute per simulated second

  enter() {
    // The office is created by newCampaign().
  },

  step(s, dt) {
    const c = cs(s);
    if (c.capped) return;
    // rateResidue holds milli-clips; integer clips/sec × ms = milli-clips exactly.
    c.rateResidue += autoRate(c) * dt;
    const whole = Math.floor(c.rateResidue / 1000);
    c.rateResidue -= whole * 1000;
    if (whole > 0) bend(s, whole);
  },

  events(s) {
    const c = cs(s);
    if (once(s, 'c01.mara.wire')) {
      log(s, { id: MARA.wire.id, kind: 'note', title: 'Mara Venn', text: MARA.wire.text, dateline: MARA.wire.dateline, author: 'Mara Venn' });
    }
    if (c.madeClips >= 1) {
      const [t, x] = beat('01', 0);
      beatNow(s, '01', 0, t, x);
    }
    if (c.upgrades.bender) {
      const [t, x] = beat('01', 1);
      beatNow(s, '01', 1, t, x);
      if (once(s, 'c01.mara.home')) {
        log(s, { id: MARA.home.id, kind: 'note', title: 'Mara Venn', text: MARA.home.text, dateline: MARA.home.dateline, author: 'Mara Venn' });
        bump(s);
      }
    }
    for (const sv of OFFICE.salvage) {
      if (c.madeClips >= sv.threshold && once(s, `c01.salvageable.${sv.id}`)) {
        if (sv.id === 'frame') {
          log(s, {
            id: MARA.photograph.id,
            kind: 'note',
            title: 'Mara Venn',
            text: MARA.photograph.text,
            dateline: MARA.photograph.dateline,
            author: 'Mara Venn',
          });
        }
        emit({ type: 'sound', id: 'notice' });
        bump(s);
      }
    }
    if (c.madeClips >= OFFICE.quota && !c.capped) {
      c.capped = true;
      const [t, x] = beat('01', 2);
      beatNow(s, '01', 2, t, x);
    }
    if (c.capped && !s.charters.buildingLease && !hasFired(s, 'c01.report.declined') && once(s, 'c01.report')) {
      c.reportShown = true;
      ask(s, { id: 'c01.report', kind: 'c01/report', checkpoint: true, data: { checkpointLabel: 'Before: building lease' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c01/make': {
        if (c.capped) return 'The order is complete.';
        const made = bend(s, 1);
        if (!made) return 'No wire.';
        emit({ type: 'sound', id: 'relay' });
        return null;
      }
      case 'c01/buy': {
        if (!canBuy(s, a.id)) return 'Not available.';
        const cost = BigInt(OFFICE.upgrades[UPGRADE_ORDER.indexOf(a.id)].costClips) * CLIP;
        mustCommit(s, { id: `c01.buy.${a.id}`, from: 'clips', input: cost, outputs: [['office.machines', cost]] });
        c.upgrades[a.id] = true;
        s.projects[a.id] = 'complete';
        emit({ type: 'sound', id: 'install' });
        emit({ type: 'save', reason: 'purchase' });
        bump(s);
        return null;
      }
      case 'request': {
        if (a.kind === 'salvage') {
          const id = a.subject as 'cabinet' | 'lamp' | 'frame';
          if (!salvageAvailable(c, id)) return 'Not available.';
          ask(s, {
            id: `c01.salvage.${id}`,
            kind: 'c01/salvage',
            subject: id,
            checkpoint: true,
            data: { checkpointLabel: `Before: salvage ${id}` },
          });
          return null;
        }
        if (a.kind === 'report') {
          if (!c.capped || s.charters.buildingLease) return 'Not available.';
          ask(s, { id: `c01.report.${s.seq++}`, kind: 'c01/report', checkpoint: true, data: { checkpointLabel: 'Before: building lease' } });
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
    if (choice.kind === 'c01/salvage') {
      const id = choice.subject as 'cabinet' | 'lamp' | 'frame';
      if (option !== 'confirm' || !salvageAvailable(c, id)) return;
      const def = OFFICE.salvage.find((x) => x.id === id)!;
      const acc = s.ledger.accounts[`office.${id}`];
      const yieldClips = Math.min(def.yieldClips, remainingQuota(c));
      const clipMass = BigInt(yieldClips) * CLIP;
      acc.released = true;
      mustCommit(s, {
        id: `c01.salvage.${id}`,
        from: acc.id,
        input: acc.mass,
        outputs: [
          ['clips', clipMass],
          ['office.scrap', acc.mass - clipMass],
        ],
        release: true,
        irreversible: true,
      });
      acc.protected = false;
      c.salvaged[id] = true;
      c.madeClips += yieldClips;
      s.clips.lifetimeMadeMicrograms += clipMass;
      const an = s.anchors[id];
      an.fidelity = 'absent';
      an.protected = false;
      an.released = true;
      an.currentLocation = 'office scrap';
      an.evidence.push(`salvaged at ${c.madeClips} clips`);
      log(s, {
        id: `loss.${id}`,
        kind: 'loss',
        title: `${id[0].toUpperCase()}${id.slice(1)} salvaged`,
        text:
          id === 'frame'
            ? `${yieldClips} clips formed. The remaining metal is raw scrap. The photograph is on the desk.`
            : `${yieldClips} clips formed. The remaining ${id === 'cabinet' ? '9.925 kg' : '1.85 kg'} is raw scrap.`,
      });
      emit({ type: 'sound', id: id === 'lamp' ? 'lampOff' : 'salvage' });
      bump(s);
      return;
    }
    if (choice.kind === 'c01/report') {
      if (option === 'accept') {
        s.charters.buildingLease = true;
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'decline') {
        once(s, 'c01.report.declined');
        const n = Object.values(c.salvaged).filter(Boolean).length;
        hold(s, 'office', n === 0 ? 'kept' : n === 3 ? 'salvaged' : 'partial');
      }
    }
  },

  guard(s) {
    return cs(s).madeClips >= OFFICE.quota && s.charters.buildingLease;
  },
};
