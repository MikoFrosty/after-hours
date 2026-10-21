import { OFFICE, beat, type OfficeProject } from '../../content/campaign';
import { MARA, NIGHT_EVENTS } from '../../content/narrative';
import { CLIP } from '../mass';
import { commit, mass, mustCommit } from '../ledger';
import { mulMilli } from '../fixed';
import { hasFired, log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C01State, CampaignState, OfficeProjectId } from '../types';

// The night desk: a trial run of 100 loose clips, then one carton of 250, then eleven more cartons.
// Every clip on the desk is both the product and the money: spend it to go faster, or pack it
// before the 5:22 van. Every press of the button makes clips; nine upgrades each roughly double
// what the machines make.

const cs = (s: CampaignState) => s.chapterState as C01State;
const CARTONS = 12;
/** The big order: the eleven cartons after the first. */
export const BIG_ORDER = CARTONS - 1;

export const owns = (c: C01State, id: OfficeProjectId) => c.owned.includes(id);
export const project = (id: OfficeProjectId) => OFFICE.projects.find((p) => p.id === id)!;
/** Clips that have left the desk: the trial run and every sealed carton. */
export const packed = (c: C01State) => c.trialClips + c.sealed * OFFICE.boxSize;

/** Clips on the desk: the only clips that can be spent or packed. */
export function loose(s: CampaignState): number {
  return Math.max(0, Number(s.clips.currentMicrograms / CLIP) - packed(cs(s)));
}

export function wireGrams(s: CampaignState): number {
  return Number(mass(s, 'office.wire') / CLIP);
}

/** Simulated ms since the night began. */
const nightMs = (s: CampaignState) => s.simMs - s.chapterEnteredSimMs;

// ---------- the dust sheet and the orders ----------

/** The clip machine is out from under its sheet (older saves that already own it count as lifted). */
export const uncovered = (c: C01State) => c.sheetLifted || owns(c, 'calibrate');

/** The sheet is noticed once the trial run has been approved: the machine is how a carton's worth gets made. */
export function sheetReady(s: CampaignState): boolean {
  const c = cs(s);
  return !uncovered(c) && c.trial === 'approved' && c.madeClips >= OFFICE.opening.sheetAfterClips && nightMs(s) >= OFFICE.opening.sheetAfterMs;
}

/** Which order the night is on. */
export function act(c: C01State): 'trial' | 'carton' | 'big' | 'done' {
  if (c.capped) return 'done';
  if (c.trial !== 'approved') return 'trial';
  return c.sealed === 0 ? 'carton' : 'big';
}

/** Cartons of the big order packed so far. */
export const bigPacked = (c: C01State) => Math.max(0, c.sealed - 1);

// ---------- what the machines and the hands make ----------

/** Machine output in milli-clips per second for a set of upgrades, without bursts or snags. */
function rateFor(owned: OfficeProjectId[]): number {
  let add = 0;
  let mult = 1000;
  let rack = 0;
  let line = 1000;
  for (const id of owned) {
    const p = OFFICE.projects.find((q) => q.id === id);
    if (!p) continue;
    add += p.addedRate;
    mult = mulMilli(mult, p.multiplier);
    rack += p.rackRate;
    line = mulMilli(line, p.lineMultiplier);
  }
  return mulMilli(mulMilli(add, mult) + rack, line);
}

/** What the machines make in a steady minute: no burst, no snag (milli-clips per second). */
export const steadyRate = (s: CampaignState) => rateFor(cs(s).owned);

export const burstReady = (s: CampaignState) => cs(s).burstReadyUntilMs > s.simMs;
export const burstRunning = (s: CampaignState) => cs(s).burstUntilMs > s.simMs;

/** What the machines are making right now (milli-clips per second). */
export function machineRate(s: CampaignState): number {
  const c = cs(s);
  if (c.jammed || c.capped) return 0;
  const r = steadyRate(s);
  return burstRunning(s) ? mulMilli(r, OFFICE.bursts.multiplier) : r;
}

/** Clips per press of the main button: the hands, plus a second of the machines with the foot pedal. */
export function pressYield(s: CampaignState): number {
  const c = cs(s);
  let hands = OFFICE.handClips;
  let pedal = 0;
  for (const id of c.owned) {
    const p = project(id);
    if (!p) continue;
    hands = Math.max(hands, p.handClips);
    pedal += p.pedalSeconds;
  }
  return hands + Math.floor((machineRate(s) * pedal) / 1000);
}

/** Small clip machines on the side-table rack (0, 3 or 6), for the room and the sound. */
export const rackMachines = (c: C01State) => (owns(c, 'jig') ? 3 : 0) + (owns(c, 'station6') ? 3 : 0);

// ---------- upgrades ----------

export function unlocked(s: CampaignState, p: OfficeProject): boolean {
  const c = cs(s);
  const u = p.unlock;
  // The clip machine is under the dust sheet until it is lifted.
  if (p.id === 'calibrate' && !uncovered(c)) return false;
  if (u.after && !owns(c, u.after)) return false;
  if (u.made !== undefined && c.madeClips < u.made) return false;
  if (u.jams !== undefined && c.jams < u.jams) return false;
  if (u.boxes !== undefined && c.sealed < u.boxes) return false;
  return true;
}

/** An either/or pair is decided once one of them is bought or being installed. */
export function forkTaken(c: C01State, p: OfficeProject): boolean {
  if (!p.exclusive) return false;
  return OFFICE.projects.some((q) => q.exclusive === p.exclusive && q.id !== p.id && (owns(c, q.id) || c.installing?.id === q.id));
}

/** Upgrades on offer now, in order. */
export function offeredProjects(s: CampaignState): OfficeProject[] {
  const c = cs(s);
  return OFFICE.projects.filter((p) => !owns(c, p.id) && unlocked(s, p) && !forkTaken(c, p));
}

export function canStart(s: CampaignState, id: OfficeProjectId): string | null {
  const c = cs(s);
  const p = project(id);
  if (!p) return 'Not available.';
  if (c.capped) return 'The order is complete.';
  if (owns(c, id)) return 'Already bought.';
  if (!unlocked(s, p)) return 'Not available yet.';
  if (forkTaken(c, p)) return 'The other one was chosen.';
  if (c.installing) return `Installing the ${project(c.installing.id).name.toLowerCase()}.`;
  if (loose(s) < p.costClips) return `Needs ${p.costClips} clips on the desk.`;
  return null;
}

/** How much faster the machines would run with this upgrade (milli-clips per second; 0 for hands and utilities). */
export function rateGain(s: CampaignState, p: OfficeProject): number {
  const c = cs(s);
  return rateFor([...c.owned, p.id]) - rateFor(c.owned);
}

/** Simulated seconds until the 5:22 van, or null once it has been. */
export function secondsToVan(s: CampaignState): number | null {
  const c = cs(s);
  if (c.vanCartons !== null) return null;
  const story = OFFICE.vanMinute * 60 - s.storySeconds;
  return Math.max(0, (story * 1000) / OFFICE.storyPerSecond);
}

/** Seconds for an upgrade's extra output to make back its price, or null when it doesn't add machine output. */
export function paybackSeconds(s: CampaignState, p: OfficeProject): number | null {
  const gain = rateGain(s, p);
  if (gain <= 0) return null;
  return (p.costClips * 1000) / gain;
}

/**
 * Cartons of the big order on the 5:22 van if the player stops buying now and packs everything:
 * what is packed, plus what is on the desk and what the machines make before the van.
 */
export function vanForecast(s: CampaignState): number | null {
  const c = cs(s);
  const left = secondsToVan(s);
  if (left === null || c.sealed === 0 || c.capped) return null;
  const clips = loose(s) + (steadyRate(s) * left) / 1000;
  return Math.min(BIG_ORDER, bigPacked(c) + Math.floor(clips / OFFICE.boxSize));
}

/** The upgrade most worth buying next: the best payback among those on offer (or the first, before the big order). */
export function bestUpgrade(s: CampaignState): OfficeProject | null {
  const offered = offeredProjects(s).filter((p) => p.id !== 'tensioner');
  if (offered.length === 0) return null;
  const scored = offered.map((p) => ({ p, t: paybackSeconds(s, p) ?? (p.kind === 'hands' ? p.costClips / 2 : Infinity) }));
  scored.sort((a, b) => a.t - b.t);
  return scored[0].p;
}

/** Whether an upgrade pays for itself before the van (always true before the big order or after the van). */
export function paysBeforeVan(s: CampaignState, p: OfficeProject): boolean {
  const left = secondsToVan(s);
  const t = paybackSeconds(s, p);
  if (left === null || cs(s).sealed === 0 || t === null) return true;
  return t <= left;
}

// ---------- goals ----------

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `${Math.round(sec)} s`;
};
export { fmtTime as fmtPayback };

/** One short line for the order card: the single most useful next step. */
export function nextGoal(s: CampaignState): string {
  const c = cs(s);
  const l = loose(s);
  if (c.capped) return 'Every carton is packed. The machines are off.';
  if (c.madeClips === 0) return 'Press the button to make a clip from the coil of wire.';
  if (c.jammed) return 'The wire snagged and the clip machine stopped. Free it.';
  if (c.trial === 'open') return l >= OFFICE.trial.clips ? 'The trial run is ready. Send it.' : `Make ${OFFICE.trial.clips - l} more clip${OFFICE.trial.clips - l === 1 ? '' : 's'} for the trial run.`;
  if (c.trial === 'sent') return 'Waiting to hear back. Keep making clips: you will need them.';
  if (!uncovered(c)) return 'There is something under a dust sheet on the desk.';
  if (c.installing) return `Installing the ${project(c.installing.id).name.toLowerCase()}…`;
  if (c.sealed === 0) {
    if (!owns(c, 'calibrate')) return l >= 100 ? 'Buy the clip machine: it makes clips while you do other things.' : `Save ${100 - l} more clips for the clip machine.`;
    if (l >= OFFICE.boxSize) return 'You have 250 clips. Pack the carton.';
    const best = bestUpgrade(s);
    if (best && l >= best.costClips) return `You can buy the ${best.name.toLowerCase()} now, or keep filling the carton.`;
    return `Keep making clips: ${OFFICE.boxSize - l} more fill the carton.`;
  }
  const best = bestUpgrade(s);
  if (best && paysBeforeVan(s, best)) {
    const t = paybackSeconds(s, best);
    const pays = t !== null ? ` It pays for itself in ${fmtTime(t)}.` : '';
    if (l >= best.costClips) return `Buy the ${best.name.toLowerCase()}.${pays}`;
    if (l < OFFICE.boxSize || best.costClips - l < OFFICE.boxSize) return `Saving for the ${best.name.toLowerCase()}: ${l} of ${best.costClips}.${pays}`;
  }
  if (l >= OFFICE.boxSize) return 'Pack a carton.';
  if (secondsToVan(s) !== null && best && !paysBeforeVan(s, best)) return `Pack for the van: the ${best.name.toLowerCase()} would not pay back in time.`;
  return `Next carton: ${l} of 250.`;
}

/** A short status for places that need one (the log and debug tools). */
export function officeStatus(s: CampaignState): string {
  const c = cs(s);
  if (c.capped) return 'Order complete';
  if (c.jammed) return 'Wire snagged';
  if (c.trial === 'open') return `Trial run: ${Math.min(loose(s), OFFICE.trial.clips)} of ${OFFICE.trial.clips}`;
  if (c.trial === 'sent') return 'Waiting to hear back';
  if (c.sealed === 0) return 'Filling the first carton';
  return `${bigPacked(c)} of ${BIG_ORDER} cartons`;
}

/** The spare coil can be taken once the inventory has been read, or as soon as wire runs low. */
export function spareOffered(s: CampaignState): boolean {
  const c = cs(s);
  return !c.spareTaken && mass(s, 'office.spare') > 0n && (c.files.inventory === 'read' || wireGrams(s) < 800);
}

/** Clips the building starts with for the cartons that made the early van. */
export const vanBonus = (c: C01State) => (c.vanCartons ?? 0) * OFFICE.vanBonusPerCarton;

// ---------- making clips ----------

/** Make clips from the coil of wire. */
function make(s: CampaignState, n: number): number {
  const c = cs(s);
  const k = Math.min(n, wireGrams(s));
  if (k <= 0) return 0;
  const r = commit(s, { id: 'c01.bend', from: 'office.wire', input: BigInt(k) * CLIP, outputs: [['clips', BigInt(k) * CLIP]], periodic: true });
  if (!r.ok) return 0;
  c.madeClips += k;
  s.clips.lifetimeMadeMicrograms += BigInt(k) * CLIP;
  return k;
}

function sealCarton(s: CampaignState) {
  const c = cs(s);
  c.sealed += 1;
  emit({ type: 'sound', id: 'tape' });
  emit({ type: 'save', reason: 'carton' });
  bump(s);
}

function finishInstall(s: CampaignState, id: OfficeProjectId) {
  const c = cs(s);
  c.installing = null;
  c.owned.push(id);
  if (id === 'calibrate') s.projects.bender = 'complete';
  if (id === 'feeder') {
    s.projects.feeder = 'complete';
    c.jammed = false;
    c.sinceJam = 0;
  }
  if (id === 'jig') s.projects.jig = 'complete';
  emit({ type: 'sound', id: 'install' });
  // The two-note motif marks the night's turning points.
  if (id === 'calibrate' || id === 'feeder' || id === 'jig') emit({ type: 'sound', id: 'motif' });
  if (id === 'station6') emit({ type: 'sound', id: 'fullSpeed' });
  emit({ type: 'save', reason: 'install' });
  bump(s);
}

const jamInterval = (c: C01State) => (owns(c, 'feeder') ? 0 : owns(c, 'tensioner') ? OFFICE.tensionedJamInterval : OFFICE.jamInterval);

export const c01: Controller = {
  id: '01',
  // Story time in the office is driven in step(): the night runs at a steady pace and holds
  // just short of dawn until the last carton is sealed.
  storyScale: 0,

  enter() {
    // The office is created by newCampaign().
  },

  step(s, dt) {
    const c = cs(s);
    const night = OFFICE.nightStorySeconds;
    if (c.capped) {
      const from = Number(s.flags['c01.cappedStory'] ?? night);
      s.storySeconds = Math.min(night, Math.max(s.storySeconds, s.storySeconds + Math.max(1, (night - from) / 50)));
      return;
    }
    const target = Math.min(Math.floor(night * 0.985), Math.floor((nightMs(s) * OFFICE.storyPerSecond) / 1_000_000));
    s.storySeconds = Math.max(s.storySeconds, target);

    if (c.installing) {
      c.installing.ms += dt;
      if (c.installing.ms >= project(c.installing.id).installMs) finishInstall(s, c.installing.id);
    }

    // Speed bursts: once the clip machine runs, now and then the wire runs perfectly straight.
    const B = OFFICE.bursts;
    if (owns(c, 'calibrate')) {
      if (c.nextBurstMs === 0) c.nextBurstMs = s.simMs + B.firstAfterMs;
      if (c.burstReadyUntilMs !== 0 && s.simMs >= c.burstReadyUntilMs) {
        c.burstReadyUntilMs = 0;
        bump(s);
      }
      if (c.burstReadyUntilMs === 0 && !burstRunning(s) && s.simMs >= c.nextBurstMs) {
        c.burstReadyUntilMs = s.simMs + B.windowMs;
        const n = c.burstsCaught * 7 + Math.floor(s.simMs / 1000);
        c.nextBurstMs = c.burstReadyUntilMs + B.runMs + B.everyMs + ((n * 7919) % Math.max(1, B.spreadMs / 1000)) * 1000;
        emit({ type: 'sound', id: 'glint' });
        bump(s);
      }
    }
    if (c.burstUntilMs !== 0 && s.simMs >= c.burstUntilMs) {
      c.burstUntilMs = 0;
      emit({ type: 'sound', id: 'cleanEnd' });
      bump(s);
    }

    const rate = machineRate(s);
    if (rate > 0) {
      // rate (milli-clips/s) × dt (ms) is exactly micro-clips.
      c.rateResidue += rate * dt;
      const whole = Math.floor(c.rateResidue / 1_000_000);
      c.rateResidue -= whole * 1_000_000;
      if (whole > 0) {
        const made = make(s, whole);
        const interval = jamInterval(c);
        if (interval > 0 && made > 0) {
          c.sinceJam += made;
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

    // The trial run's reply: approved, and an order for one carton.
    if (c.trial === 'sent' && s.simMs - c.trialAtMs >= OFFICE.trial.replyMs) {
      c.trial = 'approved';
      emit({ type: 'beat', title: 'Sample approved', text: 'The customer liked the trial run. Next: one carton of 250.' });
      bump(s);
    }
    // The shape under the dust sheet is noticed once: a quiet caption.
    if (sheetReady(s) && once(s, 'c01.sheetNoticed')) {
      emit({ type: 'beat', title: 'On the desk', text: 'Something sits under a dust sheet beside the terminal.' });
      emit({ type: 'sound', id: 'notice' });
      bump(s);
    }
    // The big order arrives with the first carton.
    if (c.sealed >= 1 && !c.capped && once(s, 'c01.bigOrder')) {
      emit({ type: 'beat', title: 'A bigger order', text: 'Eleven more cartons, by morning. A van stops across the street at 5:22.' });
    }

    // The orders arrive the moment they are placed; other files appear one at a time and never two close together.
    const orders: Array<[string, boolean]> = [
      ['order', c.madeClips >= 1],
      ['order2', c.trial === 'approved'],
      ['order3', c.sealed >= 1],
    ];
    for (const [id, ok] of orders) {
      if (ok && !c.files[id]) {
        c.files[id] = 'unread';
        c.lastFileMs = s.simMs;
        emit({ type: 'sound', id: 'file' });
        bump(s);
      }
    }
    const fileRules: Array<[string, boolean]> = [
      ['contract', c.madeClips >= 15],
      ['manual', uncovered(c)],
      ['inventory', owns(c, 'calibrate') && c.madeClips >= 300],
      ['ticket', c.madeClips >= 600],
      ['memo', owns(c, 'feeder')],
    ];
    const due = s.simMs - c.lastFileMs >= OFFICE.opening.fileGapMs ? fileRules.find(([id, ok]) => ok && !c.files[id]) : undefined;
    if (due) {
      c.files[due[0]] = 'unread';
      c.lastFileMs = s.simMs;
      emit({ type: 'sound', id: 'file' });
      bump(s);
    }

    for (const p of offeredProjects(s)) {
      if (once(s, `c01.offer.${p.id}`)) {
        emit({ type: 'sound', id: 'notice' });
        bump(s);
      }
    }

    // Mara's last note arrives when the rack goes in on the side table, beside the photograph.
    if (owns(c, 'jig') && once(s, 'c01.mara.photograph')) {
      log(s, { id: MARA.photograph.id, kind: 'note', title: 'Mara Venn', text: MARA.photograph.text, dateline: MARA.photograph.dateline, author: 'Mara Venn' });
      bump(s);
    }

    const minute = s.storySeconds / 60;
    for (const ev of NIGHT_EVENTS) {
      if (minute >= ev.atMinute && once(s, ev.id)) {
        if (ev.id === 'night.van') {
          // The early van takes the big order's sealed cartons; the rest go on the seven o'clock run.
          c.vanCartons = bigPacked(c);
          s.flags['c01.vanBonus'] = vanBonus(c);
          const rest = BIG_ORDER - c.vanCartons;
          const text =
            c.sealed === 0
              ? 'A delivery van waited across the street, then left. Nothing was ready for it.'
              : rest === 0
                ? `The delivery van took all eleven cartons. The customer adds ${vanBonus(c)} clips for the early delivery.`
                : c.vanCartons === 0
                  ? 'The delivery van waited a minute across the street, then left empty. The order goes on the 7:00 run.'
                  : `The delivery van took ${c.vanCartons} carton${c.vanCartons === 1 ? '' : 's'}, with ${vanBonus(c)} clips added for the early delivery. The other ${rest} go on the 7:00 run.`;
          log(s, { id: ev.id, kind: 'system', title: ev.title, text });
          if (!c.capped) emit({ type: 'beat', title: ev.title, text });
          emit({ type: 'sound', id: 'van' });
          bump(s);
        } else {
          log(s, { id: ev.id, kind: 'system', title: ev.title, text: ev.text });
          if (!c.capped) emit({ type: 'beat', title: ev.title, text: ev.text });
        }
      }
    }

    if (c.sealed >= CARTONS && !c.capped) {
      c.capped = true;
      s.flags['c01.cappedAt'] = s.simMs;
      s.flags['c01.cappedStory'] = s.storySeconds;
      // If the order is done before the van, every carton goes on it.
      if (c.vanCartons === null) {
        c.vanCartons = BIG_ORDER;
        s.flags['c01.vanBonus'] = vanBonus(c);
      }
      c.jammed = false;
      c.installing = null;
      c.burstReadyUntilMs = 0;
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
        if (!make(s, pressYield(s))) return 'There is no wire left on the coil.';
        c.handPresses += 1;
        emit({ type: 'sound', id: 'bend' });
        return null;
      }
      case 'c01/catch': {
        if (!burstReady(s)) return 'The moment has passed.';
        c.burstReadyUntilMs = 0;
        c.burstUntilMs = s.simMs + OFFICE.bursts.runMs;
        c.burstsCaught += 1;
        c.jammed = false;
        emit({ type: 'sound', id: 'catch' });
        bump(s);
        return null;
      }
      case 'c01/sendTrial': {
        if (c.trial !== 'open') return 'The trial run has gone.';
        if (loose(s) < OFFICE.trial.clips) return `The trial run is ${OFFICE.trial.clips} clips.`;
        c.trial = 'sent';
        c.trialAtMs = s.simMs;
        c.trialClips = OFFICE.trial.clips;
        log(s, { id: 'c01.trial', kind: 'system', title: 'Trial run', text: `${OFFICE.trial.clips} clips in an envelope, left at the front desk for the courier.` });
        emit({ type: 'beat', title: 'Trial run sent', text: `${OFFICE.trial.clips} clips in an envelope, left at the front desk for the courier.` });
        emit({ type: 'sound', id: 'tape' });
        emit({ type: 'save', reason: 'carton' });
        bump(s);
        return null;
      }
      case 'c01/lift': {
        if (uncovered(c)) return null;
        if (!sheetReady(s)) return 'Not yet.';
        c.sheetLifted = true;
        log(s, { id: 'c01.sheet', kind: 'system', title: 'Dust sheet', text: 'Under the sheet: a small desktop clip machine, switched off, with its manual tucked under it.' });
        emit({ type: 'sound', id: 'install' });
        bump(s);
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
        if (c.capped || c.sealed >= CARTONS) return 'Every carton is packed.';
        if (c.trial !== 'approved') return 'There is no carton order yet.';
        if (loose(s) < OFFICE.boxSize) return `A carton needs ${OFFICE.boxSize} clips on the desk.`;
        sealCarton(s);
        return null;
      }
      case 'c01/read':
        if (!c.files[a.file]) return 'No such file.';
        c.files[a.file] = 'read';
        return null;
      case 'c01/takeSpare': {
        if (!spareOffered(s)) return 'Not available.';
        const m = mass(s, 'office.spare');
        mustCommit(s, { id: 'c01.spare', from: 'office.spare', input: m, outputs: [['office.wire', m]] });
        c.spareTaken = true;
        log(s, { id: 'c01.spare', kind: 'system', title: 'Spare coil', text: 'The spare coil from the cabinet’s bottom drawer is on the spindle.' });
        emit({ type: 'sound', id: 'install' });
        bump(s);
        return null;
      }
      case 'request': {
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
