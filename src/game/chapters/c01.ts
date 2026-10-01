import { OFFICE, beat, type OfficeProject } from '../../content/campaign';
import { MARA, NIGHT_EVENTS } from '../../content/narrative';
import { CLIP } from '../mass';
import { commit, mass, mustCommit } from '../ledger';
import { mulMilli } from '../fixed';
import { hasFired, log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C01State, CampaignState, LineSpeed, OfficeProjectId } from '../types';

// The night desk: one order of 3,000 clips, packed in twelve cartons of 250.
// Clips spent on machinery have to be made again, so every purchase is a real trade.

const cs = (s: CampaignState) => s.chapterState as C01State;
const CARTONS = OFFICE.quota / OFFICE.boxSize;

export const owns = (c: C01State, id: OfficeProjectId) => c.owned.includes(id);
export const packed = (c: C01State) => c.sealed * OFFICE.boxSize + c.openBox;
export const project = (id: OfficeProjectId) => OFFICE.projects.find((p) => p.id === id)!;

/** Clips on the desk that are not in a carton: the only clips that can be spent. */
export function loose(s: CampaignState): number {
  const c = cs(s);
  return Math.max(0, Number(s.clips.currentMicrograms / CLIP) - packed(c));
}

export function wireGrams(s: CampaignState): number {
  return Number(mass(s, 'office.wire') / CLIP);
}

export function speedOf(c: C01State) {
  return OFFICE.lineSpeeds.find((x) => x.id === c.lineSpeed) ?? OFFICE.lineSpeeds[0];
}

/** Machine output in milli-clips per second (gross, before ruined clips). */
export function machineRate(c: C01State): number {
  if (c.jammed || c.capped) return 0;
  let bender = 0;
  let benderMult = 1000;
  let line = 0;
  for (const id of c.owned) {
    const p = project(id);
    if (p.group === 'bender') {
      bender += p.addedRate;
      benderMult = mulMilli(benderMult, p.multiplier);
    } else if (p.group === 'line') line += p.addedRate;
  }
  const base = mulMilli(bender, benderMult) + line;
  return mulMilli(base, speedOf(c).factor);
}

/** Good clips per second after ruined clips, for display. */
export function goodRate(c: C01State): number {
  const r = machineRate(c);
  return r - Math.floor((r * speedOf(c).rejectPpm) / 1_000_000);
}

export function unlocked(c: C01State, p: OfficeProject): boolean {
  const u = p.unlock;
  if (u.after && !owns(c, u.after)) return false;
  if (u.made !== undefined && c.madeClips < u.made) return false;
  if (u.jams !== undefined && c.jams < u.jams) return false;
  if (u.boxes !== undefined && c.sealed < u.boxes) return false;
  if (u.rejects !== undefined && c.rejects < u.rejects) return false;
  return true;
}

/** Projects that have appeared and are not yet installed, in campaign order. */
export function offeredProjects(s: CampaignState): OfficeProject[] {
  const c = cs(s);
  return OFFICE.projects.filter((p) => !owns(c, p.id) && unlocked(c, p));
}

export function canStart(s: CampaignState, id: OfficeProjectId): string | null {
  const c = cs(s);
  const p = project(id);
  if (c.capped) return 'The order is complete.';
  if (owns(c, id)) return 'Already installed.';
  if (!unlocked(c, p)) return 'Not available yet.';
  if (c.installing) return `Installing ${project(c.installing.id).name.toLowerCase()}.`;
  if (loose(s) < p.costClips) return `Needs ${p.costClips} clips on the desk.`;
  return null;
}

export function salvageAvailable(c: C01State, id: 'cabinet' | 'lamp' | 'frame'): boolean {
  const def = OFFICE.salvage.find((x) => x.id === id)!;
  return !c.salvaged[id] && !c.capped && c.madeClips >= def.threshold;
}

/** The spare coil can be taken once the inventory has been read, or as soon as wire runs low. */
export function spareOffered(s: CampaignState): boolean {
  const c = cs(s);
  return !c.spareTaken && mass(s, 'office.spare') > 0n && (c.files.inventory === 'read' || wireGrams(s) < 600);
}

/** Bend clips from the wire coil. Ruined clips go to the rejects account; nothing is lost. */
function bend(s: CampaignState, n: number, rejectPpm = 0): number {
  const c = cs(s);
  const k = Math.min(n, wireGrams(s));
  if (k <= 0) return 0;
  let bad = 0;
  if (rejectPpm > 0) {
    const total = c.rejectCredit + k * rejectPpm;
    bad = Math.floor(total / 1_000_000);
    c.rejectCredit = total - bad * 1_000_000;
  }
  const good = k - bad;
  const outputs: Array<[string, bigint]> = [['clips', BigInt(good) * CLIP]];
  if (bad > 0) outputs.push(['office.rejects', BigInt(bad) * CLIP]);
  const r = commit(s, { id: 'c01.bend', from: 'office.wire', input: BigInt(k) * CLIP, outputs, periodic: true });
  if (!r.ok) return 0;
  c.madeClips += good;
  c.rejects += bad;
  s.clips.lifetimeMadeMicrograms += BigInt(good) * CLIP;
  routeToCarton(s, good);
  return k;
}

/** The auto-packer sends a share of new clips straight into the open carton. */
function routeToCarton(s: CampaignState, good: number) {
  const c = cs(s);
  if (!owns(c, 'packer') || c.packShare <= 0 || good <= 0) return;
  c.packCredit += good * c.packShare;
  while (c.packCredit >= 100 && c.sealed < CARTONS && loose(s) > 0) {
    c.packCredit -= 100;
    c.openBox += 1;
    if (c.openBox >= OFFICE.boxSize) {
      c.openBox = 0;
      c.sealed += 1;
      emit({ type: 'sound', id: 'tape' });
      bump(s);
    }
  }
  if (c.packCredit >= 100) c.packCredit = 0;
}

function finishInstall(s: CampaignState, id: OfficeProjectId) {
  const c = cs(s);
  c.installing = null;
  c.owned.push(id);
  if (id === 'calibrate') s.projects.bender = 'complete';
  if (id === 'feeder') {
    s.projects.feeder = 'complete';
    c.jammed = false;
    // The routine part of the night can now be accelerated.
    s.flags['c01.pace'] = true;
  }
  if (id === 'jig') s.projects.jig = 'complete';
  emit({ type: 'sound', id: 'install' });
  emit({ type: 'save', reason: 'install' });
  bump(s);
}

export const c01: Controller = {
  id: '01',
  // Story time in the office follows the order's progress, so dawn arrives as it is finished.
  storyScale: 0,

  enter() {
    // The office is created by newCampaign().
  },

  step(s, dt) {
    const c = cs(s);
    // The night's clock: progress through the order sets the hour; time alone moves it slowly.
    const night = OFFICE.nightStorySeconds;
    const progress = Math.min(1, (packed(c) + loose(s)) / OFFICE.quota);
    const elapsed = (s.simMs - s.chapterEnteredSimMs) / 1000;
    const target = c.capped ? night : Math.min(night * 0.97, Math.max(progress * night * 0.97, elapsed * 3));
    s.storySeconds = Math.max(s.storySeconds, target);
    if (c.capped) return;

    if (c.installing) {
      c.installing.ms += dt;
      if (c.installing.ms >= project(c.installing.id).installMs) finishInstall(s, c.installing.id);
    }

    const rate = machineRate(c);
    if (rate > 0) {
      // rate (milli-clips/s) × dt (ms) is exactly micro-clips.
      c.rateResidue += rate * dt;
      const whole = Math.floor(c.rateResidue / 1_000_000);
      c.rateResidue -= whole * 1_000_000;
      if (whole > 0) {
        const made = bend(s, whole, speedOf(c).rejectPpm);
        if (!owns(c, 'feeder') && made > 0) {
          c.sinceJam += made;
          const interval = owns(c, 'tensioner') ? OFFICE.tensionedJamInterval : OFFICE.jamInterval;
          if (c.sinceJam >= interval) {
            c.sinceJam = 0;
            c.jams += 1;
            c.jammed = true;
            c.rateResidue = 0;
            emit({ type: 'sound', id: 'jam' });
            bump(s);
          }
        }
      }
    }

    // The straightener draws ruined clips back into usable wire.
    if (owns(c, 'straightener')) {
      const amount = BigInt(OFFICE.straightenerRate * dt); // µg
      const have = mass(s, 'office.rejects');
      const take = amount < have ? amount : have;
      if (take > 0n) commit(s, { id: 'c01.straighten', from: 'office.rejects', input: take, outputs: [['office.wire', take]], periodic: true });
    }
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
    if (owns(c, 'calibrate')) {
      const [t, x] = beat('01', 1);
      beatNow(s, '01', 1, t, x);
      if (once(s, 'c01.mara.home')) {
        log(s, { id: MARA.home.id, kind: 'note', title: 'Mara Venn', text: MARA.home.text, dateline: MARA.home.dateline, author: 'Mara Venn' });
        bump(s);
      }
    }

    // Terminal files appear as the night goes on.
    const fileRules: Array<[string, boolean]> = [
      ['order', c.madeClips >= 1],
      ['contract', c.madeClips >= 10],
      ['manual', owns(c, 'calibrate')],
      ['inventory', c.madeClips >= 40],
      ['ticket', c.madeClips >= 200],
      ['memo', owns(c, 'feeder')],
    ];
    for (const [id, ok] of fileRules) {
      if (ok && !c.files[id]) {
        c.files[id] = 'unread';
        emit({ type: 'sound', id: 'file' });
        bump(s);
      }
    }

    for (const p of OFFICE.projects) {
      if (!owns(c, p.id) && unlocked(c, p) && once(s, `c01.offer.${p.id}`)) {
        emit({ type: 'sound', id: 'notice' });
        bump(s);
      }
    }

    for (const sv of OFFICE.salvage) {
      if (c.madeClips >= sv.threshold && once(s, `c01.salvageable.${sv.id}`)) {
        if (sv.id === 'frame') {
          log(s, { id: MARA.photograph.id, kind: 'note', title: 'Mara Venn', text: MARA.photograph.text, dateline: MARA.photograph.dateline, author: 'Mara Venn' });
        }
        emit({ type: 'sound', id: 'notice' });
        bump(s);
      }
    }

    const minute = s.storySeconds / 60;
    for (const ev of NIGHT_EVENTS) {
      if (minute >= ev.atMinute && once(s, ev.id)) {
        log(s, { id: ev.id, kind: 'system', title: ev.title, text: ev.text });
      }
    }

    if (c.sealed >= CARTONS && !c.capped) {
      c.capped = true;
      s.flags['c01.cappedAt'] = s.simMs;
      s.storySeconds = Math.max(s.storySeconds, OFFICE.nightStorySeconds);
      c.jammed = false;
      c.openBox = 0;
      c.installing = null;
      const [t, x] = beat('01', 2);
      beatNow(s, '01', 2, t, x);
      emit({ type: 'sound', id: 'orderComplete' });
    }
    // A quiet moment first: the machines have stopped and it is getting light.
    const settled = s.simMs - Number(s.flags['c01.cappedAt'] ?? -Infinity) >= 6000;
    if (c.capped && settled && !s.charters.buildingLease && !hasFired(s, 'c01.report.declined') && once(s, 'c01.report')) {
      c.reportShown = true;
      ask(s, { id: 'c01.report', kind: 'c01/report', checkpoint: true, data: { checkpointLabel: 'Before: building lease' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c01/make': {
        if (c.capped) return 'The order is complete.';
        if (!bend(s, 1)) return 'There is no wire left on the coil.';
        emit({ type: 'sound', id: 'bend' });
        return null;
      }
      case 'c01/project': {
        const err = canStart(s, a.id);
        if (err) return err;
        const p = project(a.id);
        const cost = BigInt(p.costClips) * CLIP;
        mustCommit(s, { id: `c01.project.${a.id}`, from: 'clips', input: cost, outputs: [['office.machines', cost]] });
        c.installing = { id: a.id, ms: 0 };
        emit({ type: 'sound', id: 'startInstall' });
        bump(s);
        return null;
      }
      case 'c01/free':
        if (!c.jammed) return null;
        c.jammed = false;
        emit({ type: 'sound', id: 'free' });
        return null;
      case 'c01/pack': {
        if (c.capped || c.sealed >= CARTONS) return 'All twelve cartons are sealed.';
        if (loose(s) < OFFICE.boxSize) return `A carton needs ${OFFICE.boxSize} clips on the desk.`;
        c.sealed += 1;
        emit({ type: 'sound', id: 'tape' });
        emit({ type: 'save', reason: 'carton' });
        bump(s);
        return null;
      }
      case 'c01/packShare':
        if (!owns(c, 'packer')) return 'Needs the auto-packer.';
        c.packShare = Math.max(0, Math.min(100, Math.round(a.share / 25) * 25));
        return null;
      case 'c01/speed':
        if (!owns(c, 'jig')) return 'Needs the parallel jig.';
        c.lineSpeed = a.speed as LineSpeed;
        emit({ type: 'sound', id: 'switch' });
        return null;
      case 'c01/read':
        if (!c.files[a.file]) return 'No such file.';
        c.files[a.file] = 'read';
        return null;
      case 'c01/takeSpare': {
        if (!spareOffered(s)) return 'Not available.';
        const m = mass(s, 'office.spare');
        mustCommit(s, { id: 'c01.spare', from: 'office.spare', input: m, outputs: [['office.wire', m]] });
        c.spareTaken = true;
        log(s, { id: 'c01.spare', kind: 'system', title: 'Spare coil', text: 'The 2 kg coil from the cabinet’s bottom drawer is on the spindle.' });
        emit({ type: 'sound', id: 'install' });
        bump(s);
        return null;
      }
      case 'request': {
        if (a.kind === 'salvage') {
          const id = a.subject as 'cabinet' | 'lamp' | 'frame';
          if (!salvageAvailable(c, id)) return 'Not available.';
          ask(s, { id: `c01.salvage.${id}`, kind: 'c01/salvage', subject: id, checkpoint: true, data: { checkpointLabel: `Before: salvage ${id}` } });
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
      const clipMass = BigInt(def.yieldClips) * CLIP;
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
      c.madeClips += def.yieldClips;
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
            ? `${def.yieldClips} clips formed. The remaining metal is raw scrap. The photograph is on the desk.`
            : `${def.yieldClips} clips formed. The remaining ${id === 'cabinet' ? '9.925 kg' : '1.85 kg'} is raw scrap.`,
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
    return cs(s).sealed >= CARTONS && s.charters.buildingLease;
  },
};

export { CARTONS };
