import { CONTENT_VERSION, SCHEMA_VERSION, WORLD } from '../content/campaign';
import { OFFICE_ACCOUNTS } from '../content/world';
import { acct, createLedger, mustCommit } from './ledger';
import type {
  AnchorId,
  C01State,
  AnchorState,
  CampaignState,
  ChapterId,
  CharterId,
  LogEntry,
  PendingChoice,
  ProjectId,
  RegionId,
  RegionState,
} from './types';
import { REGIONS } from './types';

const CHARTER_IDS: CharterId[] = [
  'buildingLease',
  'maintenanceCharter',
  'cityTender',
  'reserveMandate',
  'interplanetaryCharter',
  'autonomyCharter',
  'skySurvey',
  'totality',
  'finalSchedule',
];

const PROJECT_IDS: ProjectId[] = [
  'bender',
  'feeder',
  'jig',
  'wireDraw',
  'freight',
  'roofCooling',
  'heatReuse',
  'transit',
  'safeguards',
  'parallelReview',
  'witness',
  'habitatAutonomy',
  'radiators',
  'extractionStudy',
  'seedFoundry',
  'commandQueue',
  'topology',
  'coupling',
  'terminalAudit',
  'terminalReserve',
  'precommit',
];

const ANCHOR_IDS: AnchorId[] = [
  'cabinet',
  'lamp',
  'frame',
  'photograph',
  'garden',
  'square',
  'mural',
  'correspondence',
  'office',
  'habitat',
  'sky',
  'cworld',
];

function anchor(id: AnchorId, loc: string, account: string | null, extra: Partial<AnchorState> = {}): AnchorState {
  return {
    id,
    fidelity: 'original',
    originalLocation: loc,
    currentLocation: loc,
    originalMassAccount: account,
    recordMassAccount: null,
    living: false,
    alive: false,
    protected: false,
    released: false,
    evidence: [],
    ...extra,
  };
}

export function emptyRegion(id: RegionId): RegionState {
  return {
    id,
    settled: false,
    settledAtMs: null,
    policy: null,
    policyVersion: 0,
    localWorkMilli: 0,
    cumulativeMilli: 0,
    residue: 0,
    processedUnits: 0,
    kits: 0,
    worldProtected: false,
    orders: [],
    surveyedEdges: [],
    initialReceipt: false,
    known: { settled: false, policy: null, policyVersion: 0, localWorkMilli: 0, kits: 0, asOfMs: null, protected: false },
  };
}

export function newOfficeState(): C01State {
  return {
    kind: '01',
    madeClips: 0,
    rateResidue: 0,
    owned: [],
    installing: null,
    jammed: false,
    sinceJam: 0,
    jams: 0,
    sealed: 0,
    openBox: 0,
    reserve: 100,
    vanCartons: null,
    lineSpeed: 'steady',
    rejectCredit: 0,
    rejects: 0,
    straightenResidue: 0,
    spareTaken: false,
    tending: 0,
    handBends: 0,
    nextGlintMs: 0,
    glintUntilMs: 0,
    cleanRunUntilMs: 0,
    glintsCaught: 0,
    tuneLevel: 0,
    tuneAttempts: 0,
    tuneCooldownUntilMs: 0,
    lastTune: null,
    wearMs: 0,
    slowTuneMs: null,
    files: {},
    salvaged: { cabinet: false, lamp: false, frame: false },
    capped: false,
    reportShown: false,
  };
}

/** A fresh campaign at 11:47 PM in the office. */
export function newCampaign(): CampaignState {
  const s: CampaignState = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    revision: 0,
    chapter: '01',
    mode: 'playing',
    simMs: 0,
    activePlayMs: 0,
    chapterEnteredSimMs: 0,
    chapterEnteredPlayMs: 0,
    chapterState: newOfficeState(),
    ledger: createLedger(WORLD.initial),
    clips: { currentMicrograms: 0n, lifetimeMadeMicrograms: 0n },
    anchors: {} as Record<AnchorId, AnchorState>,
    charters: Object.fromEntries(CHARTER_IDS.map((c) => [c, false])) as Record<CharterId, boolean>,
    projects: Object.fromEntries(PROJECT_IDS.map((p) => [p, 'locked'])) as Record<ProjectId, 'locked'>,
    regions: Object.fromEntries(REGIONS.map((r) => [r, emptyRegion(r)])) as Record<RegionId, RegionState>,
    messages: [],
    consumedEventIds: [],
    checkpointId: null,
    terminalStep: 0,
    choices: [],
    log: [],
    summaries: {},
    flags: {},
    ending: null,
    storySeconds: 0,
    seq: 0,
  };

  // Starting office entries, split out of the unreached allocation.
  const A = s.ledger.accounts;
  A['office.wire'] = acct('office.wire', 'raw', 'feedstock', 0n, 'Wire coil', 'office');
  A['office.cabinet'] = acct('office.cabinet', 'archiveProtected', 'original', 0n, 'Filing cabinet', 'office', {
    protected: true,
    anchor: 'cabinet',
  });
  A['office.lamp'] = acct('office.lamp', 'archiveProtected', 'original', 0n, 'Desk lamp', 'office', {
    protected: true,
    anchor: 'lamp',
  });
  A['office.frame'] = acct('office.frame', 'archiveProtected', 'original', 0n, 'Picture frame', 'office', {
    protected: true,
    anchor: 'frame',
  });
  A['office.photograph'] = acct('office.photograph', 'archiveProtected', 'original', 0n, 'Photograph', 'office', {
    protected: true,
    anchor: 'photograph',
  });
  A['office.equipment'] = acct('office.equipment', 'capital', 'machine', 0n, 'Office equipment', 'office', {
    anchor: 'office',
  });
  A['office.scrap'] = acct('office.scrap', 'raw', 'scrap', 0n, 'Office scrap', 'office');
  A['office.spare'] = acct('office.spare', 'raw', 'feedstock', 0n, 'Spare wire coil (cabinet, bottom drawer)', 'office');
  A['office.rejects'] = acct('office.rejects', 'raw', 'scrap', 0n, 'Ruined clips', 'office');
  A['office.machines'] = acct('office.machines', 'capital', 'machine', 0n, 'Installed bending machines', 'office');

  mustCommit(s, {
    id: 'genesis.office',
    from: 'unreached',
    input:
      OFFICE_ACCOUNTS.wire +
      OFFICE_ACCOUNTS.spare +
      OFFICE_ACCOUNTS.cabinet +
      OFFICE_ACCOUNTS.lamp +
      OFFICE_ACCOUNTS.frame +
      OFFICE_ACCOUNTS.photograph +
      OFFICE_ACCOUNTS.equipment,
    outputs: [
      ['office.wire', OFFICE_ACCOUNTS.wire],
      ['office.spare', OFFICE_ACCOUNTS.spare],
      ['office.cabinet', OFFICE_ACCOUNTS.cabinet],
      ['office.lamp', OFFICE_ACCOUNTS.lamp],
      ['office.frame', OFFICE_ACCOUNTS.frame],
      ['office.photograph', OFFICE_ACCOUNTS.photograph],
      ['office.equipment', OFFICE_ACCOUNTS.equipment],
    ],
  });

  for (const id of ANCHOR_IDS) {
    s.anchors[id] = anchor(id, 'office', null);
  }
  s.anchors.cabinet = anchor('cabinet', 'office', 'office.cabinet', { protected: true });
  s.anchors.lamp = anchor('lamp', 'office', 'office.lamp', { protected: true });
  s.anchors.frame = anchor('frame', 'office', 'office.frame', { protected: true });
  s.anchors.photograph = anchor('photograph', 'office', 'office.photograph', { protected: true });
  s.anchors.office = anchor('office', 'office', 'office.equipment');
  // Places that do not exist in the ledger yet are recorded as absent until their chapter discloses them.
  for (const id of ['garden', 'square', 'mural', 'correspondence', 'habitat', 'sky', 'cworld'] as AnchorId[]) {
    s.anchors[id] = anchor(id, '—', null, { fidelity: 'absent' });
    s.anchors[id].evidence.push('undisclosed');
  }
  return s;
}

// ---------- small state helpers shared by chapter controllers ----------

export function once(s: CampaignState, id: string): boolean {
  if (s.consumedEventIds.includes(id)) return false;
  s.consumedEventIds.push(id);
  return true;
}

export function hasFired(s: CampaignState, id: string): boolean {
  return s.consumedEventIds.includes(id);
}

export function nextId(s: CampaignState, prefix: string): string {
  s.seq += 1;
  return `${prefix}.${s.seq}`;
}

export function log(s: CampaignState, entry: Omit<LogEntry, 'chapter' | 'simMs'> & { chapter?: ChapterId }): void {
  if (s.log.some((l) => l.id === entry.id)) return;
  s.log.push({ chapter: s.chapter, simMs: s.simMs, ...entry });
}

export function enqueueChoice(s: CampaignState, choice: PendingChoice): void {
  if (s.choices.some((c) => c.id === choice.id)) return;
  s.choices.push(choice);
  s.mode = 'choice';
}

export function resolveChoice(s: CampaignState, id: string): PendingChoice | undefined {
  const i = s.choices.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  const [c] = s.choices.splice(i, 1);
  if (s.choices.length === 0 && s.mode === 'choice') s.mode = 'playing';
  return c;
}
