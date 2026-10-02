import { BUILDING, ENVELOPES, beat, type Room, type RoomId } from '../../content/campaign';
import { GARDEN_MASS } from '../../content/world';
import { clamp, mulMilli } from '../fixed';
import { commit, makeClips, mustCommit, openAccount } from '../ledger';
import { CLIP } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C02State, CampaignState } from '../types';
import { clearable, salvageOfficeItem, type OfficeItem } from '../officeSalvage';

// The building. The rule is the one the night taught at a bigger size: make clips, spend clips on
// machines, make clips faster. The line runs at the speed of its slowest room, so the question each
// time is where the next machine should go. Everything opens one contract at a time.

const cs = (s: CampaignState) => s.chapterState as C02State;

export const ROOMS = BUILDING.rooms;
export const CONTRACTS = BUILDING.contractList;
export const LAST = CONTRACTS.length;
export const room = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

export const currentContract = (c: C02State) => CONTRACTS[Math.min(c.contractIndex, LAST - 1)];
export const allDelivered = (c: C02State) => c.contractIndex >= LAST;

/** What has opened so far. */
export const roomOpen = (c: C02State, r: Room | RoomId) => c.contractIndex >= (typeof r === 'string' ? room(r) : r).opensWith;
export const openRooms = (c: C02State) => ROOMS.filter((r) => roomOpen(c, r));
export const shopOpen = (c: C02State) => c.contractIndex >= BUILDING.shopOpensWith;
export const heatOpen = (c: C02State) => c.contractIndex >= BUILDING.heat.opensWith;
export const routeOpen = (c: C02State) => c.contractIndex >= BUILDING.route.opensWith;
export const rushOpen = (c: C02State) => c.contractIndex >= BUILDING.rush.firstAfterContract;

export const routeFactor = (c: C02State) => (!routeOpen(c) || c.route === 'direct' ? BUILDING.route.direct : BUILDING.route.courtyard);

/** A room's speed in milli-clips per second. The dock is slowed by the courtyard route; the workshop by heat. */
export function roomRate(c: C02State, r: Room | RoomId): number {
  const def = typeof r === 'string' ? room(r) : r;
  let rate = def.base + def.perLevel * c.levels[def.id];
  if (def.id === 'dock') rate = mulMilli(rate, routeFactor(c));
  if (def.id === 'workshop' && c.throttled) rate = mulMilli(rate, BUILDING.heat.throttleFactor);
  return rate;
}

/** The slowest open room after the dock (the dock is fed by hand as well, so it is judged separately). */
export function slowestRoom(c: C02State): Room {
  let best: Room | null = null;
  for (const r of openRooms(c)) {
    if (r.id === 'dock' && c.levels.dock === 0) continue;
    if (!best || roomRate(c, r) < roomRate(c, best)) best = r;
  }
  return best ?? room('workshop');
}

/** The dock hands can't keep up with the rooms after them (true from the start, before anyone is hired). */
export function dockBehind(c: C02State): boolean {
  return roomRate(c, 'dock') < lineRate(c);
}

/** How fast the rooms after the dock can turn wire into shipped clips (milli-clips per second). */
export function lineRate(c: C02State): number {
  return Math.min(...openRooms(c).filter((r) => r.id !== 'dock').map((r) => roomRate(c, r)));
}

export function price(c: C02State, id: RoomId | 'fan'): number {
  if (id === 'fan') return Math.round(BUILDING.heat.fanCost * Math.pow(BUILDING.heat.fanCostGrowth, c.levels.fans));
  const r = room(id);
  return Math.round(r.cost * Math.pow(r.costGrowth, c.levels[id]));
}

export function heatGain(c: C02State): number {
  // Heat per second at the workshop's current pace (milli).
  return mulMilli(Math.min(lineRate(c), roomRate(c, 'workshop')), BUILDING.heat.perClip);
}
export const cooling = (c: C02State) => BUILDING.heat.cooling + BUILDING.heat.perFan * c.levels.fans;

export function newBuildingState(simMs: number): C02State {
  return {
    kind: '02',
    contractIndex: 0,
    contractClips: 0,
    totalClips: 0,
    stock: 0,
    wire: 0,
    levels: { dock: 0, wireRoom: 0, workshop: 0, shipping: 0, fans: 0 },
    hands: BUILDING.handsPerSecond,
    residue: 0,
    running: true,
    heatMilli: 0,
    throttled: false,
    route: 'courtyard',
    directBuilt: false,
    rush: null,
    nextRushMs: 0,
    rushesWon: 0,
    rate: 0,
    contractStartMs: simMs,
  };
}

/** Make whole clips from the supply; they count toward the contract and go into stock. */
function make(s: CampaignState, n: number) {
  const c = cs(s);
  if (n <= 0 || allDelivered(c)) return;
  makeClips(s, 'c02.make', 'building.supply', BigInt(n) * CLIP);
  c.stock += n;
  c.contractClips += n;
  c.totalClips += n;
  c.madeThisStep = (c.madeThisStep ?? 0) + n;
  if (c.rush?.taken) c.rush.made += n;
  if (c.contractClips >= currentContract(c).clips) completeContract(s);
}

function completeContract(s: CampaignState) {
  const c = cs(s);
  const done = CONTRACTS[c.contractIndex];
  c.contractIndex += 1;
  c.contractClips = 0;
  c.contractStartMs = s.simMs;
  c.rush = null;
  emit({ type: 'sound', id: 'contract' });
  log(s, { id: `c02.done.${done.id}`, kind: 'system', title: `Delivered · ${done.title}`, text: `${done.clips.toLocaleString('en-US')} clips for ${done.client}.` });
  if (c.contractIndex === 1) {
    // The first delivery: the line that ends the night's story.
    const [t, x] = beat('02', 0);
    beatNow(s, '02', 0, t, x);
    // The old office is cleared now; one question about what comes down in the lift.
    ask(s, { id: 'c02.office', kind: 'c02/office', checkpoint: false });
  }
  if (!allDelivered(c)) startContract(s);
  emit({ type: 'save', reason: 'contract' });
  bump(s);
}

/** The next contract: what it brings, once, as a caption and in the log. */
function startContract(s: CampaignState) {
  const c = cs(s);
  const k = CONTRACTS[c.contractIndex];
  if (!once(s, `c02.start.${k.id}`)) return;
  log(s, { id: `c02.start.${k.id}`, kind: 'system', title: `Contract ${c.contractIndex + 1} · ${k.title}`, text: k.text });
  emit({ type: 'beat', title: `Contract ${c.contractIndex + 1} · ${k.title}`, text: k.text });
  emit({ type: 'sound', id: 'notice' });
  if (rushOpen(c) && c.nextRushMs === 0) c.nextRushMs = s.simMs + 40_000;
}

/** What the building needs from the player right now, in one sentence. */
export function buildingGoal(s: CampaignState): string {
  const c = cs(s);
  if (allDelivered(c)) return 'Every contract delivered.';
  if (!c.running) return 'Production is stopped. Start it again once the workshop has cooled.';
  if (c.throttled) return 'The workshop overheated and slowed to a quarter speed until it cools to 50. A fan stops it happening again.';
  if (c.levels.dock === 0) {
    if (c.contractIndex === 0) return c.wire > 0 ? 'The clip machines are running. Keep unloading wire to keep them busy.' : 'Unload a coil of wire from the truck.';
    return 'Spend clips to hire a dock hand, so the wire unloads itself.';
  }
  if (c.rush && !c.rush.taken) return 'A rush order is on the phone: take it for a bonus.';
  if (heatOpen(c) && c.heatMilli >= 60_000 && heatGain(c) > cooling(c)) return `The workshop is getting hot (${Math.round(c.heatMilli / 1000)}). At 80 it slows right down. A fan, or a short stop, keeps it cool.`;
  const slow = slowestRoom(c);
  const dockShort = roomRate(c, 'dock') < lineRate(c) && c.wire < BUILDING.handCoilClips;
  if (dockShort) return `The rooms are waiting for wire. Hire another dock hand${routeOpen(c) && c.route === 'courtyard' ? ' (the courtyard route slows them)' : ''}.`;
  if (shopOpen(c) && c.stock >= price(c, slow.id)) return `${slow.name} is the slowest room. ${slow.buy.toLowerCase()} there (${price(c, slow.id)} clips).`;
  return `${slow.name} is the slowest room, so it sets the pace. Save for its next machine: ${c.stock} of ${price(c, slow.id)} clips.`;
}

export const c02: Controller = {
  id: '02',
  storyScale: BUILDING.storyPerMs, // six story hours per simulated second

  enter(s) {
    s.chapterState = newBuildingState(s.simMs);
    const env = ENVELOPES['02'];
    openAccount(s, 'building.supply', 'raw', 'feedstock', 'Building wire supply', 'building');
    openAccount(s, 'building.machines', 'capital', 'machine', 'Machines in the building', 'building');
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
    log(s, {
      id: 'c02.intro',
      kind: 'system',
      title: 'The building',
      text: 'A ground-floor workshop and a loading dock. More of the building opens with each contract. Wire is bought from a finite disclosed supply.',
    });
    startContract(s);
  },

  step(s, dt) {
    const c = cs(s);
    c.madeThisStep = 0;
    c.hands = Math.min(BUILDING.handsPerSecond, c.hands + (BUILDING.handsPerSecond * dt) / 1000);
    if (!allDelivered(c)) {
      // The dock brings wire in; the rest of the line turns it into clips at the pace of its slowest room.
      c.wire = Math.min(BUILDING.wireCapacity, c.wire + (roomRate(c, 'dock') * dt) / 1_000_000);
      if (c.running) {
        c.residue += lineRate(c) * dt; // micro-clips
        const want = Math.floor(c.residue / 1_000_000);
        const n = Math.min(want, Math.floor(c.wire));
        c.residue -= want * 1_000_000;
        if (n < want) c.residue = 0; // the line waited for wire
        c.wire -= n;
        // An overheated workshop runs at a quarter speed and adds no heat, so it always recovers.
        if (heatOpen(c) && !c.throttled) c.heatMilli = clamp(c.heatMilli + n * BUILDING.heat.perClip, 0, 100_000);
        make(s, n);
      }
    }
    // The workshop cools all the time; heat only matters once the long run starts.
    c.heatMilli = clamp(c.heatMilli - Math.floor((cooling(c) * dt) / 1000), 0, 100_000);
    if (!c.throttled && c.heatMilli >= BUILDING.heat.throttleOn) {
      c.throttled = true;
      emit({ type: 'sound', id: 'throttle' });
      log(s, { id: `c02.throttle.${s.simMs}`, kind: 'system', title: 'Workshop overheated', text: 'Heat 80. The clip machines slow to a quarter speed until it cools to 50.' });
      bump(s);
    } else if (c.throttled && c.heatMilli <= BUILDING.heat.throttleOff) {
      c.throttled = false;
      emit({ type: 'sound', id: 'recover' });
      bump(s);
    }
    // Rush orders: offered now and then; taken ones pay a bonus if met in time.
    if (rushOpen(c) && !allDelivered(c)) {
      if (!c.rush && c.nextRushMs > 0 && s.simMs >= c.nextRushMs) {
        const rate = Math.max(c.rate, lineRate(c) / 2);
        const target = Math.max(50, Math.round(((rate * BUILDING.rush.ms) / 1_000_000) * (BUILDING.rush.targetFactor / 1000) / 10) * 10);
        c.rush = { target, made: 0, bonus: Math.round((target * BUILDING.rush.bonusFactor) / 1000 / 10) * 10, untilMs: s.simMs + BUILDING.rush.offerMs, taken: false };
        emit({ type: 'sound', id: 'phone' });
        bump(s);
      } else if (c.rush && !c.rush.taken && s.simMs >= c.rush.untilMs) {
        c.rush = null;
        scheduleRush(s);
      } else if (c.rush?.taken) {
        if (c.rush.made >= c.rush.target) {
          const bonus = c.rush.bonus;
          makeClips(s, 'c02.rush', 'building.supply', BigInt(bonus) * CLIP);
          c.stock += bonus;
          c.rushesWon += 1;
          log(s, { id: `c02.rush.${s.simMs}`, kind: 'system', title: 'Rush order delivered', text: `${c.rush.target} clips in time. The client sends ${bonus} clips' worth of wire as thanks.` });
          emit({ type: 'sound', id: 'catch' });
          c.rush = null;
          scheduleRush(s);
          bump(s);
        } else if (s.simMs >= c.rush.untilMs) {
          log(s, { id: `c02.rushlate.${s.simMs}`, kind: 'system', title: 'Rush order missed', text: 'The rush order went to someone else. Nothing is lost.' });
          emit({ type: 'sound', id: 'cleanEnd' });
          c.rush = null;
          scheduleRush(s);
          bump(s);
        }
      }
    }
    const inst = ((c.madeThisStep ?? 0) * 1_000_000) / dt;
    c.rate = Math.floor(c.rate * 0.95 + inst * 0.05);
  },

  events(s) {
    const c = cs(s);
    if (allDelivered(c) && !s.charters.maintenanceCharter && once(s, 'c02.maintenance')) {
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
      case 'c02/unload': {
        if (allDelivered(c)) return 'Every contract is delivered.';
        // Presses faster than two a second are simply absorbed.
        if (c.hands < 1) return null;
        if (c.wire + BUILDING.handCoilClips > BUILDING.wireCapacity) return 'The dock is full of wire already.';
        c.hands -= 1;
        c.wire += BUILDING.handCoilClips;
        emit({ type: 'sound', id: 'unload' });
        return null;
      }
      case 'c02/buy': {
        if (!shopOpen(c)) return 'Nothing to buy yet.';
        if (a.room === 'fan') {
          if (!heatOpen(c)) return 'The workshop does not need fans yet.';
        } else if (!roomOpen(c, a.room)) return 'That room is not open yet.';
        const cost = price(c, a.room);
        if (c.stock < cost) return `Needs ${cost} clips.`;
        const r = commit(s, { id: `c02.buy.${a.room}.${s.seq++}`, from: 'clips', input: BigInt(cost) * CLIP, outputs: [['building.machines', BigInt(cost) * CLIP]] });
        if (!r.ok) return 'Not enough clips.';
        c.stock -= cost;
        c.levels[a.room === 'fan' ? 'fans' : a.room] += 1;
        emit({ type: 'sound', id: 'install' });
        bump(s);
        return null;
      }
      case 'c02/rush':
        if (!c.rush || c.rush.taken) return 'No rush order on offer.';
        c.rush.taken = true;
        c.rush.made = 0;
        c.rush.untilMs = s.simMs + BUILDING.rush.ms;
        emit({ type: 'sound', id: 'switch' });
        return null;
      case 'c02/run':
        c.running = a.running;
        emit({ type: 'sound', id: a.running ? 'start' : 'stop' });
        return null;
      case 'c02/route':
        if (a.route === 'direct' && !c.directBuilt) return 'The direct route has not been built.';
        c.route = a.route;
        emit({ type: 'sound', id: 'switch' });
        return null;
      case 'request':
        if (a.kind === 'keepOffice' || a.kind === 'reviewOffice') {
          s.flags['c02.officeKept'] = a.kind === 'keepOffice';
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
          if (!routeOpen(c)) return 'The street entrance is still open.';
          ask(s, { id: 'c02.clearGarden', kind: 'c02/clearGarden', subject: 'garden', checkpoint: true, data: { checkpointLabel: 'Before: clear the garden' } });
          return null;
        }
        if (a.kind === 'charter') {
          const id = a.subject as 'maintenanceCharter' | 'cityTender';
          if (s.charters[id]) return 'Already accepted.';
          if (id === 'maintenanceCharter' && !allDelivered(c)) return 'Not yet offered.';
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
    if (choice.kind === 'c02/office') {
      s.flags['c02.officeKept'] = option !== 'choose';
      if (option !== 'choose') log(s, { id: 'c02.officeKept', kind: 'system', title: 'The 11th floor', text: 'The old office comes down in the lift as it was: cabinet, lamp and frame with it.' });
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
      log(s, { id: 'loss.garden', kind: 'loss', title: 'Night garden cleared', text: 'Fourteen beds, two linden trees and a bench removed. 2 t of material joined the building supply. Trucks drive straight across.' });
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
    return allDelivered(cs(s)) && s.charters.maintenanceCharter && s.charters.cityTender;
  },
};

function scheduleRush(s: CampaignState) {
  const c = cs(s);
  const n = c.rushesWon + Math.floor(s.simMs / 1000);
  c.nextRushMs = s.simMs + BUILDING.rush.everyMs + ((n * 7919) % (BUILDING.rush.spreadMs / 1000)) * 1000;
}

/** Debug: finish the current contract at once (the clips are made from the supply as usual). */
export function debugFinishContract(s: CampaignState) {
  const c = cs(s);
  if (allDelivered(c)) return;
  make(s, currentContract(c).clips - c.contractClips);
}

/** Debug: clips on hand, made from the supply. */
export function debugGrant(s: CampaignState, n: number) {
  const c = cs(s);
  makeClips(s, 'c02.debug', 'building.supply', BigInt(n) * CLIP);
  c.stock += n;
}

