import { useGameState, act } from '../hooks';
import { CITY } from '../../content/campaign';
import { DISTRICTS } from '../../content/world';
import type { C03State } from '../../game/types';
import { met, reserveRate } from '../../game/chapters/c03';
import { Bar } from './Panel';

export function P03() {
  const s = useGameState();
  const c = s.chapterState as C03State;
  const industry = c.alloc[3];
  const nextProject = s.projects.heatReuse !== 'complete' ? 'heatReuse' : s.projects.transit !== 'complete' ? 'transit' : null;
  return (
    <>
      <div className="card">
        <h3>
          Power allocation <span className="tag">{CITY.budget} units</span>
        </h3>
        <div className="list">
          {DISTRICTS.map((d, i) => {
            const score = c.scoresMilli[i] / 1000;
            return (
              <div key={d} className={`item ${met(c, i) ? '' : 'highlight'}`} style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div className="row between">
                    <span className="t">{d}</span>
                    <span className="mono small">
                      {c.alloc[i]} / needs {c.demand[i]} {met(c, i) ? '✓' : '✕ unmet'}
                    </span>
                  </div>
                  <div className="row between tiny muted" style={{ marginTop: 4 }}>
                    <span>Service availability</span>
                    <span className="mono">{score.toFixed(0)}</span>
                  </div>
                  <Bar value={c.scoresMilli[i]} max={100_000} marks={[30_000, 80_000, 90_000]} tone={score < 30 ? 'danger' : 'alt'} />
                </div>
                <div className="stepper" role="group" aria-label={`${d} power`}>
                  <button className="btn small icon" disabled={c.alloc[i] <= 0} onClick={() => act({ type: 'c03/shift', from: i, to: 3 })} aria-label={`Move one unit from ${d} to industry`}>
                    −
                  </button>
                  <span className="val">{c.alloc[i]}</span>
                  <button className="btn small icon" disabled={industry <= 0} onClick={() => act({ type: 'c03/shift', from: 3, to: i })} aria-label={`Move one unit from industry to ${d}`}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <div className="item">
            <div>
              <div className="t">Industry</div>
              <div className="d">Leftover units. Zero industry is legal and reversible.</div>
            </div>
            <span className="val mono" style={{ fontSize: '1.3em' }}>
              {industry}
            </span>
          </div>
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Scores rise 1/s when demand is met and fall 2/s when it is not. They measure service availability, not wellbeing.
        </p>
      </div>

      <div className="card">
        <h3>
          Reserve production <span className="tag">{(reserveRate(c) / 1000).toFixed(2)}/s</span>
        </h3>
        <div className="row between small">
          <span>Certified reserve work</span>
          <span className="mono">
            {(c.reserveMilli / 1000).toFixed(1)} / {CITY.milestones[2] / 1000}
          </span>
        </div>
        <Bar value={c.reserveMilli} max={CITY.milestones[2]} marks={CITY.milestones.slice(0, 2)} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Earned at industry × 0.25 while every district is at 80 or above
          {c.consultation === 'retained' ? ', × 0.90 under public consultation' : ''}. Permits at 60 and 160.{' '}
          {c.safetyThrottle && <strong style={{ color: 'var(--danger)' }}>Safety throttle: certification paused. Services continue.</strong>}
        </p>
        <div className="row between small" style={{ marginTop: 8 }}>
          <span className="muted">All districts ≥ 90 for</span>
          <span className="mono">
            {Math.floor(c.stableMs / 1000)} / {CITY.exitStableMs / 1000} s
          </span>
        </div>
      </div>

      <div className="card">
        <h3>
          City permits <span className="tag">{c.permits} available</span>
        </h3>
        {nextProject ? (
          <>
            <div className="small" style={{ marginBottom: 8 }}>
              {nextProject === 'heatReuse' ? 'Heat reuse' : 'Transit coordination'}: one district’s demand 2 → 1.
            </div>
            <div className="row">
              {DISTRICTS.map((d, i) => (
                <button key={d} className="btn small" disabled={c.permits < 1 || c.reducedDistricts.includes(i)} onClick={() => act({ type: 'c03/project', id: nextProject, district: i })}>
                  {d}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="small muted">Both demand projects complete.</div>
        )}
        <label className="item" style={{ marginTop: 10 }}>
          <div>
            <div className="t">Service safeguards</div>
            <div className="d">Free policy. Restores 2 · 2 · 2 · 4 automatically after a safety throttle.</div>
          </div>
          <input type="checkbox" checked={c.safeguards} onChange={(e) => act({ type: 'c03/safeguards', on: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
      </div>

      {c.consultation && (
        <div className="card small">
          <h3>Approval process</h3>
          {c.consultation === 'retained' ? 'Open public consultation. Dissent is recorded.' : 'Streamlined automated approval. Human review is sampled.'}
        </div>
      )}

      {c.saturated && !s.charters.reserveMandate && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'mandate' })}>
          Review the reserve mandate
        </button>
      )}
    </>
  );
}
