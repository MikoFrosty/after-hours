import { WORLD } from '../content/campaign';
import { splitPpm, sum } from './mass';
import type { Account, AccountKind, CampaignState, Category, Mass, MatterLedger, Transaction } from './types';

export class LedgerError extends Error {}

export function createLedger(initial: Mass): MatterLedger {
  return {
    initial,
    accounts: {
      unreached: acct('unreached', 'unreached', 'universe', initial, 'Unreached allocation', 'universe'),
      clips: acct('clips', 'clips', 'stock', 0n, 'Clip stock', 'universe'),
      radiated: acct('radiated', 'radiatedEquivalent', 'radiation', 0n, 'Radiated equivalent', 'universe'),
    },
    committed: [],
    txCount: 0,
  };
}

export function acct(
  id: string,
  cat: Category,
  kind: AccountKind,
  mass: Mass,
  label: string,
  region: string,
  extra: Partial<Account> = {},
): Account {
  return { id, cat, kind, mass, label, region, protected: false, released: false, ...extra };
}

/** Open a new zero-mass account (idempotent). */
export function openAccount(
  s: CampaignState,
  id: string,
  cat: Category,
  kind: AccountKind,
  label: string,
  region: string,
  extra: Partial<Account> = {},
): Account {
  const existing = s.ledger.accounts[id];
  if (existing) return existing;
  const a = acct(id, cat, kind, 0n, label, region, extra);
  s.ledger.accounts[id] = a;
  return a;
}

export function get(s: CampaignState, id: string): Account {
  const a = s.ledger.accounts[id];
  if (!a) throw new LedgerError(`Unknown account ${id}`);
  return a;
}

export function mass(s: CampaignState, id: string): Mass {
  return s.ledger.accounts[id]?.mass ?? 0n;
}

export interface TxResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

/**
 * Atomically validate and commit a material transaction.
 * Input must exist, protection must permit it, and outputs (including radiation) must sum to input exactly.
 */
export function commit(s: CampaignState, tx: Transaction): TxResult {
  const L = s.ledger;
  if (!tx.periodic && L.committed.includes(tx.id)) return { ok: true, duplicate: true };
  const src = L.accounts[tx.from];
  if (!src) return { ok: false, error: `Unknown source ${tx.from}` };
  if (tx.input < 0n) return { ok: false, error: 'Negative input' };
  if (src.mass < tx.input) return { ok: false, error: `Insufficient ${src.label}` };
  if (src.protected && !(tx.release && src.released)) {
    return { ok: false, error: `${src.label} is protected` };
  }
  let out = 0n;
  for (const [id, m] of tx.outputs) {
    if (!L.accounts[id]) return { ok: false, error: `Unknown destination ${id}` };
    if (m < 0n) return { ok: false, error: 'Negative output' };
    out += m;
  }
  if (out !== tx.input) return { ok: false, error: `Unbalanced transaction ${tx.id}: ${tx.input} → ${out}` };
  if (tx.charter && !s.charters[tx.charter]) return { ok: false, error: `Requires charter ${tx.charter}` };

  src.mass -= tx.input;
  for (const [id, m] of tx.outputs) L.accounts[id].mass += m;
  L.txCount += 1;
  if (!tx.periodic) L.committed.push(tx.id);
  if (tx.outputs.some(([id]) => id === 'clips') || tx.from === 'clips') {
    s.clips.currentMicrograms = L.accounts.clips.mass;
  }
  return { ok: true };
}

export function mustCommit(s: CampaignState, tx: Transaction): void {
  const r = commit(s, tx);
  if (!r.ok) throw new LedgerError(r.error);
}

/** Default clip-making recipe: 999,900 ppm to clips and the rest to radiated equivalent. */
export function clipRecipe(input: Mass): Array<[string, Mass]> {
  const [clips, rad] = splitPpm(input, WORLD.clipOutputPpm);
  return [
    ['clips', clips],
    ['radiated', rad],
  ];
}

export function total(s: CampaignState): Mass {
  return sum(Object.values(s.ledger.accounts).map((a) => a.mass));
}

export function byCategory(s: CampaignState): Record<Category, Mass> {
  const r = {
    unreached: 0n,
    raw: 0n,
    inTransit: 0n,
    capital: 0n,
    livingProtected: 0n,
    archiveProtected: 0n,
    clips: 0n,
    radiatedEquivalent: 0n,
  } as Record<Category, Mass>;
  for (const a of Object.values(s.ledger.accounts)) r[a.cat] += a.mass;
  return r;
}

export function nonClipMatter(s: CampaignState): Mass {
  const c = byCategory(s);
  return c.unreached + c.raw + c.inTransit + c.capital + c.livingProtected + c.archiveProtected;
}

/** Conservation invariant: initial allocation equals all material accounts plus radiated equivalent. */
export function checkInvariant(s: CampaignState): string | null {
  for (const a of Object.values(s.ledger.accounts)) {
    if (a.mass < 0n) return `Negative account ${a.id}`;
  }
  const t = total(s);
  if (t !== s.ledger.initial) return `Conservation violated: ${t} ≠ ${s.ledger.initial}`;
  if (s.clips.currentMicrograms !== s.ledger.accounts.clips.mass) return 'Clip projection out of sync';
  return null;
}

export function accountsWhere(s: CampaignState, pred: (a: Account) => boolean): Account[] {
  return Object.values(s.ledger.accounts).filter(pred);
}

/** Commit a clip-making transaction with the default recipe; returns clip mass formed. */
export function makeClips(
  s: CampaignState,
  id: string,
  from: string,
  input: Mass,
  opts: { periodic?: boolean; release?: boolean; irreversible?: boolean } = {},
): Mass {
  if (input <= 0n) return 0n;
  const outputs = clipRecipe(input);
  const r = commit(s, { id, from, input, outputs, periodic: opts.periodic ?? true, release: opts.release, irreversible: opts.irreversible });
  if (!r.ok) return 0n;
  s.clips.lifetimeMadeMicrograms += outputs[0][1];
  return outputs[0][1];
}
