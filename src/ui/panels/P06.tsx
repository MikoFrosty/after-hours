import { useState } from 'react';
import { useGameState, act } from '../hooks';
import { REMOTE } from '../../content/campaign';
import type { C06State, Policy, RegionId } from '../../game/types';
import { REGIONS } from '../../game/types';
import { adriftKits, label, outEdges, pathDelay } from '../../game/chapters/c06';

const POLICIES: Array<[Policy, string]> = [
  ['steward', 'Steward · rate 1.0 · retains protection'],
  ['balanced', 'Balanced · rate 1.5 · reserves 20% support'],
  ['extractor', 'Extractor · rate 2.0 · mandatory habitat support only'],
];

export function P06() {
  const s = useGameState();
  const c = s.chapterState as C06State;
  const [policy, setPolicy] = useState<Policy>('steward');
  const R = s.regions;
  const r = R[c.focus];
  const k = r.known;
  const isOrigin = c.focus === 'origin';
  const receipts = REGIONS.filter((x) => R[x].initialReceipt).length;
  const outbound = s.messages.filter((m) => m.from === 'origin').sort((a, b) => a.deliverAtMs - b.deliverAtMs);
  const awaiting = REGIONS.filter((x) => s.flags[`pending.${x}`] && !R[x].known.settled);
  const adrift = adriftKits(s).length;
  return (
    <>
      <div className="card">
        <h3>
          Distant offices <span className="tag">{receipts} of 6 receipts</span>
        </h3>
        <div className="row" role="tablist" aria-label="Regions">
          {REGIONS.map((x) => (
            <button key={x} role="tab" aria-selected={x === c.focus} className="btn small" aria-pressed={x === c.focus} onClick={() => act({ type: 'c06/focus', region: x })}>
              {label(x)}
            </button>
          ))}
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          The map shows last-known state. Nothing here changes until evidence arrives. One-way delay from origin to {label(c.focus)}: {pathDelay(c.focus) / 1000} s.
        </p>
      </div>

      <div className="card">
        <h3>
          {label(c.focus)} <span className="tag">{k.settled ? (isOrigin ? 'local' : `as of ${k.asOfMs === null ? '—' : Math.round((s.simMs - k.asOfMs) / 1000)} s ago`) : s.flags[`pending.${c.focus}`] ? 'awaiting receipt' : 'unknown'}</span>
        </h3>
        {k.settled ? (
          <table className="ledger-table">
            <tbody>
              <tr>
                <td>Policy</td>
                <td className="num">
                  {k.policy} v{k.policyVersion}
                </td>
              </tr>
              <tr>
                <td>Local work (last report)</td>
                <td className="num">{(k.localWorkMilli / 1000).toFixed(1)}</td>
              </tr>
              <tr>
                <td>Kits (last report)</td>
                <td className="num">{k.kits}</td>
              </tr>
              {c.focus === 'C' && (
                <tr>
                  <td>World below</td>
                  <td className="num">{s.anchors.cworld.protected ? 'protected' : 'protection removed'} · inhabited</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="small muted">No receipt. Its current state is not known here.</div>
        )}
      </div>

      {k.settled && (
        <div className="card">
          <h3>Standing orders</h3>
          <div className="list" role="radiogroup" aria-label="Policy frozen into a new seed">
            {POLICIES.map(([p, text]) => (
              <label key={p} className={`item ${policy === p ? 'highlight' : ''}`}>
                <span className="small">{text}</span>
                <input type="radio" name="policy" checked={policy === p} onChange={() => setPolicy(p)} style={{ width: 22, height: 22 }} />
              </label>
            ))}
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {outEdges(c.focus).map((e) => {
              const target = e.to as RegionId;
              const known = R[target].known.settled;
              const pend = Boolean(s.flags[`pending.${target}`]);
              return (
                <div key={e.id} className="item">
                  <div>
                    <div className="t">
                      Expand → {label(target)} <span className="faint mono small">edge {e.delayMs / 1000}s</span>
                    </div>
                    <div className="d">
                      {known
                        ? 'Settled.'
                        : pend
                          ? 'A launch is unacknowledged.'
                          : `${isOrigin ? 'Survey 10 s, then launch' : `Order arrives in ${pathDelay(c.focus) / 1000} s; survey 10 s; assemble a kit at 60 local work; launch`}. Travel ${(e.delayMs * REMOTE.travelMultiplier) / 1000} s. Receipt after ${pathDelay(target) / 1000} s more.`}
                    </div>
                  </div>
                  <button className="btn small" disabled={known || pend} onClick={() => act({ type: 'c06/expand', from: c.focus, target, policy })}>
                    Send
                  </button>
                </div>
              );
            })}
            {!isOrigin && (
              <div className="item">
                <div>
                  <div className="t">Revise policy → {policy}</div>
                  <div className="d">Arrives in {pathDelay(c.focus) / 1000} s. Confirmation returns {pathDelay(c.focus) / 1000} s later. Nothing changes there before arrival.</div>
                </div>
                <button className="btn small" disabled={Boolean(s.flags[`pendingRev.${c.focus}`]) || k.policy === policy || s.projects.commandQueue !== 'complete'} onClick={() => act({ type: 'c06/revise', region: c.focus, policy })}>
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {adrift > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h3>Kit adrift</h3>
          <div className="small">A seed kit lost guidance at midcourse. It is intact and still on the ledger as in transit.</div>
          <button className="btn small" style={{ marginTop: 8 }} disabled={R.origin.localWorkMilli < REMOTE.recoverWork || Object.keys(s.flags).some((f) => f.startsWith('recovering.'))} onClick={() => act({ type: 'c06/recover', region: 'origin' })}>
            Recover kit · 10 origin work
          </button>
        </div>
      )}

      <div className="card">
        <h3>Queues</h3>
        <div className="tiny faint mono">OUTBOUND</div>
        {outbound.length === 0 ? (
          <div className="small muted">Nothing in flight.</div>
        ) : (
          outbound.map((m) => (
            <div key={m.id} className="row between small">
              <span>
                {m.kind === 'command' ? 'Order' : m.kind === 'amendment' ? 'Amendment' : m.kind === 'revision' ? `Revision → ${m.policy}` : m.kind} to {label(m.to)}
              </span>
              <span className="mono">arrives in {Math.max(0, Math.ceil((m.deliverAtMs - s.simMs) / 1000))} s</span>
            </div>
          ))
        )}
        <div className="tiny faint mono" style={{ marginTop: 8 }}>
          AWAITING EVIDENCE
        </div>
        {awaiting.length === 0 && !Object.keys(s.flags).some((f) => f.startsWith('pendingRev.')) && !(c.amendmentSent && !c.forkResolved) ? (
          <div className="small muted">No acknowledgements outstanding.</div>
        ) : (
          <>
            {awaiting.map((x) => (
              <div key={x} className="small">
                Receipt from {label(x)} · arrival time unknown
              </div>
            ))}
            {REGIONS.filter((x) => s.flags[`pendingRev.${x}`]).map((x) => (
              <div key={x} className="small">
                Revision confirmation from {label(x)}
              </div>
            ))}
            {c.amendmentSent && !c.forkResolved && <div className="small">Amendment receipt from region C</div>}
          </>
        )}
      </div>

      {c.forkReceived && (
        <div className="card">
          <h3>Fork at region C</h3>
          <div className="small">
            {c.forkResolution === null && 'Awaiting your decision.'}
            {c.forkResolution === 'ratify' && 'Protection ratified. Lower production accepted.'}
            {c.forkResolution === 'supersede' && (c.forkResolved ? 'Amendment received. Protection flag removed. Residents unharmed.' : 'A revised charter has been sent. It has not yet arrived.')}
          </div>
        </div>
      )}

      {s.consumedEventIds.includes('c06.charter') && !s.charters.skySurvey && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter' })}>
          Review sky-survey charter
        </button>
      )}
    </>
  );
}
