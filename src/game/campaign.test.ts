import { describe, expect, it } from 'vitest';
import { BUILDING, CITY, OFFICE, SOLAR, TERMINAL, WORLD } from '../content/campaign';
import { autoplay, CANONICAL, EFFICIENT, seeded } from './autopilot';
import { dispatch, onSignal, run, step } from './engine';
import { byCategory, checkInvariant, commit, mass, nonClipMatter } from './ledger';
import { CLIP } from './mass';
import { clone, deserialize, importV1, parse, serialize } from './save';
import { newCampaign } from './state';
import { debugFinishContract, debugGrant, heatOpen, lineRate, openRooms, price, room, roomRate, routeOpen, shopOpen, slowestRoom } from './chapters/c02';
import { reserveRate } from './chapters/c03';
import { limits, output } from './chapters/c05';
import { deliverMessages, pathDelay } from './chapters/c06';
import { schedulePreview } from './chapters/c08';
import { protectedLines } from './chapters/c07';
import { burstReady, loose, machineRate, nextGoal, offeredProjects, paybackSeconds, paysInTime, pressYield, rateGain, secondsToVan, sheetReady, steadyRate, vanForecast } from './chapters/c01';
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
  /** Put clips on the desk without going through play. */
  let grant = 0;
  const give = (s: CampaignState, n: number) => {
    commit(s, { id: `test.give.${grant++}`, from: 'office.wire', input: BigInt(n) * CLIP, outputs: [['clips', BigInt(n) * CLIP]] });
    night(s).madeClips += n;
  };
  /** A night past the trial run with the clip machine uncovered. */
  const approved = () => {
    const s = newCampaign();
    night(s).trial = 'approved';
    night(s).sheetLifted = true;
    return s;
  };

  it('reinvestment spends clips that must be made again; lifetime is unchanged', () => {
    const s = approved();
    for (let i = 0; i < 100; i++) dispatch(s, { type: 'c01/make' });
    const life = s.clips.lifetimeMadeMicrograms;
    expect(dispatch(s, { type: 'c01/project', id: 'calibrate' })).toBeNull();
    expect(s.clips.currentMicrograms).toBe(0n);
    expect(s.clips.lifetimeMadeMicrograms).toBe(life);
    expect(mass(s, 'office.machines')).toBe(100n * CLIP);
    expect(checkInvariant(s)).toBeNull();
  });

  it('every press makes clips, all night; the foot pedal adds a moment of the machines', () => {
    const s = newCampaign();
    for (let i = 0; i < 200; i++) expect(dispatch(s, { type: 'c01/make' })).toBeNull();
    expect(night(s).madeClips).toBe(200);
    const c = night(s);
    c.owned.push('calibrate', 'oil', 'feeder', 'die2', 'pedal');
    // 8 clips a second from the machines; a quarter second of that rides on each press.
    expect(steadyRate(s)).toBe(8000);
    expect(pressYield(s)).toBe(1 + 2);
  });

  it('the wire snags until the feeder is in; the spring makes it rarer, and freeing it resumes the machine', () => {
    const s = approved();
    for (let i = 0; i < 100; i++) dispatch(s, { type: 'c01/make' });
    dispatch(s, { type: 'c01/project', id: 'calibrate' });
    let guard = 0;
    while (!night(s).jammed && guard++ < 5000) step(s);
    expect(night(s).jammed).toBe(true);
    expect(night(s).madeClips).toBeGreaterThanOrEqual(100 + OFFICE.jamInterval);
    const made = night(s).madeClips;
    run(s, 50);
    expect(night(s).madeClips).toBe(made);
    dispatch(s, { type: 'c01/free' });
    run(s, 50);
    expect(night(s).madeClips).toBeGreaterThan(made);
    night(s).owned.push('oil', 'feeder');
    night(s).jammed = false;
    run(s, 2000);
    expect(night(s).jammed).toBe(false);
  });

  it('sealed cartons cannot be spent', () => {
    const s = approved();
    for (let i = 0; i < 260; i++) dispatch(s, { type: 'c01/make' });
    expect(dispatch(s, { type: 'c01/pack' })).toBeNull();
    expect(night(s).sealed).toBe(1);
    // 260 clips exist, but only 10 are on the desk: the 100-clip machine cannot be paid from the carton.
    expect(dispatch(s, { type: 'c01/project', id: 'calibrate' })).not.toBeNull();
    expect(s.clips.currentMicrograms).toBe(260n * CLIP);
  });

  it('the night offers no salvage: the office objects arrive in chapter 2 untouched', () => {
    const s = autoplay({ ...EFFICIENT }, '02');
    expect(s.anchors.cabinet.fidelity).toBe('original');
    expect(s.anchors.lamp.fidelity).toBe('original');
    expect(s.anchors.frame.fidelity).toBe('original');
    expect(dispatch(newCampaign(), { type: 'request', kind: 'salvage', subject: 'cabinet' })).not.toBeNull();
  });

  it('the 11th floor is only cleared after the first delivery, and its clips go into the building stock', () => {
    const s = seeded('02');
    expect(dispatch(s, { type: 'request', kind: 'salvage', subject: 'cabinet' })).not.toBeNull();
    debugFinishContract(s);
    const office = s.choices.find((x) => x.kind === 'c02/office')!;
    expect(office).toBeDefined();
    dispatch(s, { type: 'choose', choiceId: office.id, option: 'choose' });
    const before = (s.chapterState as C02State).stock;
    dispatch(s, { type: 'request', kind: 'salvage', subject: 'cabinet' });
    dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'confirm' });
    expect(s.anchors.cabinet.fidelity).toBe('absent');
    expect((s.chapterState as C02State).stock).toBe(before + 75);
    expect(checkInvariant(s)).toBeNull();
  });

  it('clearing the 11th floor: remainders stay as raw scrap and the photograph is kept', () => {
    const s = autoplay({ ...EFFICIENT }, '03');
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

  it('the night takes about 9–14 minutes for a relaxed player and is shorter, not a sprint, played hard', () => {
    const relaxed = autoplay(CANONICAL, '02').summaries['01']!.simMs / 60000;
    const engaged = autoplay(EFFICIENT, '02').summaries['01']!.simMs / 60000;
    expect(relaxed).toBeGreaterThanOrEqual(9);
    expect(relaxed).toBeLessThanOrEqual(14);
    expect(engaged).toBeGreaterThanOrEqual(5.5);
    expect(engaged).toBeLessThan(relaxed);
  });

  it('each big upgrade roughly doubles what the machines make, and says how fast it pays for itself', () => {
    const s = approved();
    const c = night(s);
    const rates: number[] = [];
    for (const id of ['calibrate', 'oil', 'feeder', 'die2', 'jig', 'station6'] as const) {
      c.owned.push(id);
      rates.push(steadyRate(s));
    }
    expect(rates).toEqual([1000, 2000, 4000, 8000, 14_000, 28_000]);
    c.owned = ['calibrate', 'oil', 'feeder'];
    const die2 = OFFICE.projects.find((p) => p.id === 'die2')!;
    expect(rateGain(s, die2)).toBe(4000);
    expect(paybackSeconds(s, die2)).toBe(die2.costClips / 4);
  });

  it('speed bursts start with the clip machine; grabbing one triples output and frees a snag', () => {
    const s = approved();
    night(s).owned.push('calibrate', 'oil', 'feeder');
    let guard = 0;
    while (!burstReady(s) && guard++ < 20000) step(s);
    expect(burstReady(s)).toBe(true);
    night(s).jammed = true;
    expect(dispatch(s, { type: 'c01/catch' })).toBeNull();
    expect(night(s).jammed).toBe(false);
    expect(machineRate(s)).toBe(steadyRate(s) * 3);
    expect(dispatch(s, { type: 'c01/catch' })).not.toBeNull();
    run(s, OFFICE.bursts.runMs / 100 + 1);
    expect(machineRate(s)).toBe(steadyRate(s));
  });

  it('the foot pedal and overnight mode are one or the other', () => {
    const s = approved();
    const c = night(s);
    c.owned.push('calibrate', 'oil', 'feeder', 'die2');
    give(s, 2000);
    expect(offeredProjects(s).map((p) => p.id)).toEqual(expect.arrayContaining(['pedal', 'governor']));
    expect(dispatch(s, { type: 'c01/project', id: 'governor' })).toBeNull();
    expect(offeredProjects(s).map((p) => p.id)).not.toContain('pedal');
    run(s, 200);
    expect(c.owned).toContain('governor');
    expect(dispatch(s, { type: 'c01/project', id: 'pedal' })).not.toBeNull();
    expect(checkInvariant(s)).toBeNull();
  });

  it('the van forecast counts what is packed and what the machines will make before 5:22', () => {
    const s = approved();
    const c = night(s);
    c.owned.push('calibrate', 'oil', 'feeder', 'die2');
    c.sealed = 3;
    give(s, 3 * 250 + 100);
    const left = secondsToVan(s)!;
    expect(left).toBeGreaterThan(0);
    expect(vanForecast(s)).toBe(Math.min(11, 2 + Math.floor((100 + 8 * left) / 250)));
    // Close to the van, an upgrade that cannot make its price back in time is called out.
    s.storySeconds = OFFICE.vanMinute * 60 - 38 * 20; // twenty seconds before the van
    const jig = OFFICE.projects.find((p) => p.id === 'jig')!;
    expect(paysInTime(s, jig)).toBe(false);
    expect(nextGoal(s)).toMatch(/Pack/);
  });

  it('the 5:22 van takes the big order’s packed cartons, and the bonus becomes the building’s first clips', () => {
    const s = autoplay({ ...CANONICAL, holdAt: '01' });
    const c = night(s);
    expect(c.vanCartons).not.toBeNull();
    expect(c.vanCartons!).toBeGreaterThanOrEqual(1);
    expect(c.vanCartons!).toBeLessThanOrEqual(11);
    expect(s.flags['c01.vanBonus']).toBe(c.vanCartons! * OFFICE.vanBonusPerCarton);
    const fast = autoplay({ ...EFFICIENT, holdAt: '01' });
    expect(night(fast).vanCartons).toBe(11);
    const b = autoplay(CANONICAL, '02');
    const bonus = Number(b.flags['c01.vanBonus']);
    expect((b.chapterState as C02State).stock).toBeGreaterThanOrEqual(bonus);
    expect(checkInvariant(b)).toBeNull();
  });

  it('the night is three orders: a trial run of 100, one carton, then eleven more', () => {
    const s = newCampaign();
    const c = night(s);
    for (let i = 0; i < 99; i++) dispatch(s, { type: 'c01/make' });
    expect(nextGoal(s)).toBe('Make 1 more clip for the trial run.');
    expect(dispatch(s, { type: 'c01/sendTrial' })).not.toBeNull();
    // No carton order exists yet, and nothing under the dust sheet is offered.
    expect(dispatch(s, { type: 'c01/pack' })).not.toBeNull();
    expect(offeredProjects(s)).toEqual([]);
    dispatch(s, { type: 'c01/make' });
    expect(dispatch(s, { type: 'c01/sendTrial' })).toBeNull();
    // The hundred clips have gone: they are not on the desk to spend.
    expect(loose(s)).toBe(0);
    expect(c.trial).toBe('sent');
    expect(sheetReady(s)).toBe(false);
    run(s, OFFICE.trial.replyMs / 100 + 1);
    expect(c.trial).toBe('approved');
    expect(c.files.order2).toBe('unread');
    // The reply brings the dust sheet into view; the machine under it is the way to a carton's worth.
    expect(nextGoal(s)).toMatch(/dust sheet/);
    expect(dispatch(s, { type: 'c01/lift' })).toBeNull();
    expect(offeredProjects(s).map((p) => p.id)).toEqual(['calibrate']);
    for (let i = 0; i < 250; i++) dispatch(s, { type: 'c01/make' });
    expect(dispatch(s, { type: 'c01/pack' })).toBeNull();
    step(s);
    expect(c.files.order3).toBe('unread');
    expect(checkInvariant(s)).toBeNull();
  });

  it('other terminal files arrive one at a time', () => {
    const s = newCampaign();
    const c = night(s);
    for (let i = 0; i < 30; i++) dispatch(s, { type: 'c01/make' });
    run(s, 10);
    expect(Object.keys(c.files)).toEqual(['order']);
    run(s, OFFICE.opening.fileGapMs / 100);
    expect(Object.keys(c.files)).toEqual(['order', 'contract']);
  });

  it('the wire feeder waits on the first carton, and the goal points at the carton', () => {
    const s = approved();
    const c = night(s);
    c.owned.push('calibrate', 'oil');
    give(s, 100);
    expect(offeredProjects(s).map((p) => p.id)).not.toContain('feeder');
    expect(nextGoal(s)).toBe('Keep making clips: 150 more fill the carton.');
    give(s, 150);
    expect(nextGoal(s)).toBe('You have 250 clips. Pack the carton.');
    expect(dispatch(s, { type: 'c01/pack' })).toBeNull();
    expect(c.sealed).toBe(1);
    expect(offeredProjects(s).map((p) => p.id)).toContain('feeder');
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
  const b = (s: CampaignState) => s.chapterState as C02State;

  it('starts with one thing to do: unload wire by hand', () => {
    const s = seeded('02');
    const c = b(s);
    expect(openRooms(c).map((r) => r.id)).toEqual(['dock', 'workshop']);
    expect(shopOpen(c)).toBe(false);
    expect(dispatch(s, { type: 'c02/buy', room: 'workshop' })).not.toBeNull();
    run(s, 50);
    expect(c.contractClips).toBe(0);
    dispatch(s, { type: 'c02/unload' });
    dispatch(s, { type: 'c02/unload' });
    // A third press in the same instant is absorbed: two coils a second at most.
    dispatch(s, { type: 'c02/unload' });
    run(s, 30);
    expect(c.contractClips).toBe(2 * BUILDING.handCoilClips);
    expect(checkInvariant(s)).toBeNull();
  });

  it('opens one thing per contract: the shop, the wire room, shipping, heat, the route', () => {
    const s = seeded('02');
    const c = b(s);
    const seen: string[] = [];
    for (let k = 0; k < 5; k++) {
      debugFinishContract(s);
      while (s.choices.length) dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: s.choices[0].kind === 'c02/office' ? 'keep' : 'continue' });
      seen.push([shopOpen(c) && 'shop', ...openRooms(c).map((r) => r.id), heatOpen(c) && 'heat', routeOpen(c) && 'route'].filter(Boolean).join(','));
    }
    expect(seen).toEqual([
      'shop,dock,workshop',
      'shop,dock,wireRoom,workshop',
      'shop,dock,wireRoom,workshop,shipping',
      'shop,dock,wireRoom,workshop,shipping,heat',
      'shop,dock,wireRoom,workshop,shipping,heat,route',
    ]);
    // Exactly one new thing each time.
    for (let k = 1; k < seen.length; k++) expect(seen[k].split(',').length).toBe(seen[k - 1].split(',').length + 1);
  });

  it('the line runs at the speed of its slowest room, and machines are bought with clips', () => {
    const s = seeded('02');
    const c = b(s);
    debugFinishContract(s);
    dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'keep' });
    debugFinishContract(s);
    expect(slowestRoom(c).id).toBe('wireRoom');
    expect(lineRate(c)).toBe(roomRate(c, 'wireRoom'));
    debugGrant(s, 1000);
    const cost = price(c, 'workshop');
    const before = c.stock;
    expect(dispatch(s, { type: 'c02/buy', room: 'workshop' })).toBeNull();
    expect(c.stock).toBe(before - cost);
    // A machine in a room that is not the slowest does not raise the line.
    expect(lineRate(c)).toBe(roomRate(c, 'wireRoom'));
    dispatch(s, { type: 'c02/buy', room: 'wireRoom' });
    expect(lineRate(c)).toBeGreaterThan(roomRate(c, 'wireRoom') - 1);
    expect(price(c, 'wireRoom')).toBeGreaterThan(room('wireRoom').cost);
    expect(checkInvariant(s)).toBeNull();
  });

  it('an overheated workshop always cools, even running', () => {
    const s = seeded('02');
    const c = b(s);
    c.contractIndex = 4;
    c.levels = { dock: 30, wireRoom: 30, workshop: 30, shipping: 30, fans: 0 };
    c.heatMilli = 79_000;
    c.throttled = false;
    let guard = 0;
    while (!c.throttled && guard++ < 1000) step(s);
    expect(c.throttled).toBe(true);
    guard = 0;
    while (c.throttled && guard++ < 5000) step(s);
    expect(c.throttled).toBe(false);
  });

  it('rush orders pay a bonus when met in time', () => {
    const s = seeded('02');
    const c = b(s);
    debugFinishContract(s);
    dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'keep' });
    debugFinishContract(s);
    c.levels.dock = 5;
    c.nextRushMs = s.simMs + 100;
    run(s, 5);
    expect(c.rush).not.toBeNull();
    expect(dispatch(s, { type: 'c02/rush' })).toBeNull();
    const won = c.rushesWon;
    let guard = 0;
    while (c.rush && guard++ < 1000) step(s);
    expect(c.rushesWon).toBe(won + 1);
  });

  it('keeping the old office folds the clearing offer away, and it can be reopened', () => {
    const s = seeded('02');
    debugFinishContract(s);
    dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'keep' });
    expect(s.flags['c02.officeKept']).toBe(true);
    expect(dispatch(s, { type: 'request', kind: 'reviewOffice' })).toBeNull();
    expect(s.flags['c02.officeKept']).toBe(false);
    expect(dispatch(s, { type: 'request', kind: 'salvage', subject: 'lamp' })).toBeNull();
  });

  it('the demo ends after the building unless the full campaign is asked for', () => {
    const s = seeded('02');
    delete s.flags['campaign.full'];
    for (let k = 0; k < 6; k++) {
      debugFinishContract(s);
      while (s.choices.length) dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: s.choices[0].kind === 'c02/office' ? 'keep' : 'accept' });
    }
    let guard = 0;
    while (s.mode === 'playing' && guard++ < 50) {
      step(s);
      while (s.choices.length) dispatch(s, { type: 'choose', choiceId: s.choices[0].id, option: 'accept' });
    }
    expect(s.mode).toBe('ended');
    expect(s.ending?.kind).toBe('demo');
    expect(s.chapter).toBe('02');
    expect(checkInvariant(s)).toBeNull();
  });

  it('the garden route finishes without demolition', () => {
    const s = autoplay(CANONICAL, '03');
    expect(s.anchors.garden.fidelity).toBe('original');
    expect((s.summaries['02'] as object)).toBeDefined();
  });

  it('the building takes 15–20 minutes for a relaxed player and no less than 10 played hard', () => {
    const relaxed = autoplay(CANONICAL, '03').summaries['02']!.simMs / 60000;
    const engaged = autoplay(EFFICIENT, '03').summaries['02']!.simMs / 60000;
    expect(relaxed).toBeGreaterThanOrEqual(15);
    expect(relaxed).toBeLessThanOrEqual(20);
    expect(engaged).toBeGreaterThanOrEqual(10);
    expect(engaged).toBeLessThan(relaxed);
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
      expect(mass(r.state, 'office.spare')).toBe(OFFICE.spareWire);
      expect(checkInvariant(r.state)).toBeNull();
    }
  });

  it('converts a save from the three-contract building', () => {
    const st = seeded('02');
    (st as unknown as { chapterState: unknown }).chapterState = {
      kind: '02',
      route: 'courtyard',
      directBuilt: false,
      running: true,
      heatMilli: 12_000,
      heatResidue: 0,
      throttled: false,
      contractIndex: 1,
      contractWorkMilli: 10_000,
      cumulativeWorkMilli: 50_000,
      workResidue: 0,
      processedUnits: 50,
      permits: 0,
      upgrades: { wireDraw: true, freight: false, roofCooling: false },
      awaitingInspection: false,
    };
    const r = parse(serialize(st));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      const c = r.state.chapterState as C02State;
      expect(c.contractIndex).toBe(2);
      expect(c.levels.dock).toBe(1);
      expect(c.levels.wireRoom).toBe(1);
      for (let i = 0; i < 50; i++) step(r.state);
      expect(checkInvariant(r.state)).toBeNull();
    }
  });

  it('maps an interim save onto the current upgrades', () => {
    const st = newCampaign();
    const c = st.chapterState as unknown as Record<string, unknown>;
    delete c.reserve;
    delete c.vanCartons;
    c.packShare = 50;
    c.packCredit = 0;
    c.owned = ['calibrate', 'oil', 'feeder', 'die2', 'packer', 'roller', 'fan', 'jig', 'head1'];
    const r = parse(serialize(st));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      const n = r.state.chapterState as C01State;
      expect(n.vanCartons).toBeNull();
      // Upgrades that no longer exist are dropped; the rest carry on.
      expect(n.owned).toEqual(['calibrate', 'oil', 'feeder', 'die2', 'jig']);
      expect(checkInvariant(r.state)).toBeNull();
    }
  });
});
