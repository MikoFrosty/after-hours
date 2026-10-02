// Developer tools for playtesting: more clips, a finished contract or order, a jump ahead. They work on
// the same ledger as play, so conservation still holds; they are never reachable from ordinary input.
import { OFFICE } from '../content/campaign';
import { commit, mass } from './ledger';
import { CLIP } from './mass';
import { bump } from './engine';
import { debugFinishContract, debugGrant } from './chapters/c02';
import { CARTONS, loose } from './chapters/c01';
import type { C01State, CampaignState } from './types';

/** Clips into the player's hands: on the desk in the office, to spend in the building. */
export function grantClips(s: CampaignState, n: number): void {
  if (s.chapter === '02') {
    debugGrant(s, n);
  } else {
    const input = BigInt(n) * CLIP;
    const from = mass(s, 'office.wire') >= input ? 'office.wire' : 'unreached';
    if (!commit(s, { id: `debug.clips.${s.seq++}`, from, input, outputs: [['clips', input]] }).ok) return;
    s.clips.lifetimeMadeMicrograms += input;
    if (s.chapter === '01') (s.chapterState as C01State).madeClips += n;
  }
  bump(s);
}

/** Finish what the current chapter is asking for: the night's order, or the building's contract. */
export function finishCurrent(s: CampaignState): void {
  if (s.chapter === '02') {
    debugFinishContract(s);
  } else if (s.chapter === '01') {
    const c = s.chapterState as C01State;
    const need = (CARTONS - c.sealed) * OFFICE.boxSize;
    if (loose(s) < need) grantClips(s, need - loose(s));
    c.openBox = 0;
    c.sealed = CARTONS;
  }
  bump(s);
}
