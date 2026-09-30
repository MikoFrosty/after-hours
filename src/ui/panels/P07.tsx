import { useGameState, act } from '../hooks';
import { COSMIC } from '../../content/campaign';
import type { C07State } from '../../game/types';
import { allDecided, audit, canRecover, CELL_NAMES, recovered, slotsUsed, surveyed, type AuditGroup } from '../../game/chapters/c07';
import { fmtMass } from '../../game/mass';
import { Exact } from '../drawer/LedgerPanel';
import { Bar } from './Panel';

const GROUPS: Array<[AuditGroup, string, string]> = [
  ['original', 'Originals', 'Protected originals. Each requires its own release.'],
  ['archive', 'Records and reconstructions', 'Archives are not their subjects. Each requires its own release.'],
  ['living', 'Living reserve', 'Residents are alive. A record is not their continuation.'],
  ['raw', 'Raw scraps', 'Swept to clip stock at authorization.'],
  ['capital', 'Capital', 'Swept at authorization, except the terminal machine assembled from it.'],
  ['inTransit', 'In transit', 'Must be recovered or delivered before totality.'],
  ['unreached', 'Unreached', 'Must be surveyed and recovered.'],
];

export function P07() {
  const s = useGameState();
  const c = s.chapterState as C07State;
  const used = slotsUsed(c);
  const lines = c.auditRun ? audit(s) : [];
  return (
    <>
      <div className="card">
        <h3>
          Survey and recovery <span className="tag">{used} / {COSMIC.slots} slots</span>
        </h3>
        <div className="list">
          {c.cells.map((cell) => {
            const done = recovered(cell);
            const locked = cell.exotic && s.projects.coupling !== 'complete' && surveyed(cell);
            return (
              <div key={cell.index} className={`item ${done ? 'done' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div className="t small">
                    {cell.index + 1}. {CELL_NAMES[cell.index]} {cell.exotic && <span className="pill" style={{ borderColor: '#8d73dc', color: '#b8a6f0' }}>exotic</span>}
                  </div>
                  <div className="row between tiny muted">
                    <span>Coverage {Math.floor(cell.coverageMilli / 1000)}</span>
                    <span>Recovered {cell.recoveredUnits} / 100</span>
                  </div>
                  <Bar value={cell.coverageMilli} max={COSMIC.coverageTarget} tone="alt" />
                  <div style={{ height: 4 }} />
                  <Bar value={cell.recoveredUnits} max={COSMIC.recoveryTarget} />
                  {locked && <div className="tiny" style={{ color: '#b8a6f0' }}>Recovery requires matter coupling.</div>}
                </div>
                {!done && (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {!surveyed(cell) ? (
                      <div className="stepper" aria-label="Survey slots">
                        <button className="btn small icon" disabled={cell.surveySlots <= 0} onClick={() => act({ type: 'c07/slots', cell: cell.index, role: 'survey', delta: -1 })} aria-label="Fewer survey slots">
                          −
                        </button>
                        <span className="val" title="survey slots">
                          S{cell.surveySlots}
                        </span>
                        <button className="btn small icon" disabled={used >= COSMIC.slots} onClick={() => act({ type: 'c07/slots', cell: cell.index, role: 'survey', delta: 1 })} aria-label="More survey slots">
                          +
                        </button>
                      </div>
                    ) : (
                      <div className="stepper" aria-label="Recovery slots">
                        <button className="btn small icon" disabled={cell.recoverySlots <= 0} onClick={() => act({ type: 'c07/slots', cell: cell.index, role: 'recovery', delta: -1 })} aria-label="Fewer recovery slots">
                          −
                        </button>
                        <span className="val" title="recovery slots">
                          R{cell.recoverySlots}
                        </span>
                        <button className="btn small icon" disabled={used >= COSMIC.slots || !canRecover(s, cell)} onClick={() => act({ type: 'c07/slots', cell: cell.index, role: 'recovery', delta: 1 })} aria-label="More recovery slots">
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Coverage is knowledge, not matter. Recovery removes exactly 1/100 of a cell’s starting stock per unit; the last unit takes the residue.
        </p>
      </div>

      <div className="card">
        <h3>Projects</h3>
        <div className="list">
          <Project
            name="Topology closure"
            effect="Finite global inventory becomes certifiable in the fiction"
            cost={`60 survey work · have ${(c.surveyWorkMilli / 1000).toFixed(0)}`}
            status={s.projects.topology}
            unlock="after 4 surveyed cells"
            can={c.surveyWorkMilli >= 60_000}
            onClick={() => act({ type: 'c07/project', id: 'topology' })}
          />
          <Project
            name="Matter coupling"
            effect="Exposes exotic and collapsed-reservoir recipes (fictional premise)"
            cost={`60 recovery work · have ${(c.recoveryWorkMilli / 1000).toFixed(0)}`}
            status={s.projects.coupling}
            unlock="after 6 surveyed cells"
            can={c.recoveryWorkMilli >= 60_000}
            onClick={() => act({ type: 'c07/project', id: 'coupling' })}
          />
          <Project
            name="Terminal audit"
            effect="Enumerate every remaining protected and operational item"
            cost="a real query across the ledger"
            status={s.projects.terminalAudit}
            unlock="when all ordinary recovery is complete"
            can
            onClick={() => act({ type: 'c07/project', id: 'terminalAudit' })}
          />
        </div>
      </div>

      {c.auditRun && (
        <div className="card">
          <h3>
            Terminal audit <span className="tag">{lines.length} accounts hold non-clip matter</span>
          </h3>
          {GROUPS.map(([g, name, note]) => {
            const ls = lines.filter((l) => l.group === g);
            if (!ls.length) return null;
            const protectedGroup = g === 'original' || g === 'archive' || g === 'living';
            return (
              <div key={g} style={{ marginBottom: 14 }}>
                <div className="t" style={{ fontWeight: 600 }}>
                  {name}
                </div>
                <div className="tiny faint">{note}</div>
                <div className="list" style={{ marginTop: 6 }}>
                  {ls.map((l) => {
                    const d = c.releaseDecisions[l.account.id] ?? 'pending';
                    return (
                      <div key={l.account.id} className={`item ${d === 'release' ? 'done' : ''}`}>
                        <div>
                          <div className="t small">{l.account.label}</div>
                          <div className="d mono">
                            <Exact v={l.account.mass} />
                          </div>
                        </div>
                        {protectedGroup ? (
                          <div className="row" role="group" aria-label={`Decision for ${l.account.label}`}>
                            <span className={`pill ${d === 'keep' ? 'ok' : d === 'release' ? 'bad' : ''}`}>{d === 'pending' ? 'undecided' : d === 'keep' ? 'kept' : 'released'}</span>
                            {d !== 'release' && (
                              <>
                                <button className="btn small" aria-pressed={d === 'keep'} onClick={() => act({ type: 'c07/decide', account: l.account.id, decision: 'keep' })}>
                                  Keep
                                </button>
                                <button className="btn small danger" onClick={() => act({ type: 'c07/decide', account: l.account.id, decision: 'release' })}>
                                  {g === 'living' ? 'Review…' : 'Release…'}
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="mono tiny faint">{fmtMass(l.account.mass)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={!allDecided(s) || s.messages.length > 0 || s.choices.length > 0} onClick={() => act({ type: 'request', kind: 'authorize' })}>
              Terminal authorization…
            </button>
            {!allDecided(s) && <span className="small muted">Resolve every protected item first. Nothing is preselected.</span>}
          </div>
        </div>
      )}
    </>
  );
}

function Project({ name, effect, cost, status, unlock, can, onClick }: { name: string; effect: string; cost: string; status: string; unlock: string; can: boolean; onClick: () => void }) {
  return (
    <div className={`item ${status === 'complete' ? 'done' : status === 'available' ? 'highlight' : ''}`}>
      <div>
        <div className="t">{name}</div>
        <div className="d">
          {effect} · {status === 'locked' ? unlock : cost}
        </div>
      </div>
      {status === 'complete' ? (
        <span className="pill ok">Complete</span>
      ) : (
        <button className="btn small" disabled={status !== 'available' || !can} onClick={onClick}>
          {name === 'Terminal audit' ? 'Run' : 'Spend'}
        </button>
      )}
    </div>
  );
}
