import { OFFICE } from '../content/campaign';
import { mustCommit } from './ledger';
import { CLIP } from './mass';
import { log } from './state';
import { bump, emit } from './engine';
import type { C02State, CampaignState } from './types';

// The office is cleared when the building lease is signed. What comes along and what goes to
// the line is decided here, at the start of chapter 2, so the night itself is only about making.

export type OfficeItem = 'cabinet' | 'lamp' | 'frame';
export const OFFICE_ITEMS: OfficeItem[] = ['cabinet', 'lamp', 'frame'];

/**
 * The recovered metal is already drawn wire: a small head start on the current contract, in
 * milli-work. Kept well under the first contract (28 of its 120 units for the whole floor), so
 * clearing the office never does the building's work for it.
 */
export const CLEARING_WORK: Record<OfficeItem, number> = { cabinet: 4_000, lamp: 8_000, frame: 16_000 };

export function clearable(s: CampaignState, id: OfficeItem): boolean {
  if (s.chapter !== '02') return false;
  const c = s.chapterState as C02State;
  // The move happens over the first two contracts.
  if (c.contractIndex >= 2 || c.awaitingInspection) return false;
  return s.anchors[id].fidelity === 'original' && !s.ledger.accounts[`office.${id}`]?.released;
}

export function clearingWork(id: OfficeItem): number {
  return CLEARING_WORK[id];
}

/** Send one office object to the line: its first usable batch becomes clips, the rest raw scrap. Irreversible. */
export function salvageOfficeItem(s: CampaignState, id: OfficeItem): void {
  const def = OFFICE.salvage.find((x) => x.id === id)!;
  const acc = s.ledger.accounts[`office.${id}`];
  const clipMass = BigInt(def.yieldClips) * CLIP;
  acc.released = true;
  mustCommit(s, {
    id: `office.salvage.${id}`,
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
  s.clips.lifetimeMadeMicrograms += clipMass;
  const c = s.chapterState as C02State;
  const work = clearingWork(id);
  c.contractWorkMilli += work;
  c.cumulativeWorkMilli += work;
  const an = s.anchors[id];
  an.fidelity = 'absent';
  an.protected = false;
  an.released = true;
  an.currentLocation = 'office scrap';
  an.evidence.push('sent to the line when the 11th floor was cleared');
  log(s, {
    id: `loss.${id}`,
    kind: 'loss',
    title: `${id[0].toUpperCase()}${id.slice(1)} sent to the line`,
    text:
      id === 'frame'
        ? `${def.yieldClips} clips formed. The remaining metal is raw scrap. The photograph stays with the desk.`
        : `${def.yieldClips} clips formed. The remaining ${id === 'cabinet' ? '9.925 kg' : '1.85 kg'} is raw scrap.`,
  });
  emit({ type: 'sound', id: id === 'lamp' ? 'lampOff' : 'salvage' });
  bump(s);
}
