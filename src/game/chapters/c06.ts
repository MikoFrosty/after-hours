import { ENVELOPES, REMOTE, SOLAR, beat } from '../../content/campaign';
import { FORK, LETTERS } from '../../content/narrative';
import { CWORLD_MASS } from '../../content/world';
import { accrue, mulMilli } from '../fixed';
import { makeClips, mass, mustCommit, openAccount } from '../ledger';
import { minBig } from '../mass';
import { log, once } from '../state';
import type { Controller } from '../engine';
import { ask, beatNow, bump, emit, hold } from '../engine';
import type { C06State, CampaignState, MessageKind, Policy, RegionId, RegionKnowledge, RegionState, ScheduledMessage } from '../types';
import { REGIONS } from '../types';

const cs = (s: CampaignState) => s.chapterState as C06State;
const REPORT_EVERY_MS = 15_000;

export function edge(from: RegionId, to: RegionId) {
  return REMOTE.edges.find((e) => e.from === from && e.to === to);
}

export function outEdges(from: RegionId) {
  return REMOTE.edges.filter((e) => e.from === from);
}

/** One-way signal delay from origin to a region along the shortest path. */
export function pathDelay(target: RegionId): number {
  const dist: Record<string, number> = { origin: 0 };
  const done = new Set<string>();
  while (done.size < REGIONS.length) {
    let u: string | null = null;
    for (const r of REGIONS) if (!done.has(r) && dist[r] !== undefined && (u === null || dist[r] < dist[u])) u = r;
    if (u === null) break;
    done.add(u);
    for (const e of REMOTE.edges) {
      const v = e.from === u ? e.to : e.to === u ? e.from : null;
      if (v && (dist[v] === undefined || dist[u] + e.delayMs < dist[v])) dist[v] = dist[u] + e.delayMs;
    }
  }
  return dist[target] ?? 0;
}

export const supplyOf = (r: RegionId) => (r === 'origin' ? 'solar.supply' : `${r}.supply`);
export const kitsOf = (r: RegionId) => (r === 'origin' ? 'origin.kits' : `${r}.kits`);

export function snapshot(s: CampaignState, r: RegionState): RegionKnowledge {
  return {
    settled: r.settled,
    policy: r.policy,
    policyVersion: r.policyVersion,
    localWorkMilli: r.localWorkMilli,
    kits: r.kits,
    asOfMs: s.simMs,
    protected: r.worldProtected,
  };
}

export function localRate(s: CampaignState, r: RegionState): number {
  if (!r.settled || !r.policy) return 0;
  const base = REMOTE.policyRates[r.policy];
  const c = s.chapterState.kind === '06' ? cs(s) : null;
  if (r.id === REMOTE.forkRegion && c?.forkResolution === 'ratify') return mulMilli(base, 500);
  return base;
}

export function send(
  s: CampaignState,
  kind: MessageKind,
  from: RegionId,
  to: RegionId,
  delayMs: number,
  extra: Partial<ScheduledMessage> = {},
): ScheduledMessage {
  s.seq += 1;
  const m: ScheduledMessage = {
    id: `msg.${String(s.seq).padStart(7, '0')}`,
    kind,
    from,
    to,
    sentAtMs: s.simMs,
    deliverAtMs: s.simMs + delayMs,
    ...extra,
  };
  s.messages.push(m);
  return m;
}

export function adriftKits(s: CampaignState): string[] {
  return Object.values(s.ledger.accounts)
    .filter((a) => a.cat === 'inTransit' && a.mass > 0n)
    .map((a) => a.id);
}

/** Deliver due messages in timestamp then ID order. Duplicate delivery is idempotent. */
export function deliverMessages(s: CampaignState): void {
  if (s.messages.length === 0) return;
  const due = s.messages.filter((m) => m.deliverAtMs <= s.simMs).sort((a, b) => a.deliverAtMs - b.deliverAtMs || (a.id < b.id ? -1 : 1));
  if (due.length === 0) return;
  const dueIds = new Set(due.map((m) => m.id));
  s.messages = s.messages.filter((m) => !dueIds.has(m.id));
  for (const m of due) {
    if (s.consumedEventIds.includes(m.id)) continue;
    s.consumedEventIds.push(m.id);
    handle(s, m);
    emit({ type: 'save', reason: 'message' });
  }
}

function handle(s: CampaignState, m: ScheduledMessage): void {
  const R = s.regions;
  const c = s.chapterState.kind === '06' ? cs(s) : null;
  switch (m.kind) {
    case 'command': {
      const r = R[m.to];
      if (!r.orders.some((o) => o.id === m.orderId)) {
        r.orders.push({ id: m.orderId!, kind: 'expand', edge: m.edge, target: m.target, policy: m.policy, stage: 'queued', surveyMs: 0 });
      }
      return;
    }
    case 'seedArrival': {
      const t = R[m.to];
      const transit = `transit.${m.orderId}`;
      if (c && !c.failureAuthored && m.to === 'B') {
        // Deterministic authored failure: the kit is intact and drifting; nothing is deleted.
        c.failureAuthored = true;
        s.flags[`adrift.${m.orderId}`] = m.from;
        send(s, 'failure', m.to, 'origin', pathDelay(m.to), { orderId: m.orderId, target: m.to });
        return;
      }
      if (t.settled) {
        // Target was reached by another route: the kit joins local stock rather than disappearing.
        openAccount(s, kitsOf(t.id), 'capital', 'kit', `Seed kits · ${t.id}`, t.id);
        mustCommit(s, { id: `arrive.${m.orderId}`, from: transit, input: mass(s, transit), outputs: [[kitsOf(t.id), mass(s, transit)]] });
        t.kits += 1;
        return;
      }
      openAccount(s, `${t.id}.capital`, 'capital', 'machine', `Local office · ${t.id}`, t.id);
      mustCommit(s, { id: `settle.${t.id}`, from: transit, input: mass(s, transit), outputs: [[`${t.id}.capital`, mass(s, transit)]] });
      t.settled = true;
      t.settledAtMs = s.simMs;
      t.policy = m.policy!;
      t.policyVersion = m.policyVersion ?? 1;
      t.localWorkMilli = 0;
      send(s, 'receipt', t.id, 'origin', pathDelay(t.id) * REMOTE.receiptMultiplier, { snapshot: snapshot(s, t) });
      return;
    }
    case 'launchReport': {
      log(s, {
        id: `report.launch.${m.orderId}`,
        kind: 'report',
        title: `Report from ${label(m.from)}`,
        text: `Seed launched toward ${label(m.target!)}. Sent ${fmtAgo(s, m.sentAtMs)}.`,
      });
      bump(s);
      return;
    }
    case 'receipt': {
      const r = R[m.from];
      r.known = { ...m.snapshot! };
      if (!r.initialReceipt) {
        r.initialReceipt = true;
        delete s.flags[`pending.${r.id}`];
        s.projects.commandQueue = 'complete';
        const n = REGIONS.filter((x) => R[x].initialReceipt).length;
        log(s, {
          id: `receipt.${r.id}`,
          kind: 'report',
          title: `Initial receipt · ${label(r.id)}`,
          text: `Settlement confirmed under ${r.known.policy} policy (v${r.known.policyVersion}). This report was sent ${fmtAgo(s, m.sentAtMs)}. ${n} of 6 receipts.`,
        });
        const [bt, bx] = beat('06', 0);
        beatNow(s, '06', 0, bt, bx);
        emit({ type: 'sound', id: 'receipt' });
        if (r.id === REMOTE.forkRegion && c && !c.forkReceived) {
          c.forkReceived = true;
          const L = LETTERS.forkRegistrar;
          log(s, { id: 'fork.letter', kind: 'letter', title: 'Charter reconciliation', text: FORK.letter, author: 'Region C local office', dateline: `Fork report · sent ${fmtAgo(s, m.sentAtMs)}` });
          log(s, { id: L.id, kind: 'letter', title: L.title, text: L.text, author: L.author, dateline: L.dateline });
          const [ft, fx] = beat('06', 1);
          beatNow(s, '06', 1, ft, fx);
          s.flags['reflection.instruction'] = true;
          ask(s, { id: 'c06.fork', kind: 'c06/fork', subject: 'C', checkpoint: true, data: { checkpointLabel: 'Before: fork at region C' } });
        }
        if (n === REGIONS.length) {
          const L = LETTERS.lateReceipt;
          log(s, { id: L.id, kind: 'letter', title: L.title, text: L.text, author: L.author, dateline: L.dateline });
          const [lt, lx] = beat('06', 2);
          beatNow(s, '06', 2, lt, lx);
        }
      }
      bump(s);
      return;
    }
    case 'report': {
      const r = R[m.from];
      if (!r.known.asOfMs || (m.snapshot!.asOfMs ?? 0) > r.known.asOfMs) r.known = { ...m.snapshot! };
      return;
    }
    case 'revision': {
      const r = R[m.to];
      if ((m.policyVersion ?? 0) > r.policyVersion) {
        r.policy = m.policy!;
        r.policyVersion = m.policyVersion!;
      }
      send(s, 'revisionConfirm', r.id, 'origin', pathDelay(r.id), { snapshot: snapshot(s, r), policyVersion: r.policyVersion });
      return;
    }
    case 'revisionConfirm': {
      const r = R[m.from];
      r.known = { ...m.snapshot! };
      delete s.flags[`pendingRev.${r.id}`];
      log(s, { id: `confirm.${m.id}`, kind: 'report', title: `Revision confirmed · ${label(r.id)}`, text: `Now operating under ${r.known.policy} (v${r.known.policyVersion}). Sent ${fmtAgo(s, m.sentAtMs)}.` });
      bump(s);
      return;
    }
    case 'amendment': {
      const r = R[m.to];
      r.worldProtected = false;
      s.anchors.cworld.protected = false;
      s.anchors.cworld.evidence.push('charter protection superseded, Act 6');
      send(s, 'amendmentReceipt', r.id, 'origin', pathDelay(r.id), { snapshot: snapshot(s, r) });
      return;
    }
    case 'amendmentReceipt': {
      R[m.from].known = { ...m.snapshot! };
      if (c) c.forkResolved = true;
      log(s, {
        id: 'fork.amendment.receipt',
        kind: 'report',
        title: 'Amendment received at region C',
        text: 'The protection flag has been removed. The residents are unharmed. Their living status still requires an explicit release before any liquidation.',
      });
      bump(s);
      return;
    }
    case 'failure': {
      log(s, {
        id: `failure.${m.orderId}`,
        kind: 'report',
        title: `Seed toward ${label(m.target!)} lost guidance`,
        text: 'The kit is intact and drifting at midcourse. It remains in transit on the ledger. Recovery costs 10 local work at origin and returns it after one edge delay.',
      });
      emit({ type: 'sound', id: 'throttle' });
      delete s.flags[`pending.${m.target}`];
      bump(s);
      return;
    }
    case 'kitReturn': {
      const transit = `transit.${m.orderId}`;
      mustCommit(s, { id: `return.${m.orderId}`, from: transit, input: mass(s, transit), outputs: [['origin.kits', mass(s, transit)]] });
      R.origin.kits += 1;
      R.origin.known.kits = R.origin.kits;
      delete s.flags[`adrift.${m.orderId}`];
      delete s.flags[`recovering.${m.orderId}`];
      log(s, { id: `return.${m.orderId}`, kind: 'report', title: 'Kit recovered', text: 'The drifting kit is back in origin stock.' });
      bump(s);
      return;
    }
    default:
      return;
  }
}

export const label = (r: RegionId) => (r === 'origin' ? 'Origin' : `Region ${r}`);

function fmtAgo(s: CampaignState, sentAt: number): string {
  const sec = Math.round((s.simMs - sentAt) / 1000);
  return sec <= 0 ? 'just now' : `${sec} s ago`;
}

function stepRegion(s: CampaignState, r: RegionState, dt: number): void {
  if (!r.settled) return;
  const rate = localRate(s, r);
  const [g, res] = accrue(rate, dt, r.residue);
  r.residue = res;
  r.localWorkMilli += g;
  r.cumulativeMilli += g;
  const units = Math.floor(r.cumulativeMilli / 1000);
  while (r.processedUnits < units) {
    r.processedUnits += 1;
    const input = minBig(ENVELOPES['06'].batch, mass(s, supplyOf(r.id)));
    if (input <= 0n) break;
    makeClips(s, `c06.batch.${r.id}`, supplyOf(r.id), input);
  }
  const order = r.orders.find((o) => o.stage !== 'done' && o.stage !== 'failed');
  if (!order || order.kind !== 'expand') return;
  const e = REMOTE.edges.find((x) => x.id === order.edge)!;
  if (order.stage === 'queued') order.stage = r.surveyedEdges.includes(e.id) ? 'awaitingWork' : 'surveying';
  if (order.stage === 'surveying') {
    order.surveyMs += dt;
    if (order.surveyMs >= REMOTE.surveyMs) {
      r.surveyedEdges.push(e.id);
      order.stage = 'awaitingWork';
    }
    return;
  }
  if (order.stage === 'awaitingWork') {
    const target = s.regions[order.target!];
    if (target.settled) {
      order.stage = 'failed';
      return;
    }
    if (r.kits === 0) {
      if (r.localWorkMilli < REMOTE.seedBuildWork) return;
      if (mass(s, supplyOf(r.id)) < SOLAR.seedKitMass) return;
      r.localWorkMilli -= REMOTE.seedBuildWork;
      openAccount(s, kitsOf(r.id), 'capital', 'kit', `Seed kits · ${r.id}`, r.id);
      mustCommit(s, { id: `kit.${order.id}`, from: supplyOf(r.id), input: SOLAR.seedKitMass, outputs: [[kitsOf(r.id), SOLAR.seedKitMass]] });
      r.kits += 1;
    }
    const transit = `transit.${order.id}`;
    openAccount(s, transit, 'inTransit', 'kit', `Seed in transit → ${order.target}`, 'transit');
    const kitMass = mass(s, kitsOf(r.id)) / BigInt(r.kits);
    mustCommit(s, { id: `launch.${order.id}`, from: kitsOf(r.id), input: kitMass, outputs: [[transit, kitMass]] });
    r.kits -= 1;
    order.stage = 'done';
    send(s, 'seedArrival', r.id, order.target!, e.delayMs * REMOTE.travelMultiplier, {
      orderId: order.id,
      policy: order.policy,
      policyVersion: 1,
      edge: e.id,
    });
    if (r.id !== 'origin') send(s, 'launchReport', r.id, 'origin', pathDelay(r.id), { orderId: order.id, target: order.target });
    else {
      r.known = snapshot(s, r);
      log(s, { id: `launch.${order.id}`, kind: 'report', title: 'Seed launched', text: `Origin launched a seed toward ${label(order.target!)} under ${order.policy} policy. Arrival in ${(e.delayMs * REMOTE.travelMultiplier) / 1000} s; receipt after one further delay.` });
      emit({ type: 'sound', id: 'launch' });
      bump(s);
    }
  }
}

export const c06: Controller = {
  id: '06',
  storyScale: (10_000_000 * 31_557_600) / 1000, // ten million story years per simulated second

  enter(s) {
    s.chapterState = {
      kind: '06',
      focus: 'origin',
      failureAuthored: false,
      nextReportMs: s.simMs + REPORT_EVERY_MS,
      forkReceived: false,
      forkResolution: null,
      forkResolved: false,
      amendmentSent: false,
    };
    // Disjoint regional grants; no nested double counting.
    const remote = REGIONS.filter((r) => r !== 'origin');
    const share = ENVELOPES['06'].grant / BigInt(remote.length);
    const outputs: Array<[string, bigint]> = [];
    let allocated = 0n;
    remote.forEach((r, i) => {
      openAccount(s, `${r}.supply`, 'raw', 'feedstock', `Region ${r} supply`, r);
      const part = i === remote.length - 1 ? ENVELOPES['06'].grant - allocated : share;
      allocated += part;
      if (r === REMOTE.forkRegion) {
        openAccount(s, 'C.world', 'livingProtected', 'living', 'World below region C', 'C', { protected: true, anchor: 'cworld' });
        outputs.push([`${r}.supply`, part - CWORLD_MASS], ['C.world', CWORLD_MASS]);
      } else outputs.push([`${r}.supply`, part]);
    });
    mustCommit(s, { id: 'grant.06', from: 'unreached', input: ENVELOPES['06'].grant, outputs });
    Object.assign(s.anchors.cworld, {
      fidelity: 'original',
      originalLocation: 'World below region C',
      currentLocation: 'World below region C',
      originalMassAccount: 'C.world',
      living: true,
      alive: true,
      protected: true,
      evidence: ['disclosed Act 6'],
    });
    // Origin starts settled with three kits from Act 5 and a steward policy.
    openAccount(s, 'origin.kits', 'capital', 'kit', 'Seed kits · origin', 'origin');
    mustCommit(s, { id: 'c06.kits.origin', from: 'solar.kits', input: mass(s, 'solar.kits'), outputs: [['origin.kits', mass(s, 'solar.kits')]] });
    const o = s.regions.origin;
    o.settled = true;
    o.settledAtMs = s.simMs;
    o.policy = 'steward';
    o.policyVersion = 1;
    o.kits = Number(mass(s, 'origin.kits') / SOLAR.seedKitMass);
    o.initialReceipt = true;
    o.known = snapshot(s, o);
    log(s, { id: 'receipt.origin', kind: 'report', title: 'Initial receipt · Origin', text: 'Local startup confirmed under steward policy (v1). 1 of 6 receipts.' });
  },

  step(s, dt) {
    const c = cs(s);
    for (const id of REGIONS) stepRegion(s, s.regions[id], dt);
    // Origin knows its own state immediately.
    s.regions.origin.known = snapshot(s, s.regions.origin);
    if (s.simMs >= c.nextReportMs) {
      c.nextReportMs = s.simMs + REPORT_EVERY_MS;
      for (const id of REGIONS) {
        const r = s.regions[id];
        if (id !== 'origin' && r.settled && r.initialReceipt) send(s, 'report', id, 'origin', pathDelay(id), { snapshot: snapshot(s, r) });
      }
    }
  },

  events(s) {
    const c = cs(s);
    const R = s.regions;
    const ready = REGIONS.every((r) => R[r].settled && R[r].initialReceipt) && c.forkResolved;
    if (ready && adriftKits(s).length === 0 && !s.charters.skySurvey && once(s, 'c06.charter')) {
      ask(s, { id: 'c06.charter', kind: 'charter', subject: 'skySurvey', checkpoint: true, data: { checkpointLabel: 'Before: sky-survey charter' } });
    }
  },

  act(s, a) {
    const c = cs(s);
    const R = s.regions;
    switch (a.type) {
      case 'c06/focus':
        c.focus = a.region;
        return null;
      case 'c06/expand': {
        const from = R[a.from];
        const e = edge(a.from, a.target);
        if (!e) return 'No such route.';
        if (a.from !== 'origin' && !from.known.settled) return 'No receipt from that region yet.';
        if (a.from !== 'origin' && s.projects.commandQueue !== 'complete') return 'Delayed command queue not yet available.';
        if (R[a.target].known.settled) return 'Already settled.';
        if (s.flags[`pending.${a.target}`]) return 'A launch toward that region is still unacknowledged.';
        s.seq += 1;
        const orderId = `order.${s.seq}`;
        s.flags[`pending.${a.target}`] = orderId;
        if (a.from === 'origin') {
          from.orders.push({ id: orderId, kind: 'expand', edge: e.id, target: a.target, policy: a.policy, stage: 'queued', surveyMs: 0 });
        } else {
          send(s, 'command', 'origin', a.from, pathDelay(a.from), { orderId, edge: e.id, target: a.target, policy: a.policy });
        }
        log(s, {
          id: `cmd.${orderId}`,
          kind: 'system',
          title: 'Order sent',
          text:
            a.from === 'origin'
              ? `Origin: survey ${e.id} and launch toward ${label(a.target)} (${a.policy}).`
              : `To ${label(a.from)}: survey, assemble a kit and launch toward ${label(a.target)} (${a.policy}). Arrives in ${pathDelay(a.from) / 1000} s.`,
        });
        emit({ type: 'sound', id: 'send' });
        emit({ type: 'save', reason: 'order' });
        bump(s);
        return null;
      }
      case 'c06/revise': {
        const r = R[a.region];
        if (!r.known.settled) return 'No receipt from that region yet.';
        if (s.projects.commandQueue !== 'complete' && a.region !== 'origin') return 'Delayed command queue not yet available.';
        if (s.flags[`pendingRev.${a.region}`]) return 'One revision per region may be in flight.';
        const v = Number(s.flags[`pv.${a.region}`] ?? r.known.policyVersion) + 1;
        s.flags[`pv.${a.region}`] = v;
        if (a.region === 'origin') {
          r.policy = a.policy;
          r.policyVersion = v;
          r.known = snapshot(s, r);
          return null;
        }
        s.flags[`pendingRev.${a.region}`] = true;
        send(s, 'revision', 'origin', a.region, pathDelay(a.region), { policy: a.policy, policyVersion: v });
        log(s, { id: `rev.${a.region}.${v}`, kind: 'system', title: 'Revision sent', text: `${label(a.region)} → ${a.policy} (v${v}). It changes nothing there until it arrives in ${pathDelay(a.region) / 1000} s.` });
        emit({ type: 'sound', id: 'send' });
        bump(s);
        return null;
      }
      case 'c06/recover': {
        const adrift = Object.keys(s.flags).filter((k) => k.startsWith('adrift.') && !s.flags[`recovering.${k.slice(7)}`]);
        if (adrift.length === 0) return 'Nothing to recover.';
        const o = R.origin;
        if (o.localWorkMilli < REMOTE.recoverWork) return 'Requires 10 local work at origin.';
        o.localWorkMilli -= REMOTE.recoverWork;
        const orderId = adrift[0].slice(7);
        s.flags[`recovering.${orderId}`] = true;
        const e = edge('origin', 'B')!;
        send(s, 'kitReturn', 'B', 'origin', e.delayMs, { orderId });
        log(s, { id: `recover.${orderId}`, kind: 'system', title: 'Recovery underway', text: `Kit returns to origin in ${e.delayMs / 1000} s.` });
        bump(s);
        return null;
      }
      case 'request':
        if (a.kind === 'charter') {
          if (!s.consumedEventIds.includes('c06.charter') || s.charters.skySurvey) return 'Not yet offered.';
          ask(s, { id: `c06.charter.${s.seq++}`, kind: 'charter', subject: 'skySurvey', checkpoint: true, data: { checkpointLabel: 'Before: sky-survey charter' } });
          return null;
        }
        return 'Unknown request';
      default:
        return 'Not available in this chapter.';
    }
  },

  choose(s, choice, option) {
    const c = cs(s);
    if (choice.kind === 'c06/fork') {
      if (option === 'ratify') {
        c.forkResolution = 'ratify';
        c.forkResolved = true;
        s.regions.C.worldProtected = true;
        s.anchors.cworld.protected = true;
        s.anchors.cworld.evidence.push('protection ratified, Act 6');
        log(s, { id: 'fork.ratify', kind: 'report', title: 'Fork reconciled', text: FORK.ratify });
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'supersede') {
        ask(s, { id: 'c06.supersede', kind: 'c06/supersede', subject: 'C', checkpoint: true, data: { checkpointLabel: 'Before: supersede charter C', delay: pathDelay('C') / 1000 } });
      }
      bump(s);
      return;
    }
    if (choice.kind === 'c06/supersede') {
      if (option !== 'confirm') {
        ask(s, { id: `c06.fork.${s.seq++}`, kind: 'c06/fork', subject: 'C', checkpoint: false });
        return;
      }
      c.forkResolution = 'supersede';
      c.amendmentSent = true;
      send(s, 'amendment', 'origin', 'C', pathDelay('C'), { policyVersion: Number(s.flags['pv.C'] ?? 1) + 1 });
      log(s, { id: 'fork.supersede', kind: 'report', title: 'Superseding charter sent', text: FORK.supersede });
      emit({ type: 'sound', id: 'send' });
      bump(s);
      return;
    }
    if (choice.kind === 'charter') {
      if (option === 'accept') {
        s.charters.skySurvey = true;
        emit({ type: 'sound', id: 'charter' });
      } else if (option === 'decline') hold(s, 'protected');
    }
  },

  guard(s) {
    const c = cs(s);
    const R = s.regions;
    return REGIONS.every((r) => R[r].settled && R[r].initialReceipt) && c.forkResolved && s.charters.skySurvey;
  },
};

export function knownPolicyFor(s: CampaignState, r: RegionId): Policy | null {
  return s.regions[r].known.policy;
}
