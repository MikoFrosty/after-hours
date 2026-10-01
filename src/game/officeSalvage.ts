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

/** The recovered metal is already drawn wire: it skips the drawing station. Work units, in milli. */
export const CLEARING_WORK_PER_CLIP = 80; // 12.5 clips per work unit

export function clearable(s: CampaignState, id: OfficeItem): boolean {
  if (s.chapter !== '02') return false;
  const c = s.chapterState as C02State;
  if (c.contractIndex >= 3) return false;
  return s.anchors[id].fidelity === 'original' && !s.ledger.accounts[`office.${id}`]?.released;
}

export function clearingWork(id: OfficeItem): number {
  return OFFICE.salvage.find((x) => x.id === id)!.yieldClips * CLEARING_WORK_PER_CLIP;
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
