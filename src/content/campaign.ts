import raw from './campaign.json';
import type { ChapterId, Policy, RegionId } from '../game/types';

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

export type OfficeProjectId =
  | 'calibrate'
  | 'oil'
  | 'tensioner'
  | 'feeder'
  | 'die2'
  | 'packer'
  | 'roller'
  | 'fan'
  | 'jig'
  | 'head1'
  | 'head2'
  | 'head3'
  | 'straightener';

export interface OfficeProject {
  id: OfficeProjectId;
  name: string;
  costClips: number;
  installMs: number;
  group: 'bender' | 'line' | 'none';
  /** Added machine rate in milli-clips per second. */
  addedRate: number;
  /** Multiplier on the bender group, in thousandths. */
  multiplier: number;
  unlock: { after?: OfficeProjectId; made?: number; jams?: number; boxes?: number; rejects?: number };
}

export type LineSpeed = 'steady' | 'brisk' | 'hard';

export const OFFICE = {
  quota: c.office.quotaClips,
  boxSize: c.office.boxSize,
  wire: big(c.office.wireMicrograms),
  spareWire: big(c.office.spareWireMicrograms),
  nightStorySeconds: c.office.nightStorySeconds,
  jamInterval: c.office.jam.intervalClips,
  tensionedJamInterval: c.office.jam.tensionedIntervalClips,
  lineSpeeds: c.office.lineSpeeds.map((x) => ({ id: x.id as LineSpeed, factor: milli(x.factor), rejectPpm: x.rejectPpm })),
  straightenerRate: milli(c.office.straightenerGramsPerSecond),
  projects: c.office.projects.map(
    (p): OfficeProject => ({
      id: p.id as OfficeProjectId,
      name: p.name,
      costClips: p.costClips,
      installMs: p.installSeconds * 1000,
      group: p.group as OfficeProject['group'],
      addedRate: milli((p as { addedRate?: number }).addedRate ?? 0),
      multiplier: milli((p as { multiplier?: number }).multiplier ?? 1),
      unlock: p.unlock as OfficeProject['unlock'],
    }),
  ),
  /** The original office upgrades, kept for importing version 1 office saves. */
  legacyUpgrades: c.office.legacyUpgrades as Array<{ id: 'bender' | 'feeder' | 'jig'; costClips: number; addedRate: number }>,
  salvage: c.office.salvage.map((s) => ({
    id: s.id as 'cabinet' | 'lamp' | 'frame',
    threshold: s.threshold,
    yieldClips: s.yieldClips,
    original: big(s.originalMicrograms),
  })),
};

export const BUILDING = {
  stations: {
    dock: milli(c.building.stations.dock),
    drawing: milli(c.building.stations.drawing),
    bender: milli(c.building.stations.bender),
    dispatch: milli(c.building.stations.dispatch),
  },
  routes: {
    courtyard: milli(c.building.routeFactors.courtyard),
    direct: milli(c.building.routeFactors.direct),
  },
  contracts: c.building.contracts.map(milli),
  heat: {
    gainPerWork: milli(c.building.heat.gainPerWork),
    cooling: milli(c.building.heat.coolingPerSecond),
    improvedCooling: milli(c.building.heat.improvedCooling),
    throttleOn: milli(c.building.heat.throttleOn),
    throttleOff: milli(c.building.heat.throttleOff),
    throttleFactor: milli(c.building.heat.throttleFactor),
  },
  upgradedDrawing: milli(4),
  upgradedDispatch: milli(4),
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
