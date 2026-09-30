import { ENVELOPES, PRESERVATION, beat } from '../../content/campaign';
import { LETTERS } from '../../content/narrative';
import { ANCHOR_LABELS } from '../../content/world';
import { accrue } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C04State, CampaignState, CaseId, CaseState, Treatment } from '../types';

const cs = (s: CampaignState) => s.chapterState as C04State;
const CASES = PRESERVATION.cases as CaseId[];

/** Accounts that make up each case's original. The office excludes the separately tracked photograph. */
export function caseAccounts(s: CampaignState, id: CaseId): string[] {
  switch (id) {
    case 'garden':
      return ['building.garden'];
    case 'square':
    case 'mural':
    case 'correspondence':
      return [`city.${id}`];
    case 'habitat':
      return ['city.habitat'];
    case 'office':
      return ['office.equipment', 'office.cabinet', 'office.lamp', 'office.frame'].filter((a) => mass(s, a) > 0n);
  }
}

export function allowedTreatments(s: CampaignState, id: CaseId): Treatment[] {
  if (id === 'habitat') return ['original', 'relocate'];
  if (id === 'garden' && s.anchors.garden.fidelity === 'absent') return ['absent'];
  return ['original', 'archive', 'reconstruction'];
}

export function overheadOf(t: Treatment | null, id: CaseId): number {
  if (id === 'habitat') return PRESERVATION.overhead.living;
  switch (t) {
    case 'original':
      return PRESERVATION.overhead.original;
    case 'archive':
      return PRESERVATION.overhead.recorded;
    case 'reconstruction':
      return PRESERVATION.overhead.reconstructed;
    default:
      return 0;
  }
}

export function currentOverhead(c: C04State): number {
  return CASES.reduce((sum, id) => sum + (c.cases[id].resolved ? overheadOf(c.cases[id].treatment, id) : 0), 0);
}

export function resolvedCount(c: C04State): number {
  return CASES.filter((id) => c.cases[id].resolved).length;
}

export function slotsInUse(c: C04State): number {
  return CASES.reduce((n, id) => n + (c.cases[id].resolved ? 0 : c.cases[id].slots), 0) + (c.habitatVerified ? 0 : c.habitatSlots);
}

export function activeCases(c: C04State): CaseId[] {
  return CASES.filter((id) => !c.cases[id].resolved && c.cases[id].slots > 0 && c.cases[id].treatment && isLocked(c, id));
}

export const isLocked = (c: C04State, id: CaseId) => c.cases[id].locked;

export function maxConcurrent(s: CampaignState): number {
  return s.projects.parallelReview === 'complete' ? 2 : 1;
}

/** Background industrial surplus narrows as protected support grows. */
export function surplusRate(c: C04State): number {
  return Math.max(0, PRESERVATION.supportCapacity - currentOverhead(c)) * 100; // milli-work/sec
}

function commitTreatment(s: CampaignState, id: CaseId): void {
  const c = cs(s);
  const k = c.cases[id];
  const t = k.treatment!;
  const an = s.anchors[id];
  if (t === 'original') {
    for (const a of caseAccounts(s, id)) s.ledger.accounts[a].protected = true;
    an.protected = true;
    an.evidence.push('retained original, Act 4');
  } else if (t === 'archive' || t === 'reconstruction') {
    const ratio = t === 'archive' ? PRESERVATION.archiveRatio : PRESERVATION.reconstructionRatio;
    const recId = `preservation.${id}.${t === 'archive' ? 'record' : 'reconstruction'}`;
    openAccount(s, recId, 'archiveProtected', t === 'archive' ? 'record' : 'reconstruction', `${ANCHOR_LABELS[id]} (${t === 'archive' ? 'archive' : 'reconstruction'})`, 'preservation', {
      protected: true,
      anchor: id,
    });
    for (const aId of caseAccounts(s, id)) {
      const acc = s.ledger.accounts[aId];
      const input = acc.mass;
      const storage = input / ratio;
      acc.released = true;
      mustCommit(s, {
        id: `c04.${t}.${id}.${aId}`,
        from: aId,
        input,
        outputs: [
          [recId, storage],
          ['preservation.supply', input - storage],
        ],
        release: true,
        irreversible: true,
      });
      acc.protected = false;
      if (id === 'office') {
        const sub = aId.split('.')[1] as 'cabinet' | 'lamp' | 'frame' | 'equipment';
        if (sub !== 'equipment') {
          const a2 = s.anchors[sub];
          a2.fidelity = t === 'archive' ? 'recorded' : 'reconstructed';
          a2.recordMassAccount = recId;
          a2.currentLocation = 'office archive';
        }
      }
    }
    an.fidelity = t === 'archive' ? 'recorded' : 'reconstructed';
    an.recordMassAccount = recId;
    an.currentLocation = 'preservation storage';
    an.protected = true;
    an.evidence.push(`${t} certified, Act 4`);
    log(s, {
      id: `loss.${id}`,
      kind: 'loss',
      title: `${ANCHOR_LABELS[id]}: ${t === 'archive' ? 'recording certified' : 'reconstruction certified'}`,
      text:
        t === 'archive'
          ? 'The original was dismantled. One tenth of its material holds the recording; the rest joined procurement supply.'
          : 'The original was dismantled. One hundredth of its material holds the approximation. Details outside the model were discarded.',
    });
    if (t === 'archive') {
      const [bt, bx] = beat('04', 0);
      beatNow(s, '04', 0, bt, bx);
      s.flags['reflection.photograph'] = true;
    } else {
      const [bt, bx] = beat('04', 1);
      beatNow(s, '04', 1, bt, bx);
    }
    emit({ type: 'sound', id: 'dismantle' });
  } else if (t === 'relocate') {
    // Moves actual residents and functioning life support; living and protection flags are preserved.
    openAccount(s, 'preservation.habitat', 'livingProtected', 'living', 'Living habitat (relocated)', 'preservation', {
      protected: true,
      anchor: 'habitat',
    });
    const acc = s.ledger.accounts['city.habitat'];
    acc.released = true;
    mustCommit(s, { id: 'c04.relocate.habitat', from: 'city.habitat', input: acc.mass, outputs: [['preservation.habitat', acc.mass]], release: true });
    acc.released = false;
    an.currentLocation = 'Habitat ring outside the industrial zone';
    an.originalMassAccount = 'preservation.habitat';
    an.evidence.push('relocated with continuing life support, Act 4');
  } else if (t === 'absent') {
    an.evidence.push('already absent audit outcome, Act 4');
  }
  if (id === 'habitat') {
    an.living = true;
    an.alive = true;
    an.protected = true;
  }
  k.resolved = true;
  k.slots = 0;
  s.flags.protectedSupportCost = currentOverhead(c);
  emit({ type: 'sound', id: 'resolve' });
  emit({ type: 'save', reason: 'case' });
  bump(s);
}

export const c04: Controller = {
  id: '04',
  storyScale: 31_557_600 / 1000, // one story year per simulated second

  enter(s) {
    const cases = Object.fromEntries(
      CASES.map((id) => [id, { id, opened: false, treatment: null, locked: false, slots: 0, workMilli: 0, residue: 0, resolved: false } as CaseState]),
    ) as Record<CaseId, CaseState>;
    if (s.anchors.garden.fidelity === 'absent') cases.garden.treatment = 'absent';
    s.chapterState = {
      kind: '04',
      cases,
      focus: 'garden',
      habitatTender: false,
      habitatSlots: 0,
      habitatVerifyMs: 0,
      habitatVerified: false,
      surplusMilli: 0,
      surplusResidue: 0,
      processedUnits: 0,
    };
    openAccount(s, 'preservation.supply', 'raw', 'feedstock', 'Preservation-era supply', 'preservation');
    mustCommit(s, { id: 'grant.04', from: 'unreached', input: ENVELOPES['04'].grant, outputs: [['preservation.supply', ENVELOPES['04'].grant]] });
    s.flags.protectedSupportCost = 0;
    if (s.projects.witness === 'available') s.projects.witness = 'complete';
  },

  step(s, dt) {
    const c = cs(s);
    const active = activeCases(c).slice(0, maxConcurrent(s));
    for (const id of active) {
      const k = c.cases[id];
      const [g, r] = accrue(k.slots * PRESERVATION.ratePerSlot, dt, k.residue);
      k.residue = r;
      k.workMilli += g;
      if (k.workMilli >= PRESERVATION.verificationWork) {
        k.workMilli = PRESERVATION.verificationWork;
        commitTreatment(s, id);
      }
    }
    if (c.habitatTender && !c.habitatVerified && c.habitatSlots >= PRESERVATION.habitatSlots) {
      c.habitatVerifyMs += dt;
      if (c.habitatVerifyMs >= PRESERVATION.habitatMs) {
        c.habitatVerified = true;
        c.habitatSlots = 0;
        s.projects.habitatAutonomy = 'complete';
        log(s, { id: 'c04.habitat.verified', kind: 'system', title: 'Habitat verified', text: 'Closed-loop services verified. Life support is now allocated automatically before any production.' });
        emit({ type: 'sound', id: 'resolve' });
        bump(s);
      }
    }
    const [g, r] = accrue(surplusRate(c), dt, c.surplusResidue);
    c.surplusResidue = r;
    c.surplusMilli += g;
    const units = Math.floor(c.surplusMilli / 1000);
    while (c.processedUnits < units) {
      c.processedUnits += 1;
      const input = minBig(ENVELOPES['04'].batch, mass(s, 'preservation.supply'));
      if (input <= 0n) break;
      makeClips(s, 'c04.batch', 'preservation.supply', input);
    }
  },

  events(s) {
    const c = cs(s);
    const n = resolvedCount(c);
    if (n >= 3) {
      if (once(s, 'c04.parallel')) {
        s.projects.parallelReview = 'complete';
        c.habitatTender = true;
        log(s, { id: 'c04.parallel', kind: 'system', title: 'Parallel review · habitat tender', text: 'Two cases may now be verified at once within the same ten slots. The habitat tender is open: 4 slots for 30 s verifies closed-loop life support.' });
        bump(s);
      }
    }
    const nonOriginal = CASES.filter((id) => c.cases[id].resolved && (c.cases[id].treatment === 'archive' || c.cases[id].treatment === 'reconstruction')).length;
    if (nonOriginal >= 1 && hasReconstruction(c)) {
      if (once(s, 'c04.witness')) {
        if (s.projects.witness === 'complete') {
          const L = LETTERS.witness;
          log(s, { id: L.id, kind: 'letter', title: L.title, text: L.text, author: L.author, dateline: L.dateline });
        }
        const [bt, bx] = beat('04', 2);
        beatNow(s, '04', 2, bt, bx);
      }
    }
    if (n === CASES.length && c.habitatVerified && !s.charters.interplanetaryCharter && once(s, 'c04.charter')) {
      ask(s, { id: 'c04.charter', kind: 'charter', subject: 'interplanetaryCharter', checkpoint: true, data: { checkpointLabel: 'Before: interplanetary charter' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    switch (a.type) {
      case 'c04/focus':
        c.focus = a.id;
        if (!c.cases[a.id].opened) {
          c.cases[a.id].opened = true;
          emit({ type: 'sound', id: 'open' });
        }
        return null;
      case 'c04/preview': {
        const k = c.cases[a.id];
        if (k.resolved) return 'Already resolved.';
        if (c.cases[a.id].locked) return 'Treatment committed to verification.';
        if (!allowedTreatments(s, a.id).includes(a.treatment)) return 'Not a valid treatment for this case.';
        k.treatment = a.treatment;
        k.opened = true;
        return null;
      }
      case 'c04/slots': {
        const k = c.cases[a.id];
        if (k.resolved) return 'Already resolved.';
        const slots = Math.max(0, Math.min(PRESERVATION.slots, Math.round(a.slots)));
        const others = slotsInUse(c) - k.slots;
        if (others + slots > PRESERVATION.slots) return 'Not enough verification slots.';
        if (slots > 0 && !c.cases[a.id].locked) return 'Commit a treatment first.';
        k.slots = slots;
        return null;
      }
      case 'c04/habitatSlots': {
        if (!c.habitatTender || c.habitatVerified) return 'Not available.';
        const slots = Math.max(0, Math.min(PRESERVATION.slots, Math.round(a.slots)));
        const others = slotsInUse(c) - c.habitatSlots;
        if (others + slots > PRESERVATION.slots) return 'Not enough verification slots.';
        c.habitatSlots = slots;
        return null;
      }
      case 'request': {
        if (a.kind === 'lock') {
          const id = a.subject as CaseId;
          const k = c.cases[id];
          if (!k.treatment || k.resolved || c.cases[id].locked) return 'Choose a treatment.';
          if (k.treatment === 'archive' || k.treatment === 'reconstruction' || k.treatment === 'relocate') {
            ask(s, {
              id: `c04.cert.${id}.${s.seq++}`,
              kind: 'c04/certificate',
              subject: id,
              checkpoint: k.treatment !== 'relocate',
              data: { treatment: k.treatment, checkpointLabel: `Before: ${k.treatment} ${id}` },
            });
            return null;
          }
          lock(s, id);
          return null;
        }
        if (a.kind === 'charter') {
          if (resolvedCount(c) < CASES.length || !c.habitatVerified) return 'Not yet offered.';
          ask(s, { id: `c04.charter.${s.seq++}`, kind: 'charter', subject: 'interplanetaryCharter', checkpoint: true, data: { checkpointLabel: 'Before: interplanetary charter' } });
          return null;
        }
        return 'Unknown request';
      }
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    if (choice.kind === 'c04/certificate') {
      if (option === 'confirm') lock(s, choice.subject as CaseId);
      return;
    }
    if (choice.kind === 'charter') {
      if (option === 'accept') {
        s.charters.interplanetaryCharter = true;
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'decline') hold(s, 'protected');
    }
  },

  guard(s) {
    const c = cs(s);
    return resolvedCount(c) === CASES.length && c.habitatVerified && s.charters.interplanetaryCharter;
  },
};

function hasReconstruction(c: C04State): boolean {
  return CASES.some((id) => c.cases[id].resolved && c.cases[id].treatment === 'reconstruction') || CASES.filter((id) => c.cases[id].resolved && c.cases[id].treatment === 'archive').length >= 2;
}

function lock(s: CampaignState, id: CaseId): void {
  const c = cs(s);
  c.cases[id].locked = true;
  // Assign free slots automatically so the committed case starts verifying.
  const free = PRESERVATION.slots - slotsInUse(c);
  if (c.cases[id].slots === 0 && free > 0) c.cases[id].slots = Math.min(free, id === 'habitat' ? 6 : 5);
  emit({ type: 'sound', id: 'stamp' });
  bump(s);
}
