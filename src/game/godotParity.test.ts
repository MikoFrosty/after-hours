// The Godot port of the night (godot/sim) must play exactly like this one. Both test suites check the same
// recorded run of the two simulated players. After an intended change to the night's rules here, rewrite the
// record with UPDATE_PARITY=1 npx vitest run src/game/godotParity.test.ts, then make the C# port match it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoplay, CANONICAL, EFFICIENT, type Route } from './autopilot';
import { onSignal } from './engine';
import { newCampaign } from './state';
import { nightGrade } from './chapters/c01';
import type { C01State } from './types';

const FIXTURE = new URL('../../godot/tests/fixtures/office-parity.json', import.meta.url);

function record(route: Route) {
  const s = newCampaign();
  const trace: string[] = [];
  let summary: Record<string, unknown> | null = null;
  const off = onSignal((sig) => {
    if (s.chapter !== '01') return;
    const c = s.chapterState as C01State;
    if (sig.type === 'sound' && sig.id !== 'bend') trace.push(`${s.simMs} sound ${sig.id}`);
    if (sig.type === 'beat') trace.push(`${s.simMs} beat ${sig.title}`);
    if (sig.type === 'sound' && sig.id === 'orderComplete') {
      summary = {
        simMs: s.simMs,
        madeClips: c.madeClips,
        handPresses: c.handPresses,
        sealed: c.sealed,
        vanCartons: c.vanCartons,
        courierCartons: c.courierCartons,
        courierBonus: c.courierBonus,
        jams: c.jams,
        burstsCaught: c.burstsCaught,
        owned: [...c.owned],
        grade: nightGrade(c, s.simMs / 1000),
      };
    }
  });
  try {
    autoplay(route, '02', s);
  } finally {
    off();
  }
  return { summary, trace };
}

describe('the Godot port', () => {
  it('plays the night exactly as recorded for both simulated players', () => {
    const now = { relaxed: record(CANONICAL), engaged: record(EFFICIENT) };
    if (process.env.UPDATE_PARITY || !existsSync(FIXTURE)) writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n');
    const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(now).toEqual(recorded);
  });
});
