import { useGameState, act } from '../hooks';
import { SOLAR } from '../../content/campaign';
import type { C05State } from '../../game/types';
import { deferred, limits, limitingRole, netPower, output, overhead, ROLES, type Role } from '../../game/chapters/c05';
import { Bar } from './Panel';

const ROLE_NAME: Record<Role, string> = { collector: 'Collector', fabricator: 'Fabricator', radiator: 'Radiator', support: 'Protected support' };
const ROLE_KEY: Record<Role, string> = { collector: 'C', fabricator: 'F', radiator: 'R', support: 'S' };

export function P05() {
  const s = useGameState();
  const c = s.chapterState as C05State;
  const l = limits(s);
  const role = limitingRole(s);
  const chips = ROLES.flatMap((r) => Array.from({ length: c.alloc[r] }, () => r));
  const cycle = (r: Role) => {
    const next = ROLES[(ROLES.indexOf(r) + 1) % ROLES.length];
    act({ type: 'c05/shift', from: r, to: next });
  };
  const donorFor = (to: Role): Role | null => {
    const cands = ROLES.filter((r) => r !== to && c.alloc[r] > (r === 'support' ? 1 : 0));
    cands.sort((a, b) => c.alloc[b] - c.alloc[a]);
    return cands[0] ?? null;
  };
  const fix =
    output(s) === 0
      ? c.alloc.radiator === 0
        ? 'Assign at least one radiator: waste heat has nowhere to go.'
        : c.alloc.fabricator === 0
          ? 'Assign at least one fabricator.'
          : 'Assign more collectors: net power is zero after protected support.'
      : null;
  const projectCard = (id: 'radiators' | 'extractionStudy', name: string, effect: string, at: number) => {
    const st = s.projects[id];
    return (
      <div className={`item ${st === 'complete' ? 'done' : st === 'available' ? 'highlight' : ''}`}>
        <div>
          <div className="t">{name}</div>
          <div className="d">
            {effect} · {st === 'locked' ? `unlocks at cumulative work ${at}` : '20 spendable work'}
          </div>
        </div>
        {st === 'complete' ? (
          <span className="pill ok">Complete</span>
        ) : (
          <button className="btn small" disabled={st !== 'available' || c.spendableMilli < SOLAR.projectWork} onClick={() => act({ type: 'c05/project', id })}>
            Build
          </button>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="card">
        <h3>
          Orbital layout <span className="tag">10 slots · click a chip to change its role</span>
        </h3>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Orbital slots">
          {chips.map((r, i) => (
            <button key={i} className={`chip ${r}`} onClick={() => cycle(r)} aria-label={`Slot ${i + 1}: ${ROLE_NAME[r]}. Change role.`} title={ROLE_NAME[r]}>
              {ROLE_KEY[r]}
            </button>
          ))}
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {ROLES.map((r) => {
            const donor = donorFor(r);
            return (
              <div key={r} className="item">
                <div>
                  <div className="t">{ROLE_NAME[r]}</div>
                  <div className="d">
                    {r === 'collector' && '+4 power each'}
                    {r === 'fabricator' && `limit ${SOLAR.fabricatorRate / 1000} work/s each`}
                    {r === 'radiator' && `limit ${(s.projects.radiators === 'complete' ? SOLAR.improvedRadiatorRate : SOLAR.radiatorRate) / 1000} work/s each`}
                    {r === 'support' && 'reserved first · −2 power · 24 support units · minimum 1'}
                  </div>
                </div>
                <div className="stepper">
                  <button className="btn small icon" disabled={c.alloc[r] <= (r === 'support' ? 1 : 0)} onClick={() => act({ type: 'c05/shift', from: r, to: donorFor(r) ?? 'collector' })} aria-label={`One fewer ${ROLE_NAME[r]}`}>
                    −
                  </button>
                  <span className="val">{c.alloc[r]}</span>
                  <button className="btn small icon" disabled={!donor} onClick={() => donor && act({ type: 'c05/shift', from: donor, to: r })} aria-label={`One more ${ROLE_NAME[r]}${donor ? `, taken from ${ROLE_NAME[donor]}` : ''}`}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>
          Flow <span className="tag">{(output(s) / 1000).toFixed(3)} work/s</span>
        </h3>
        <table className="ledger-table">
          <tbody>
            <tr>
              <td>Net power = 4C − 2S − 0.05 × {overhead(s)}</td>
              <td className="num">{(netPower(s) / 1000).toFixed(2)}</td>
            </tr>
            <tr style={role === 'power' ? { color: 'var(--accent)' } : undefined}>
              <td>Power limit (÷2)</td>
              <td className="num">{(l.power / 1000).toFixed(3)}</td>
            </tr>
            <tr style={role === 'fabrication' ? { color: 'var(--accent)' } : undefined}>
              <td>Fabrication limit</td>
              <td className="num">{(l.fabrication / 1000).toFixed(3)}</td>
            </tr>
            <tr style={role === 'cooling' ? { color: 'var(--accent)' } : undefined}>
              <td>Cooling limit</td>
              <td className="num">{(l.cooling / 1000).toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
        {deferred(s) && <p className="small muted">Stellar extraction deferred: ordinary output × 0.90.</p>}
        {fix && (
          <p className="small" style={{ color: 'var(--danger)' }} role="status">
            Output zero. {fix}
          </p>
        )}
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Maximum collector coverage is not maximum productivity. Energy is available; somewhere to put the heat is not always.
        </p>
      </div>

      <div className="card">
        <h3>
          Orbital work <span className="tag">spendable {(c.spendableMilli / 1000).toFixed(1)}</span>
        </h3>
        <div className="row between small">
          <span>Cumulative</span>
          <span className="mono">{(c.cumulativeMilli / 1000).toFixed(0)} / 500</span>
        </div>
        <Bar value={c.cumulativeMilli} max={SOLAR.thresholds[2]} marks={SOLAR.thresholds.slice(0, 2)} />
        <div className="list" style={{ marginTop: 10 }}>
          {projectCard('radiators', 'High-temperature radiators', 'Cooling limit 2R → 3R', 100)}
          {projectCard('extractionStudy', 'Stellar extraction study', 'A finite stellar source; not an instant star deletion', 250)}
          <div className={`item ${c.seedKits >= 3 ? 'done' : s.projects.seedFoundry === 'available' ? 'highlight' : ''}`}>
            <div>
              <div className="t">Seed foundry · {c.seedKits} / 3 kits</div>
              <div className="d">{s.projects.seedFoundry === 'locked' ? 'unlocks at cumulative work 500' : '30 spendable work each · reserves a 1,000 t kit from solar supply first'}</div>
            </div>
            {c.seedKits >= 3 ? (
              <span className="pill ok">Ready</span>
            ) : (
              <button className="btn small" disabled={s.projects.seedFoundry === 'locked' || c.spendableMilli < SOLAR.seedWork} onClick={() => act({ type: 'c05/seed' })}>
                Fabricate
              </button>
            )}
          </div>
          {c.starChoice === 'relocate' && (
            <div className={`item ${c.habitatRelocated ? 'done' : 'highlight'}`}>
              <div>
                <div className="t">Relocate the habitat</div>
                <div className="d">Residents and functioning life support to a remote powered shell · 30 spendable work</div>
              </div>
              {c.habitatRelocated ? (
                <span className="pill ok">Moved</span>
              ) : (
                <button className="btn small" disabled={c.spendableMilli < SOLAR.relocateWork} onClick={() => act({ type: 'c05/relocate' })}>
                  Relocate
                </button>
              )}
            </div>
          )}
          {c.starChoice === 'defer' && <div className="small muted">Dismantling deferred. The sky over the habitat is kept.</div>}
        </div>
      </div>

      {s.consumedEventIds.includes('c05.charter') && !s.charters.autonomyCharter && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter' })}>
          Review autonomy charter
        </button>
      )}
    </>
  );
}
