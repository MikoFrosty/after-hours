import raw from './campaign.json';
import type { ChapterId, OfficeProjectId, Policy, RegionId } from '../game/types';

/** Parse a decimal number from JSON into integer thousandths without float drift. */
export function milli(value: number | string): number {
  const s = String(value);
  const neg = s.startsWith('-');
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const f = (frac + '000').slice(0, 3);
  const v = Number(int) * 1000 + Number(f);
  return neg ? -v : v;
}

export const big = (s: string | number): bigint => BigInt(s);

const c = raw;

export const CONTENT_VERSION = c.contentVersion as '1.0.0';
export const SCHEMA_VERSION = c.saveSchemaVersion as 2;

/** The playable demo stops after this chapter; the later chapters stay in the build, reachable from the debug menu. */
export const DEMO_ENDS_AFTER = (c as { demo?: { endsAfter: string } }).demo?.endsAfter as ChapterId | undefined;

export const CLOCK = {
  stepMs: c.clock.stepMs,
  speeds: c.clock.speeds,
};

export const WORLD = {
  initial: big(c.world.initialAllocationMicrograms),
  clip: big(c.world.referenceClipMicrograms),
  lossPpm: BigInt(c.world.lossPpm),
  clipOutputPpm: BigInt(c.world.defaultClipOutputPpm),
  terminalMachine: big(c.world.terminalMachineMicrograms),
};

export type { OfficeProjectId } from '../game/types';

export interface OfficeProject {
  id: OfficeProjectId;
  name: string;
  /** One short line: what it does, in the player's terms. */
  short: string;
  /** A sentence or two for the details view. */
  text: string;
  costClips: number;
  installMs: number;
  kind: 'machine' | 'hands' | 'utility';
  /** Added clip-machine rate in milli-clips per second (multiplied by the machine multipliers). */
  addedRate: number;
  /** Multiplier on the clip machine, in thousandths. */
  multiplier: number;
  /** Flat rate from the side-table rack, in milli-clips per second. */
  rackRate: number;
  /** Multiplier on everything the machines make, in thousandths. */
  lineMultiplier: number;
  /** Clips per press of the main button (the highest owned wins). */
  handClips: number;
  /** Each press also gives this many seconds of machine output. */
  pedalSeconds: number;
  /** Either/or upgrades: buying one member of a group removes the other. */
  exclusive?: 'hands';
  unlock: { after?: OfficeProjectId; made?: number; jams?: number; boxes?: number };
}

const office = c.office;
type RawProject = (typeof office.projects)[number] & Partial<Record<'addedRate' | 'multiplier' | 'rackRate' | 'lineMultiplier' | 'handClips' | 'pedalSeconds', number>> & { exclusive?: string };

export const OFFICE = {
  quota: office.quotaClips,
  boxSize: office.boxSize,
  wire: big(office.wireMicrograms),
  spareWire: big(office.spareWireMicrograms),
  nightStorySeconds: office.nightStorySeconds,
  storyPerSecond: milli(office.storySecondsPerSecond),
  vanMinute: office.vanMinute,
  /** Clips the building starts with for each carton of the big order that made the early van. */
  vanBonusPerCarton: office.vanBonusPerCarton,
  handClips: office.hands.perPress,
  jamInterval: office.jam.intervalClips,
  tensionedJamInterval: office.jam.tensionedIntervalClips,
  /** Speed bursts: now and then the wire runs perfectly straight; grabbing it multiplies everything for a while. */
  bursts: {
    firstAfterMs: office.bursts.firstAfterSeconds * 1000,
    everyMs: office.bursts.everySeconds * 1000,
    spreadMs: office.bursts.spreadSeconds * 1000,
    windowMs: office.bursts.windowSeconds * 1000,
    runMs: office.bursts.runSeconds * 1000,
    multiplier: milli(office.bursts.multiplier),
  },
  /** Two late-night events with a real choice: a courier offering a bonus, and the machines running hot. */
  events: {
    courier: {
      atMinute: office.events.courier.atMinute,
      offerMs: office.events.courier.offerSeconds * 1000,
      runMs: office.events.courier.runSeconds * 1000,
      cartons: office.events.courier.cartons,
      bonus: office.events.courier.bonusClips,
    },
    hot: {
      atRate: office.events.hot.atRate * 1000,
      offerMs: office.events.hot.offerSeconds * 1000,
      coolMs: office.events.hot.coolSeconds * 1000,
      stallMs: office.events.hot.stallSeconds * 1000,
    },
  },
  /** The first order is a trial run of loose clips; the carton orders follow once it is approved. */
  trial: { clips: office.trial.clips, replyMs: office.trial.replySeconds * 1000 },
  /** The quiet start: terminal files arrive one at a time. */
  opening: {
    sheetAfterMs: office.opening.sheetAfterSeconds * 1000,
    sheetAfterClips: office.opening.sheetAfterClips,
    fileGapMs: office.opening.fileGapSeconds * 1000,
  },
  projects: office.projects.map((raw): OfficeProject => {
    const p = raw as RawProject;
    return {
      id: p.id as OfficeProjectId,
      name: p.name,
      short: p.short,
      text: p.text,
      costClips: p.costClips,
      installMs: p.installSeconds * 1000,
      kind: p.kind as OfficeProject['kind'],
      addedRate: milli(p.addedRate ?? 0),
      multiplier: milli(p.multiplier ?? 1),
      rackRate: milli(p.rackRate ?? 0),
      lineMultiplier: milli(p.lineMultiplier ?? 1),
      handClips: p.handClips ?? 0,
      pedalSeconds: p.pedalSeconds ?? 0,
      exclusive: p.exclusive as OfficeProject['exclusive'],
      unlock: p.unlock as OfficeProject['unlock'],
    };
  }),
  /** The original office upgrades, kept for importing version 1 office saves. */
  legacyUpgrades: c.office.legacyUpgrades as Array<{ id: 'bender' | 'feeder' | 'jig'; costClips: number; addedRate: number }>,
  salvage: c.office.salvage.map((s) => ({
    id: s.id as 'cabinet' | 'lamp' | 'frame',
    threshold: s.threshold,
    yieldClips: s.yieldClips,
    original: big(s.originalMicrograms),
  })),
};

export type RoomId = 'dock' | 'wireRoom' | 'workshop' | 'shipping';

export interface Room {
  id: RoomId;
  name: string;
  /** What the room does, in plain words. */
  does: string;
  /** Clips a second with no machines bought, and per machine bought, in milli. */
  base: number;
  perLevel: number;
  /** First machine's price in clips, and how much each next one costs more. */
  cost: number;
  costGrowth: number;
  buy: string;
  /** The contract (0-based) that opens this room. */
  opensWith: number;
}

export interface BuildingContract {
  id: string;
  title: string;
  /** Clips the contract asks for. */
  clips: number;
  client: string;
  text: string;
}

const b = c.building;
export const BUILDING = {
  rooms: b.rooms.map((r): Room => ({ ...r, id: r.id as RoomId, base: milli(r.base), perLevel: milli(r.perLevel) })),
  handCoilClips: b.handCoilClips,
  handsPerSecond: b.handsPerSecond,
  wireCapacity: b.wireCapacity,
  shopOpensWith: b.shopOpensWith,
  contractList: b.contracts as BuildingContract[],
  rush: {
    firstAfterContract: b.rush.firstAfterContract,
    everyMs: b.rush.everySeconds * 1000,
    spreadMs: b.rush.spreadSeconds * 1000,
    offerMs: b.rush.offerSeconds * 1000,
    ms: b.rush.seconds * 1000,
    targetFactor: milli(b.rush.targetFactor),
    bonusFactor: milli(b.rush.bonusFactor),
  },
  heat: {
    opensWith: b.heat.opensWith,
    perClip: milli(b.heat.perClip),
    cooling: milli(b.heat.cooling),
    perFan: milli(b.heat.perFan),
    fanCost: b.heat.fanCost,
    fanCostGrowth: b.heat.fanCostGrowth,
    throttleOn: milli(b.heat.throttleOn),
    throttleOff: milli(b.heat.throttleOff),
    throttleFactor: milli(b.heat.throttleFactor),
  },
  route: { opensWith: b.route.opensWith, courtyard: milli(b.route.courtyard), direct: milli(b.route.direct) },
  storyPerMs: (b.storyHoursPerSecond * 3600) / 1000,
};

export const CITY = {
  budget: c.city.powerBudget,
  defaultAlloc: c.city.defaultAllocation as [number, number, number, number],
  demand: c.city.districtDemand as [number, number, number],
  scoreInitial: milli(c.city.scoreInitial),
  gain: milli(c.city.scoreGainPerSecond),
  loss: milli(c.city.scoreLossPerSecond),
  certMin: milli(c.city.certificationMinimum),
  safetyMin: milli(c.city.safetyMinimum),
  exitScore: milli(c.city.exitScore),
  exitStableMs: c.city.exitStableSeconds * 1000,
  reservePerIndustry: milli(c.city.reservePerIndustrySecond),
  milestones: c.city.reserveMilestones.map(milli),
  consultation: milli(c.city.consultationFactor),
};

export const PRESERVATION = {
  cases: c.preservation.cases as Array<'garden' | 'square' | 'mural' | 'correspondence' | 'office' | 'habitat'>,
  slots: c.preservation.slots,
  verificationWork: milli(c.preservation.verificationWork),
  ratePerSlot: milli(c.preservation.ratePerSlot),
  supportCapacity: c.preservation.supportCapacity,
  overhead: c.preservation.overhead as { original: number; recorded: number; reconstructed: number; living: number },
  archiveRatio: BigInt(c.preservation.archiveMassRatio[1]),
  reconstructionRatio: BigInt(c.preservation.reconstructionMassRatio[1]),
  habitatSlots: c.preservation.habitatVerificationSlots,
  habitatMs: c.preservation.habitatVerificationSeconds * 1000,
};

export const SOLAR = {
  slots: c.solar.slots,
  defaultAlloc: c.solar.defaultAllocation,
  collectorPower: milli(c.solar.collectorPower),
  supportPower: milli(c.solar.supportPower),
  overheadPowerFactor: milli(c.solar.overheadPowerFactor),
  workEnergyCost: milli(c.solar.workEnergyCost),
  fabricatorRate: milli(c.solar.fabricatorRate),
  radiatorRate: milli(c.solar.radiatorRate),
  improvedRadiatorRate: milli(c.solar.improvedRadiatorRate),
  thresholds: c.solar.thresholds.map(milli),
  projectWork: milli(c.solar.projectWork),
  seedWork: milli(c.solar.seedWork),
  seedKits: c.solar.seedKitsRequired,
  seedKitMass: big(c.solar.seedKitMicrograms),
  deferFactor: milli(c.solar.deferStarFactor),
  relocateWork: milli(c.solar.relocateHabitatWork),
};

export const REMOTE = {
  regions: c.remote.regions as RegionId[],
  edges: c.remote.edges.map((e) => ({
    id: `${e.from}-${e.to}`,
    from: e.from as RegionId,
    to: e.to as RegionId,
    delayMs: e.delaySeconds * 1000,
  })),
  policyRates: {
    steward: milli(c.remote.policyRates.steward),
    balanced: milli(c.remote.policyRates.balanced),
    extractor: milli(c.remote.policyRates.extractor),
  } as Record<Policy, number>,
  surveyMs: c.remote.surveySeconds * 1000,
  travelMultiplier: c.remote.travelDelayMultiplier,
  receiptMultiplier: c.remote.initialReceiptDelayMultiplier,
  seedBuildWork: milli(c.remote.seedBuildWork),
  forkRegion: c.remote.forkRegion as RegionId,
  recoverWork: milli(10),
};

export const COSMIC = {
  cells: c.cosmic.cells,
  slots: c.cosmic.slots,
  coverageTarget: milli(c.cosmic.coverageTarget),
  surveyRate: milli(c.cosmic.surveyRatePerSlot),
  recoveryTarget: c.cosmic.recoveryTarget,
  recoveryRate: milli(c.cosmic.recoveryRatePerSlot),
  exotic: c.cosmic.exoticCells,
  topologyAfter: c.cosmic.topologyAfterSurveyedCells,
  couplingAfter: c.cosmic.couplingAfterSurveyedCells,
  projectWork: milli(c.cosmic.projectWork),
};

export const TERMINAL = {
  chargeMs: c.terminal.chargeSeconds * 1000,
  reserve: milli(c.terminal.energyReserve),
  passive: milli(c.terminal.passiveMechanismEnergy),
  sequenceMs: c.terminal.sequenceSeconds * 1000,
  tasks: c.terminal.tasks.map((t) => ({
    id: t.id as 'relays' | 'archive' | 'sensors' | 'main_compute' | 'controller',
    atMs: t.atSeconds * 1000,
    energy: milli(t.energyCost),
    sharePpm: BigInt(t.capitalSharePpm),
    dependsOn: t.dependsOn as string | null,
  })),
};

export const ENVELOPES: Record<string, { grant: bigint; batch: bigint }> = Object.fromEntries(
  c.sourceEnvelopes.map((e) => [e.chapter, { grant: big(e.grantCeilingMicrograms), batch: big(e.workBatchMicrograms) }]),
);

export interface ChapterMeta {
  id: ChapterId;
  title: string;
  verb: string;
  targetMinutes: string;
  exitGuardDescription: string;
  beats: Array<[string, string]>;
}

export const CHAPTER_META: Record<ChapterId, ChapterMeta> = Object.fromEntries(
  c.chapters.map((ch) => [
    ch.id,
    {
      id: ch.id as ChapterId,
      title: ch.title,
      verb: ch.verb,
      targetMinutes: ch.targetMinutes,
      exitGuardDescription: ch.exitGuardDescription,
      beats: ch.initialBeats as Array<[string, string]>,
    },
  ]),
) as Record<ChapterId, ChapterMeta>;

export function beat(chapter: ChapterId, index: number): [string, string] {
  return CHAPTER_META[chapter].beats[index];
}
