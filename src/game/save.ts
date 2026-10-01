import { CONTENT_VERSION, OFFICE, SCHEMA_VERSION } from '../content/campaign';
import { checkInvariant, mustCommit } from './ledger';
import { CLIP } from './mass';
import { newCampaign, newOfficeState } from './state';
import type { C01State, CampaignState } from './types';
import { CHAPTERS } from './types';

export const SAVE_KEY = 'after-hours.campaign.v2';
export const PREV_KEY = 'after-hours.campaign.v2.prev';
export const CHECKPOINT_KEY = 'after-hours.checkpoints.v2';
export const SETTINGS_KEY = 'after-hours.settings';
export const V1_KEY = 'after-hours.v1';

// ---------- serialization: BigInt as tagged decimal strings ----------

export function serialize(s: CampaignState): string {
  return JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? { $big: v.toString() } : v));
}

export function deserialize(text: string): unknown {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$big === 'string' && Object.keys(v).length === 1) {
      if (!/^-?\d+$/.test(v.$big)) throw new Error('Corrupt integer');
      return BigInt(v.$big);
    }
    return v;
  });
}

export function clone(s: CampaignState): CampaignState {
  return deserialize(serialize(s)) as CampaignState;
}

// ---------- validation ----------

export interface Validation {
  ok: boolean;
  errors: string[];
  futureVersion?: boolean;
}

const MODES = ['playing', 'choice', 'holding', 'terminal', 'ended'];

export function validate(raw: unknown): Validation {
  const errors: string[] = [];
  const s = raw as CampaignState;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['Not a save file.'] };
  if (typeof s.schemaVersion === 'number' && s.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [`Save schema ${s.schemaVersion} is newer than this game (${SCHEMA_VERSION}).`], futureVersion: true };
  }
  if (s.schemaVersion !== SCHEMA_VERSION) errors.push('Unknown schema version.');
  if (s.contentVersion !== CONTENT_VERSION) errors.push('Content version mismatch.');
  if (!CHAPTERS.includes(s.chapter)) errors.push('Unknown chapter.');
  if (!MODES.includes(s.mode)) errors.push('Unknown mode.');
  for (const t of [s.simMs, s.activePlayMs, s.revision]) {
    if (!Number.isSafeInteger(t) || t < 0) errors.push('Invalid time or revision.');
  }
  if (!s.ledger || typeof s.ledger.initial !== 'bigint') errors.push('Missing ledger.');
  if (s.chapterState?.kind !== s.chapter) errors.push('Chapter state does not match chapter.');
  if (errors.length) return { ok: false, errors };
  for (const a of Object.values(s.ledger.accounts)) {
    if (typeof a.mass !== 'bigint') errors.push(`Account ${a.id} has a non-integer mass.`);
  }
  if (new Set(s.ledger.committed).size !== s.ledger.committed.length) errors.push('Duplicate transaction IDs.');
  if (new Set(s.messages.map((m) => m.id)).size !== s.messages.length) errors.push('Duplicate message IDs.');
  for (const m of s.messages) if (!Number.isSafeInteger(m.deliverAtMs)) errors.push('Invalid message time.');
  // Prerequisite order: every earlier chapter's charter must be signed.
  const idx = CHAPTERS.indexOf(s.chapter);
  const needed: Array<[number, keyof CampaignState['charters']]> = [
    [1, 'buildingLease'],
    [2, 'cityTender'],
    [3, 'reserveMandate'],
    [4, 'interplanetaryCharter'],
    [5, 'autonomyCharter'],
    [6, 'skySurvey'],
    [7, 'totality'],
  ];
  for (const [ch, charter] of needed) if (idx >= ch && !s.charters[charter]) errors.push(`Chapter ${s.chapter} requires ${charter}.`);
  // Released-protection consistency: a protected account with mass must not be marked released unless being debited.
  for (const an of Object.values(s.anchors)) {
    if (an.living && an.alive && an.fidelity !== 'original') errors.push(`Living anchor ${an.id} has non-original fidelity.`);
  }
  if (errors.length === 0) {
    const inv = checkInvariant(s);
    if (inv) errors.push(inv);
  }
  return { ok: errors.length === 0, errors };
}

// ---------- storage ----------

export interface Checkpoint {
  id: string;
  label: string;
  kind: 'chapter' | 'decision' | 'precommit' | 'manual';
  chapter: string;
  createdAt: number;
  simMs: number;
  data: string;
}

export interface StoreResult {
  ok: boolean;
  error?: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function writeSave(s: CampaignState): StoreResult {
  const ls = storage();
  if (!ls) return { ok: false, error: 'Storage unavailable. Playing in memory.' };
  try {
    const current = ls.getItem(SAVE_KEY);
    if (current) ls.setItem(PREV_KEY, current);
    ls.setItem(SAVE_KEY, serialize(s));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Save failed: ${(e as Error).message}` };
  }
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; state: CampaignState; fromPrevious?: boolean }
  | { status: 'invalid'; errors: string[]; futureVersion?: boolean; raw: string };

export function readSave(): LoadResult {
  const ls = storage();
  if (!ls) return { status: 'none' };
  let text: string | null = null;
  let prev: string | null = null;
  try {
    text = ls.getItem(SAVE_KEY);
    prev = ls.getItem(PREV_KEY);
  } catch {
    return { status: 'none' };
  }
  if (!text) return { status: 'none' };
  const r = parse(text);
  if (r.status === 'ok') return r;
  // Try the rolling previous-valid snapshot; the corrupt save is left untouched.
  if (prev && r.status === 'invalid' && !r.futureVersion) {
    const p = parse(prev);
    if (p.status === 'ok') return { ...p, fromPrevious: true };
  }
  return r;
}

export function parse(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = deserialize(text);
  } catch (e) {
    return { status: 'invalid', errors: [`Corrupt save: ${(e as Error).message}`], raw: text };
  }
  migrateOffice(raw as CampaignState);
  const v = validate(raw);
  if (!v.ok) return { status: 'invalid', errors: v.errors, futureVersion: v.futureVersion, raw: text };
  return { status: 'ok', state: raw as CampaignState };
}

export function clearSave(): void {
  try {
    const ls = storage();
    ls?.removeItem(SAVE_KEY);
    ls?.removeItem(PREV_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function readCheckpoints(): Checkpoint[] {
  const ls = storage();
  if (!ls) return memoryCheckpoints;
  try {
    return JSON.parse(ls.getItem(CHECKPOINT_KEY) ?? '[]') as Checkpoint[];
  } catch {
    return [];
  }
}

let memoryCheckpoints: Checkpoint[] = [];

const MAX_DECISIONS = 14;

export function addCheckpoint(s: CampaignState, label: string, kind: Checkpoint['kind']): StoreResult {
  const list = readCheckpoints();
  // The precommit checkpoint is immutable: never overwritten.
  if (kind === 'precommit' && list.some((c) => c.kind === 'precommit' && c.chapter === s.chapter && c.simMs === s.simMs)) return { ok: true };
  const cp: Checkpoint = {
    id: `cp.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 7)}`,
    label,
    kind,
    chapter: s.chapter,
    createdAt: Date.now(),
    simMs: s.simMs,
    data: serialize(s),
  };
  let next = list.filter((c) => !(kind === 'chapter' && c.kind === 'chapter' && c.chapter === s.chapter));
  next.push(cp);
  const decisions = next.filter((c) => c.kind === 'decision' || c.kind === 'manual');
  if (decisions.length > MAX_DECISIONS) {
    const drop = new Set(decisions.slice(0, decisions.length - MAX_DECISIONS).map((c) => c.id));
    next = next.filter((c) => !drop.has(c.id));
  }
  const ls = storage();
  if (!ls) {
    memoryCheckpoints = next;
    return { ok: true };
  }
  try {
    ls.setItem(CHECKPOINT_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    // Storage full: drop older decision checkpoints and retry once.
    const trimmed = next.filter((c) => c.kind !== 'decision').concat(next.filter((c) => c.kind === 'decision').slice(-4));
    try {
      ls.setItem(CHECKPOINT_KEY, JSON.stringify(trimmed));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Checkpoint not stored: ${(e as Error).message}` };
    }
  }
}

export function deleteCheckpoint(id: string): void {
  const ls = storage();
  const list = readCheckpoints().filter((c) => c.id !== id || c.kind === 'precommit');
  memoryCheckpoints = list;
  try {
    ls?.setItem(CHECKPOINT_KEY, JSON.stringify(list));
  } catch {
    /* kept in memory */
  }
}

export function clearCheckpoints(): void {
  try {
    storage()?.removeItem(CHECKPOINT_KEY);
  } catch {
    /* storage unavailable */
  }
  memoryCheckpoints = [];
}

// ---------- office night migration ----------

/**
 * Saves made before the office night was rebuilt store the three-machine office. Convert an
 * in-progress office in place: keep its clips, salvage and machines, disclose the spare coil
 * from the unreached allocation, and start packing from zero cartons. Other chapters only gain
 * the two empty office accounts.
 */
export function migrateOffice(s: CampaignState): void {
  if (!s || !s.ledger?.accounts || s.schemaVersion !== SCHEMA_VERSION) return;
  const A = s.ledger.accounts;
  const add = (id: string, label: string, kind: 'feedstock' | 'scrap') => {
    if (!A[id]) A[id] = { id, cat: 'raw', kind, mass: 0n, label, region: 'office', protected: false, released: false };
  };
  const old = s.chapterState as unknown as { kind: string; upgrades?: { bender: boolean; feeder: boolean; jig: boolean } };
  const needsSpare = old?.kind === '01' && !A['office.spare'];
  add('office.spare', 'Spare wire coil (cabinet, bottom drawer)', 'feedstock');
  add('office.rejects', 'Ruined clips', 'scrap');
  if (needsSpare && A.unreached && A.unreached.mass >= OFFICE.spareWire) {
    A.unreached.mass -= OFFICE.spareWire;
    A['office.spare'].mass += OFFICE.spareWire;
  }
  if (old?.kind === '01' && !old.upgrades && (old as unknown as { tending?: number }).tending === undefined) {
    // Saved by the first version of the rebuilt night: fill in the active-play fields.
    s.chapterState = { ...newOfficeState(), ...(s.chapterState as C01State) };
  }
  if (old?.kind === '01' && old.upgrades) {
    const prev = s.chapterState as unknown as { madeClips: number; salvaged: C01State['salvaged']; upgrades: { bender: boolean; feeder: boolean; jig: boolean } };
    const next = newOfficeState();
    next.madeClips = prev.madeClips;
    next.salvaged = prev.salvaged;
    if (prev.upgrades.bender) next.owned.push('calibrate');
    if (prev.upgrades.feeder) next.owned.push('oil', 'feeder');
    if (prev.upgrades.jig) next.owned.push('die2', 'jig', 'station1', 'station2', 'station3', 'station4');
    if (s.mode === 'choice') {
      s.choices = s.choices.filter((c) => c.kind !== 'c01/report');
      if (s.choices.length === 0) s.mode = 'playing';
    }
    s.consumedEventIds = s.consumedEventIds.filter((id) => id !== 'c01.report');
    s.chapterState = next;
  }
  if (old?.kind === '01') migrateOfficeV3(s.chapterState as C01State);
}

/**
 * The third office night replaced the packer's share dial with a reserve and the single
 * jig with a frame and six stations. Map an interim save onto the nearest equivalent.
 */
function migrateOfficeV3(c: C01State): void {
  const prev = c as unknown as { packShare?: number; packCredit?: number; owned: string[] };
  if (prev.packShare === undefined) return;
  c.reserve = prev.packShare >= 100 ? 0 : prev.packShare > 0 ? 100 : 250;
  c.vanCartons = null;
  delete prev.packShare;
  delete prev.packCredit;
  // The old jig was worth four stations; each later head adds the next.
  const owned = prev.owned.filter((id) => !id.startsWith('head'));
  const stations = (owned.includes('jig') ? 4 : 0) + ['head1', 'head2', 'head3'].filter((h) => prev.owned.includes(h)).length;
  for (let i = 1; i <= Math.min(6, stations); i++) owned.push(`station${i}`);
  c.owned = owned as C01State['owned'];
  if (c.installing && !OFFICE.projects.some((p) => p.id === c.installing!.id)) c.installing = null;
}

// ---------- v1 office import ----------

export interface V1Save {
  version: 1;
  available: number;
  lifetime: number;
  upgrades: { bender: boolean; feeder: boolean; jig: boolean };
  salvaged: { cabinet: boolean; lamp: boolean; frame: boolean };
}

/**
 * Import an original office save. It cannot prove full physical history: import its flags,
 * reconstruct the uniquely implied wire use and spent-upgrade mass, and reject anything inconsistent.
 */
export function importV1(raw: unknown): { ok: true; state: CampaignState; summary: string[] } | { ok: false; errors: string[] } {
  const v = raw as V1Save;
  const errors: string[] = [];
  if (!v || v.version !== 1) return { ok: false, errors: ['Not a version 1 office save.'] };
  const ints = [v.available, v.lifetime];
  if (!ints.every((n) => Number.isSafeInteger(n) && n >= 0)) errors.push('Counts must be non-negative integers.');
  if (v.lifetime > OFFICE.quota) errors.push('Lifetime exceeds the 3,000 clip order of a version 1 save.');
  const order = ['bender', 'feeder', 'jig'] as const;
  order.forEach((id, i) => {
    if (v.upgrades?.[id] && i > 0 && !v.upgrades[order[i - 1]]) errors.push(`${id} purchased without its predecessor.`);
  });
  let spent = 0;
  for (const u of OFFICE.legacyUpgrades) if (v.upgrades?.[u.id]) spent += u.costClips;
  let salvageYield = 0;
  for (const sv of OFFICE.salvage) {
    if (v.salvaged?.[sv.id]) {
      if (v.lifetime < sv.threshold) errors.push(`${sv.id} salvaged before its threshold.`);
      salvageYield += sv.yieldClips;
    }
  }
  if (v.available !== v.lifetime - spent) errors.push('Available clips do not equal lifetime minus spent upgrades.');
  const wireClips = v.lifetime - salvageYield;
  if (wireClips < 0 || BigInt(wireClips) * CLIP > OFFICE.wire) errors.push('Implied wire use is impossible.');
  if (errors.length) return { ok: false, errors };

  const s = newCampaign();
  const c = s.chapterState as C01State;
  const wire = BigInt(wireClips) * CLIP;
  mustCommit(s, { id: 'v1.wire', from: 'office.wire', input: wire, outputs: [['clips', wire]] });
  for (const sv of OFFICE.salvage) {
    if (!v.salvaged[sv.id]) continue;
    const acc = s.ledger.accounts[`office.${sv.id}`];
    acc.released = true;
    const y = BigInt(sv.yieldClips) * CLIP;
    mustCommit(s, { id: `v1.salvage.${sv.id}`, from: acc.id, input: acc.mass, outputs: [['clips', y], ['office.scrap', acc.mass - y]], release: true });
    acc.protected = false;
    c.salvaged[sv.id] = true;
    Object.assign(s.anchors[sv.id], { fidelity: 'absent', protected: false, released: true, currentLocation: 'office scrap' });
  }
  // The original three machines map onto the night's installations; their mass is what v1 actually spent.
  const mapping: Record<'bender' | 'feeder' | 'jig', C01State['owned']> = {
    bender: ['calibrate'],
    feeder: ['oil', 'feeder'],
    jig: ['die2', 'jig', 'station1', 'station2', 'station3', 'station4'],
  };
  for (const u of OFFICE.legacyUpgrades) {
    if (!v.upgrades[u.id]) continue;
    const m = BigInt(u.costClips) * CLIP;
    mustCommit(s, { id: `v1.buy.${u.id}`, from: 'clips', input: m, outputs: [['office.machines', m]] });
    c.owned.push(...mapping[u.id]);
    s.projects[u.id] = 'complete';
  }
  c.madeClips = v.lifetime;
  s.clips.lifetimeMadeMicrograms = BigInt(v.lifetime) * CLIP;
  const inv = checkInvariant(s);
  if (inv) return { ok: false, errors: [inv] };
  return {
    ok: true,
    state: s,
    summary: [
      `${v.lifetime.toLocaleString()} lifetime clips, ${v.available.toLocaleString()} on hand.`,
      `Wire used: ${wireClips.toLocaleString()} g of 3,000 g. Spent on machines: ${spent} g.`,
      `Salvaged: ${order.length && (['cabinet', 'lamp', 'frame'] as const).filter((k) => v.salvaged[k]).join(', ') || 'nothing'}.`,
      'The original save was not modified.',
    ],
  };
}
