import { describe, expect, it } from 'vitest';
import { CITY, OFFICE, SOLAR, TERMINAL, WORLD } from '../content/campaign';
import { autoplay, CANONICAL, EFFICIENT, seeded } from './autopilot';
import { dispatch, onSignal, run, step } from './engine';
import { byCategory, checkInvariant, commit, mass, nonClipMatter } from './ledger';
import { CLIP } from './mass';
import { clone, deserialize, importV1, parse, serialize } from './save';
import { newCampaign } from './state';
import { baseThroughput, coolingRate, heatGainRate } from './chapters/c02';
import { reserveRate } from './chapters/c03';
import { limits, output } from './chapters/c05';
import { deliverMessages, pathDelay } from './chapters/c06';
import { schedulePreview } from './chapters/c08';
import { protectedLines } from './chapters/c07';
import { glintActive, machineRate, tendingBonus, tuneBand } from './chapters/c01';
import type { C01State, C02State, C03State, C05State, C07State, C08State, CampaignState } from './types';

function invariantEveryStep(s: CampaignState, steps: number) {
  for (let i = 0; i < steps; i++) {
    step(s);
    const e = checkInvariant(s);
    if (e) throw new Error(e);
  }
}

describe('ledger', () => {
  it('starts conserved with the office split out of unreached', () => {
    const s = newCampaign();
    expect(checkInvariant(s)).toBeNull();
    expect(mass(s, 'office.wire')).toBe(3_000_000_000n);
    expect(s.ledger.initial).toBe(WORLD.initial);
  });

  it('rejects unbalanced, overdrawn and protected transactions atomically', () => {
    const s = newCampaign();
    const before = serialize(s);
    expect(commit(s, { id: 't1', from: 'office.wire', input: 10n, outputs: [['clips', 9n]] }).ok).toBe(false);
    expect(commit(s, { id: 't2', from: 'office.wire', input: 10n ** 30n, outputs: [['clips', 10n ** 30n]] }).ok).toBe(false);
    expect(commit(s, { id: 't3', from: 'office.lamp', input: 1n, outputs: [['clips', 1n]] }).ok).toBe(false);
    expect(serialize(s)).toBe(before);
  });

  it('deduplicates discrete transaction IDs', () => {
    const s = newCampaign();
    commit(s, { id: 'dup', from: 'office.wire', input: CLIP, outputs: [['clips', CLIP]] });
    const r = commit(s, { id: 'dup', from: 'office.wire', input: CLIP, outputs: [['clips', CLIP]] });
    expect(r.duplicate).toBe(true);
    expect(s.clips.currentMicrograms).toBe(CLIP);
  });
});

describe('chapter 01 office', () => {
  const night = (s: CampaignState) => s.chapterState as C01State;

  it('reinvestment spends clips that must be made again; lifetime is unchanged', () => {
    const s = newCampaign();
    for (let i = 0; i < 15; i++) dispatch(s, { type: 'c01/make' });
    const life = s.clips.lifetimeMadeMicrograms;
    expect(dispatch(s, { type: 'c01/project', id: 'calibrate' })).toBeNull();
    expect(s.clips.currentMicrograms).toBe(0n);
    expect(s.clips.lifetimeMadeMicrograms).toBe(life);
    expect(mass(s, 'office.machines')).toBe(15n * CLIP);
    expect(checkInvariant(s)).toBeNull();
  });

  it('hand bending has no speed limit', () => {
    const s = newCampaign();
    for (let i = 0; i < 200; i++) expect(dispatch(s, { type: 'c01/make' })).toBeNull();
    expect(night(s).madeClips).toBe(200);
  });

  it('the wire catches until a feeder is installed, and freeing it resumes the bender', () => {
    const s = newCampaign();
    for (let i = 0; i < 15; i++) dispatch(s, { type: 'c01/make' });
    dispatch(s, { type: 'c01/project', id: 'calibrate' });
    let guard = 0;
    while (!night(s).jammed && guard++ < 5000) step(s);
    expect(night(s).jammed).toBe(true);
    const made = night(s).madeClips;
    run(s, 50);
    expect(night(s).madeClips).toBe(made);
    dispatch(s, { type: 'c01/free' });
    run(s, 50);
    expect(night(s).madeClips).toBeGreaterThan(made);
  });

  it('sealed cartons cannot be spent', () => {
    const s = newCampaign();
    for (let i = 0; i < 260; i++) dispatch(s, { type: 'c01/make' });
    expect(dispatch(s, { type: 'c01/pack' })).toBeNull();
    expect(night(s).sealed).toBe(1);
    // 260 clips exist, but only 10 are loose: the 15-clip calibration cannot be paid from the carton.
    expect(dispatch(s, { type: 'c01/project', id: 'calibrate' })).not.toBeNull();
    expect(s.clips.currentMicrograms).toBe(260n * CLIP);
  });

  it('salvage remainders stay as raw scrap and the photograph is kept', () => {
    const s = autoplay({ ...EFFICIENT }, '02');
    expect(mass(s, 'office.scrap')).toBe(10_000_000_000n + 2_000_000_000n + 400_000_000n - 525n * CLIP);
    expect(mass(s, 'office.photograph')).toBe(5_000_000n);
    expect(s.anchors.photograph.fidelity).toBe('original');
    expect(s.anchors.frame.fidelity).toBe('absent');
    expect(checkInvariant(s)).toBeNull();
  });

  it('the order is twelve sealed cartons and needs no salvage', () => {
    const s = autoplay(CANONICAL, '02');
    expect(s.anchors.lamp.fidelity).toBe('original');
    expect(s.anchors.cabinet.fidelity).toBe('original');
    expect(s.clips.currentMicrograms >= BigInt(OFFICE.quota) * CLIP).toBe(true);
  });

  it('the night lasts 20+ minutes for a relaxed player; skill shortens it but not to a sprint', () => {
    const reasonable = autoplay(CANONICAL, '02').summaries['01']!.simMs / 60000;
    const engaged = autoplay(EFFICIENT, '02').summaries['01']!.simMs / 60000;
    expect(reasonable).toBeGreaterThanOrEqual(20);
    expect(engaged).toBeGreaterThanOrEqual(12);
    expect(engaged).toBeLessThan(reasonable);
  });

  it('after the feeder, hands tend the line instead of bending clips', () => {
    const s = newCampaign();
    const c = night(s);
    c.owned.push('calibrate', 'oil', 'feeder');
    const made = c.madeClips;
    for (let i = 0; i < 20; i++) dispatch(s, { type: 'c01/make' });
    expect(c.madeClips).toBe(made);
    expect(c.tending).toBe(100_000);
    expect(tendingBonus(c)).toBe(250);
    const tended = machineRate(s);
    c.tending = 0;
    expect(tended).toBeGreaterThan(machineRate(s));
  });

  it('catching the true wire gives a clean run and frees a caught wire', () => {
    const s = newCampaign();
    for (let i = 0; i < 15; i++) dispatch(s, { type: 'c01/make' });
    dispatch(s, { type: 'c01/project', id: 'calibrate' });
    let guard = 0;
    while (!glintActive(s) && guard++ < 20000) {
      if (night(s).jammed) dispatch(s, { type: 'c01/free' });
      step(s);
    }
    expect(glintActive(s)).toBe(true);
    night(s).jammed = true;
    const before = machineRate(s);
    expect(dispatch(s, { type: 'c01/catch' })).toBeNull();
    expect(night(s).jammed).toBe(false);
    expect(machineRate(s)).toBeGreaterThan(before);
    expect(dispatch(s, { type: 'c01/catch' })).not.toBeNull();
  });

  it('tuning: a hit is permanent, a miss only costs a few seconds, and careful tuning always works', () => {
    const s = newCampaign();
    const c = night(s);
    c.owned.push('calibrate', 'oil', 'feeder');
    const band = tuneBand(c);
    dispatch(s, { type: 'c01/tune', needle: band.center });
    expect(c.tuneLevel).toBe(1);
    const next = tuneBand(c);
    expect(next.width).toBeLessThan(band.width);
    dispatch(s, { type: 'c01/tune', needle: (next.center + 50) % 100 });
    expect(c.tuneLevel).toBe(1);
    expect(dispatch(s, { type: 'c01/tune', needle: next.center })).not.toBeNull();
    dispatch(s, { type: 'c01/tuneSlow' });
    run(s, 200);
    expect(c.tuneLevel).toBe(2);
  });

  it('story time reaches dawn as the order completes', () => {
    const s = autoplay({ ...CANONICAL, holdAt: '01' });
    expect(s.storySeconds).toBe(OFFICE.nightStorySeconds);
  });

  it('declining the lease is an honest holding ending', () => {
    const s = autoplay({ ...CANONICAL, holdAt: '01' });
    expect(s.mode).toBe('holding');
    expect(s.ending?.kind).toBe('office');
    expect(night(s).sealed).toBe(12);
  });
});

describe('chapter 02 building', () => {
  it('throttled maximum output always cools', () => {
    const s = seeded('02');
    const c = s.chapterState as C02State;
    c.upgrades = { wireDraw: true, freight: true, roofCooling: false };
    c.route = 'direct';
    c.throttled = true;
    expect(baseThroughput(c)).toBe(3000);
    expect(heatGainRate(c)).toBe(600);
    expect(heatGainRate(c)).toBeLessThan(coolingRate(c));
  });

  it('the garden route finishes without demolition', () => {
    const s = autoplay(CANONICAL, '03');
    expect(s.anchors.garden.fidelity).toBe('original');
    expect((s.summaries['02'] as object)).toBeDefined();
  });
});

describe('chapter 03 city', () => {
  it('default allocation meets all needs and earns reserve', () => {
    const s = seeded('03');
    run(s, 250);
    const c = s.chapterState as C03State;
    expect(c.scoresMilli.every((x) => x >= CITY.certMin)).toBe(true);
    if (s.choices.length) dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'retain' });
    expect(reserveRate(c)).toBeGreaterThan(0);
  });

  it('rejects invalid allocation atomically', () => {
    const s = seeded('03');
    const c = s.chapterState as C03State;
    c.alloc = [0, 2, 2, 6];
    expect(dispatch(s, { type: 'c03/shift', from: 0, to: 3 })).not.toBeNull();
    expect(c.alloc).toEqual([0, 2, 2, 6]);
  });
});

describe('chapter 05 solar', () => {
  it('default allocation at maximum overhead yields 4.475 work/sec', () => {
    const s = seeded('05');
    s.flags.protectedSupportCost = 21;
    const c = s.chapterState as C05State;
    c.alloc = { ...SOLAR.defaultAlloc };
    expect(limits(s).power).toBe(4475);
    expect(output(s)).toBe(4475);
  });

  it('removing radiators stops production, not the save', () => {
    const s = seeded('05');
    const c = s.chapterState as C05State;
    while (c.alloc.radiator > 0) dispatch(s, { type: 'c05/shift', from: 'radiator', to: 'collector' });
    expect(output(s)).toBe(0);
    invariantEveryStep(s, 20);
  });

  it('the support slot cannot be removed', () => {
    const s = seeded('05');
    expect(dispatch(s, { type: 'c05/shift', from: 'support', to: 'collector' })).not.toBeNull();
  });
});

describe('chapter 06 remote offices', () => {
  it('policy revisions apply only on arrival, duplicates are idempotent', () => {
    const s = seeded('06');
    dispatch(s, { type: 'c06/expand', from: 'origin', target: 'A', policy: 'steward' });
    let guard = 0;
    while (!s.regions.A.initialReceipt && guard++ < 2000) step(s);
    expect(s.regions.A.known.settled).toBe(true);
    dispatch(s, { type: 'c06/revise', region: 'A', policy: 'extractor' });
    expect(s.regions.A.policy).toBe('steward');
    const msg = s.messages.find((m) => m.kind === 'revision')!;
    const dup = { ...msg };
    run(s, pathDelay('A') / 100 - 1);
    expect(s.regions.A.policy).toBe('steward');
    run(s, 2);
    expect(s.regions.A.policy).toBe('extractor');
    const clips = s.clips.currentMicrograms;
    s.messages.push(dup);
    deliverMessages(s);
    expect(s.clips.currentMicrograms).toBe(clips);
    expect(s.regions.A.policyVersion).toBe(2);
  });
});

describe('full campaign', () => {
  for (const [name, route] of [
    ['all-original / no-salvage', CANONICAL],
    ['maximum efficiency', EFFICIENT],
  ] as const) {
    it(`${name} reaches the end with exact conservation`, () => {
      const errors: string[] = [];
      const off = onSignal((sig) => sig.type === 'error' && errors.push(sig.message));
      const s = autoplay(route);
      off();
      expect(errors).toEqual([]);
      expect(s.mode).toBe('ended');
      expect(s.ending?.kind).toBe('totality');
      expect(checkInvariant(s)).toBeNull();
      expect(nonClipMatter(s)).toBe(0n);
      const cat = byCategory(s);
      expect(cat.clips + cat.radiatedEquivalent).toBe(WORLD.initial);
      const c8 = s.chapterState as C08State;
      expect(c8.tasksDone).toEqual(TERMINAL.tasks.map((t) => t.id));
      // Living anchors are not alive after an explicit liquidation; nothing claims otherwise.
      expect(s.anchors.habitat.alive).toBe(false);
      // Remainder conserved exactly: clips mass is not rounded to whole clips.
      expect(s.clips.currentMicrograms % CLIP).toBe(schedulePreview(s).remainder);
    });
  }

  it('holding the living reserve does not satisfy the totality guard', () => {
    const s = autoplay({ ...CANONICAL, holdAt: '07' });
    expect(s.mode).toBe('holding');
    expect(s.charters.totality).toBe(false);
    expect(s.anchors.habitat.alive).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips BigInt state exactly at every chapter boundary', () => {
    for (const ch of ['02', '04', '06', '08'] as const) {
      const s = seeded(ch, EFFICIENT);
      const text = serialize(s);
      const r = parse(text);
      expect(r.status).toBe('ok');
      if (r.status === 'ok') expect(serialize(r.state)).toBe(text);
    }
  });

  it('rejects a save whose ledger does not conserve mass', () => {
    const s = newCampaign();
    s.ledger.accounts.clips.mass += 1n;
    s.clips.currentMicrograms += 1n;
    const r = parse(serialize(s));
    expect(r.status).toBe('invalid');
  });

  it('preserves future schema versions with a clear status', () => {
    const s = newCampaign() as unknown as Record<string, unknown>;
    s.schemaVersion = 9;
    const r = parse(serialize(s as unknown as CampaignState));
    expect(r.status === 'invalid' && r.futureVersion).toBe(true);
  });

  it('terminal save resumes without duplicate task completion', () => {
    const s = autoplay(CANONICAL, '08');
    let guard = 0;
    while ((s.chapterState as C08State).tasksDone.length < 2 && guard++ < 5000) {
      const c = s.chapterState as C08State;
      if (s.choices.length) dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'commit' });
      else if (c.chargeMilli < 100_000) {
        dispatch(s, { type: 'c08/charge' });
        step(s);
      } else if (!c.scheduleValidated) dispatch(s, { type: 'c08/validate' });
      else if (!c.committed) dispatch(s, { type: 'request', kind: 'commit' });
      else step(s);
    }
    const copy = clone(s);
    const clipsBefore = copy.clips.currentMicrograms;
    const r = parse(serialize(copy));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.state.clips.currentMicrograms).toBe(clipsBefore);
      expect((r.state.chapterState as C08State).tasksDone.length).toBe(2);
    }
  });

  it('imports a consistent v1 office save and rejects inconsistent ones', () => {
    const ok = importV1({ version: 1, available: 1000 - 515, lifetime: 1000, upgrades: { bender: true, feeder: true, jig: true }, salvaged: { cabinet: true, lamp: true, frame: false } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(checkInvariant(ok.state)).toBeNull();
    const bad = importV1({ version: 1, available: 999, lifetime: 1000, upgrades: { bender: true, feeder: false, jig: true }, salvaged: { cabinet: false, lamp: false, frame: false } });
    expect(bad.ok).toBe(false);
    expect(deserialize('{"a":{"$big":"12"}}')).toEqual({ a: 12n });
  });
});

describe('terminal audit', () => {
  it('asks for an explicit decision on a retained original office', () => {
    const s = autoplay(CANONICAL, '07');
    expect(s.ledger.accounts['office.equipment'].protected).toBe(true);
    const c = s.chapterState as C07State;
    // Query the audit directly: the office's protected capital must be listed among originals.
    c.auditRun = true;
    expect(protectedLines(s).some((l) => l.account.id === 'office.equipment' && l.group === 'original')).toBe(true);
  });
});

describe('office migration', () => {
  it('converts a save from the three-machine office without breaking conservation', () => {
    const s = newCampaign() as unknown as Record<string, unknown>;
    const st = s as unknown as CampaignState;
    // Rebuild the earlier shape: no spare coil or rejects account, and the old chapter state.
    st.ledger.accounts.unreached.mass += st.ledger.accounts['office.spare'].mass;
    delete st.ledger.accounts['office.spare'];
    delete st.ledger.accounts['office.rejects'];
    for (let i = 0; i < 20; i++) dispatch(st, { type: 'c01/make' });
    (st as unknown as { chapterState: unknown }).chapterState = {
      kind: '01',
      madeClips: 20,
      rateResidue: 0,
      upgrades: { bender: true, feeder: false, jig: false },
      salvaged: { cabinet: false, lamp: false, frame: false },
      capped: false,
      reportShown: false,
    };
    const r = parse(serialize(st));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      const c = r.state.chapterState as C01State;
      expect(c.owned).toEqual(['calibrate']);
      expect(c.madeClips).toBe(20);
      expect(mass(r.state, 'office.spare')).toBe(2_000_000_000n);
      expect(checkInvariant(r.state)).toBeNull();
    }
  });
});
