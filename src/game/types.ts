// Core domain types for After Hours.
// Mass is always an integer number of micrograms held in a BigInt.
// Work, heat, scores and energy are fixed-point integers in thousandths ("milli").

export type ChapterId = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08';
export const CHAPTERS: ChapterId[] = ['01', '02', '03', '04', '05', '06', '07', '08'];

export type Fidelity = 'original' | 'recorded' | 'reconstructed' | 'absent';
export type Policy = 'steward' | 'balanced' | 'extractor';
export type Mass = bigint;
export type Mode = 'playing' | 'choice' | 'holding' | 'terminal' | 'ended';

export type Category =
  | 'unreached'
  | 'raw'
  | 'inTransit'
  | 'capital'
  | 'livingProtected'
  | 'archiveProtected'
  | 'clips'
  | 'radiatedEquivalent';

export const CATEGORIES: Category[] = [
  'unreached',
  'raw',
  'inTransit',
  'capital',
  'livingProtected',
  'archiveProtected',
  'clips',
  'radiatedEquivalent',
];

/** Sub-kind lets the terminal audit enumerate originals, records and living reserves separately. */
export type AccountKind =
  | 'universe'
  | 'feedstock'
  | 'scrap'
  | 'original'
  | 'record'
  | 'reconstruction'
  | 'living'
  | 'machine'
  | 'kit'
  | 'cell'
  | 'terminal'
  | 'stock'
  | 'radiation';

export interface Account {
  id: string;
  cat: Category;
  kind: AccountKind;
  mass: Mass;
  label: string;
  /** Owning place: office, building, city, solar, origin, A..E, cosmic, universe. */
  region: string;
  /** Protected accounts cannot be debited without an explicit release. */
  protected: boolean;
  released: boolean;
  anchor?: AnchorId;
}

export interface MatterLedger {
  initial: Mass;
  accounts: Record<string, Account>;
  /** IDs of committed discrete transactions (deduplication on replay/reload). */
  committed: string[];
  txCount: number;
}

export interface Transaction {
  id: string;
  from: string;
  input: Mass;
  outputs: Array<[string, Mass]>;
  charter?: CharterId;
  irreversible?: boolean;
  /** Allows debiting a protected account whose release flag is set. */
  release?: boolean;
  /** Periodic production transactions are deterministic per step and are not stored for dedupe. */
  periodic?: boolean;
  note?: string;
}

export type AnchorId =
  | 'cabinet'
  | 'lamp'
  | 'frame'
  | 'photograph'
  | 'garden'
  | 'square'
  | 'mural'
  | 'correspondence'
  | 'office'
  | 'habitat'
  | 'sky'
  | 'cworld';

export interface AnchorState {
  id: AnchorId;
  fidelity: Fidelity;
  originalLocation: string;
  currentLocation: string;
  originalMassAccount: string | null;
  recordMassAccount: string | null;
  living: boolean;
  /** For living anchors: residents alive. Recorded fidelity never makes a thing alive. */
  alive: boolean;
  protected: boolean;
  released: boolean;
  evidence: string[];
}

export type CharterId =
  | 'buildingLease'
  | 'maintenanceCharter'
  | 'cityTender'
  | 'reserveMandate'
  | 'interplanetaryCharter'
  | 'autonomyCharter'
  | 'skySurvey'
  | 'totality'
  | 'finalSchedule';

export type ProjectId =
  | 'bender'
  | 'feeder'
  | 'jig'
  | 'wireDraw'
  | 'freight'
  | 'roofCooling'
  | 'heatReuse'
  | 'transit'
  | 'safeguards'
  | 'parallelReview'
  | 'witness'
  | 'habitatAutonomy'
  | 'radiators'
  | 'extractionStudy'
  | 'seedFoundry'
  | 'commandQueue'
  | 'topology'
  | 'coupling'
  | 'terminalAudit'
  | 'terminalReserve'
  | 'precommit';

export type ProjectStatus = 'locked' | 'available' | 'complete';

export type RegionId = 'origin' | 'A' | 'B' | 'C' | 'D' | 'E';
export const REGIONS: RegionId[] = ['origin', 'A', 'B', 'C', 'D', 'E'];

export interface RegionKnowledge {
  settled: boolean;
  policy: Policy | null;
  policyVersion: number;
  localWorkMilli: number;
  kits: number;
  asOfMs: number | null;
  protected: boolean;
}

export interface RegionState {
  id: RegionId;
  /** Authoritative simulation state. The UI must show `known` instead. */
  settled: boolean;
  settledAtMs: number | null;
  policy: Policy | null;
  policyVersion: number;
  localWorkMilli: number;
  /** Cumulative local work (never spent), used to schedule material batches. */
  cumulativeMilli: number;
  residue: number;
  processedUnits: number;
  kits: number;
  worldProtected: boolean;
  /** Standing orders received and not yet executed, in arrival order. */
  orders: RegionOrder[];
  surveyedEdges: string[];
  initialReceipt: boolean;
  known: RegionKnowledge;
}

export interface RegionOrder {
  id: string;
  kind: 'expand' | 'recover';
  edge?: string;
  target?: RegionId;
  policy?: Policy;
  stage: 'queued' | 'surveying' | 'awaitingWork' | 'done' | 'failed';
  surveyMs: number;
}

export type MessageKind =
  | 'command'
  | 'seedArrival'
  | 'receipt'
  | 'report'
  | 'revision'
  | 'revisionConfirm'
  | 'fork'
  | 'amendment'
  | 'amendmentReceipt'
  | 'failure'
  | 'kitReturn'
  | 'launchReport';

export interface ScheduledMessage {
  id: string;
  kind: MessageKind;
  from: RegionId;
  to: RegionId;
  sentAtMs: number;
  deliverAtMs: number;
  policy?: Policy;
  policyVersion?: number;
  orderId?: string;
  edge?: string;
  target?: RegionId;
  snapshot?: RegionKnowledge;
  text?: string;
}

export interface LogEntry {
  id: string;
  chapter: ChapterId;
  simMs: number;
  kind: 'beat' | 'note' | 'report' | 'system' | 'letter' | 'loss';
  title: string;
  text: string;
  /** Out-of-world date line for saved messages. */
  dateline?: string;
  author?: string;
}

export interface PendingChoice {
  id: string;
  kind: string;
  subject?: string;
  /** Irreversible and charter choices create a predecision checkpoint. */
  checkpoint: boolean;
  data?: Record<string, string | number | boolean>;
}

export interface ChapterSummary {
  chapter: ChapterId;
  activePlayMs: number;
  simMs: number;
  notes: string[];
}

export interface EndingState {
  kind: 'office' | 'building' | 'city' | 'protected' | 'totality';
  chapter: ChapterId;
  variant?: string;
}

// ---------- Chapter state variants ----------

export interface C01State {
  kind: '01';
  madeClips: number;
  rateResidue: number;
  upgrades: { bender: boolean; feeder: boolean; jig: boolean };
  salvaged: { cabinet: boolean; lamp: boolean; frame: boolean };
  capped: boolean;
  reportShown: boolean;
}

export interface C02State {
  kind: '02';
  route: 'courtyard' | 'direct';
  directBuilt: boolean;
  running: boolean;
  heatMilli: number;
  heatResidue: number;
  throttled: boolean;
  contractIndex: number; // 0..3
  contractWorkMilli: number;
  cumulativeWorkMilli: number;
  workResidue: number;
  processedUnits: number;
  permits: number;
  upgrades: { wireDraw: boolean; freight: boolean; roofCooling: boolean };
  awaitingInspection: boolean;
}

export interface C03State {
  kind: '03';
  alloc: [number, number, number, number];
  demand: [number, number, number];
  scoresMilli: [number, number, number];
  scoreResidue: [number, number, number];
  reserveMilli: number;
  reserveResidue: number;
  processedUnits: number;
  stableMs: number;
  permits: number;
  permitsAwarded: number;
  reducedDistricts: number[];
  safeguards: boolean;
  safetyThrottle: boolean;
  consultation: 'retained' | 'streamlined' | null;
  saturated: boolean;
}

export type CaseId = 'garden' | 'square' | 'mural' | 'correspondence' | 'office' | 'habitat';
export type Treatment = 'original' | 'archive' | 'reconstruction' | 'relocate' | 'absent';

export interface CaseState {
  id: CaseId;
  opened: boolean;
  treatment: Treatment | null;
  /** Treatment committed to verification (after any named confirmation). */
  locked: boolean;
  slots: number;
  workMilli: number;
  residue: number;
  resolved: boolean;
}

export interface C04State {
  kind: '04';
  cases: Record<CaseId, CaseState>;
  focus: CaseId;
  habitatTender: boolean;
  habitatSlots: number;
  habitatVerifyMs: number;
  habitatVerified: boolean;
  surplusMilli: number;
  surplusResidue: number;
  processedUnits: number;
}

export interface C05State {
  kind: '05';
  alloc: { collector: number; fabricator: number; radiator: number; support: number };
  cumulativeMilli: number;
  spendableMilli: number;
  residue: number;
  processedUnits: number;
  seedKits: number;
  starChoice: 'defer' | 'relocate' | null;
  habitatRelocated: boolean;
}

export interface C06State {
  kind: '06';
  focus: RegionId;
  failureAuthored: boolean;
  nextReportMs: number;
  forkReceived: boolean;
  forkResolution: 'ratify' | 'supersede' | null;
  forkResolved: boolean;
  amendmentSent: boolean;
}

export interface CellState {
  index: number;
  account: string;
  startMass: Mass;
  coverageMilli: number;
  covResidue: number;
  surveySlots: number;
  recoverySlots: number;
  recoveredUnits: number;
  recResidue: number;
  recoveryMilli: number;
  exotic: boolean;
}

export interface C07State {
  kind: '07';
  cells: CellState[];
  surveyWorkMilli: number;
  recoveryWorkMilli: number;
  auditRun: boolean;
  releaseDecisions: Record<string, 'keep' | 'release' | 'pending'>;
  livingReview: string | null;
}

export type TerminalTaskId = 'relays' | 'archive' | 'sensors' | 'main_compute' | 'controller';

export interface C08State {
  kind: '08';
  chargeMilli: number;
  chargeMs: number;
  charging: boolean;
  scheduleValidated: boolean;
  committed: boolean;
  sequenceMs: number;
  tasksDone: TerminalTaskId[];
  finalLineShown: boolean;
  exteriorShown: boolean;
}

export type ChapterState = C01State | C02State | C03State | C04State | C05State | C06State | C07State | C08State;

export interface CampaignState {
  schemaVersion: 2;
  contentVersion: '1.0.0';
  revision: number;
  chapter: ChapterId;
  mode: Mode;
  simMs: number;
  activePlayMs: number;
  chapterEnteredSimMs: number;
  chapterEnteredPlayMs: number;
  chapterState: ChapterState;
  ledger: MatterLedger;
  clips: { currentMicrograms: Mass; lifetimeMadeMicrograms: Mass };
  anchors: Record<AnchorId, AnchorState>;
  charters: Record<CharterId, boolean>;
  projects: Record<ProjectId, ProjectStatus>;
  regions: Record<RegionId, RegionState>;
  messages: ScheduledMessage[];
  consumedEventIds: string[];
  checkpointId: string | null;
  terminalStep: number;
  // --- additions documented in docs/DESIGN-NOTES.md ---
  choices: PendingChoice[];
  log: LogEntry[];
  summaries: Partial<Record<ChapterId, ChapterSummary>>;
  flags: Record<string, boolean | number | string>;
  ending: EndingState | null;
  /** Story seconds elapsed since 11:47 PM on the first night (presentation only). */
  storySeconds: number;
  seq: number;
}

export type Action =
  | { type: 'choose'; choiceId: string; option: string }
  | { type: 'request'; kind: string; subject?: string; data?: Record<string, string | number | boolean> }
  | { type: 'c01/make' }
  | { type: 'c01/buy'; id: 'bender' | 'feeder' | 'jig' }
  | { type: 'c02/run'; running: boolean }
  | { type: 'c02/route'; route: 'courtyard' | 'direct' }
  | { type: 'c02/upgrade'; id: 'wireDraw' | 'freight' | 'roofCooling' }
  | { type: 'c02/resume' }
  | { type: 'c03/shift'; from: number; to: number }
  | { type: 'c03/project'; id: 'heatReuse' | 'transit'; district: number }
  | { type: 'c03/safeguards'; on: boolean }
  | { type: 'c04/focus'; id: CaseId }
  | { type: 'c04/preview'; id: CaseId; treatment: Treatment }
  | { type: 'c04/slots'; id: CaseId; slots: number }
  | { type: 'c04/habitatSlots'; slots: number }
  | { type: 'c05/shift'; from: keyof C05State['alloc']; to: keyof C05State['alloc'] }
  | { type: 'c05/project'; id: 'radiators' | 'extractionStudy' }
  | { type: 'c05/seed' }
  | { type: 'c05/relocate' }
  | { type: 'c06/focus'; region: RegionId }
  | { type: 'c06/expand'; from: RegionId; target: RegionId; policy: Policy }
  | { type: 'c06/revise'; region: RegionId; policy: Policy }
  | { type: 'c06/recover'; region: RegionId }
  | { type: 'c07/slots'; cell: number; role: 'survey' | 'recovery'; delta: number }
  | { type: 'c07/project'; id: 'topology' | 'coupling' | 'terminalAudit' }
  | { type: 'c07/decide'; account: string; decision: 'keep' | 'release' }
  | { type: 'c08/charge' }
  | { type: 'c08/validate' };
