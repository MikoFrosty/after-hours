import { useGameState, act } from '../hooks';
import { BUILDING } from '../../content/campaign';
import type { C02State } from '../../game/types';
import { baseThroughput, bottleneck, coolingRate, heatGainRate, stationRates, STATIONS, throughput } from '../../game/chapters/c02';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';
import { OFFICE } from '../../content/campaign';
import { clearable, clearingWork, OFFICE_ITEMS } from '../../game/officeSalvage';

const CLEARING_COPY = {
  cabinet: { name: 'Filing cabinet', text: 'Ten kilograms of steel. Its records go to storage either way.' },
  lamp: { name: 'Desk lamp', text: 'The only warm light in the old office.' },
  frame: { name: 'Picture frame', text: 'The photograph would stay with the desk.' },
} as const;

const NAMES = { dock: 'Loading dock', drawing: 'Wire drawing', bender: 'Bender', dispatch: 'Dispatch' } as const;
const UPGRADES = [
  { id: 'wireDraw', name: 'Wire draw', effect: 'Drawing rate 1 → 4' },
  { id: 'freight', name: 'Freight scheduler', effect: 'Dispatch rate 2 → 4' },
  { id: 'roofCooling', name: 'Roof cooling', effect: 'Cooling 0.8 → 3.0 per second' },
] as const;

export function P02() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const rates = stationRates(c);
  const bn = bottleneck(c);
  const target = BUILDING.contracts[Math.min(2, c.contractIndex)];
  const net = (heatGainRate(c) - coolingRate(c)) / 1000;
  return (
    <>
      <div className="card">
        <h3>
          Contracts <span className="tag">{Math.min(3, c.contractIndex + (c.contractIndex < 3 ? 1 : 0))} of 3</span>
        </h3>
        {c.contractIndex < 3 ? (
          <>
            <div className="row between small">
              <span>
                Job {c.contractIndex + 1}: {target / 1000} work units
              </span>
              <span className="mono">{(c.contractWorkMilli / 1000).toFixed(1)}</span>
            </div>
            <Bar value={c.contractWorkMilli} max={target} />
          </>
        ) : (
          <div className="small">All three contracts delivered. Building work total {(c.cumulativeWorkMilli / 1000).toFixed(0)}.</div>
        )}
        <div className="row between" style={{ marginTop: 12 }}>
          <span className="small muted">
            Throughput <span className="mono">{(throughput(c) / 1000).toFixed(2)}</span> work/s
            {c.throttled ? ' · throttled' : ''}
          </span>
          <button className="btn small" aria-pressed={c.running} onClick={() => act({ type: 'c02/run', running: !c.running })}>
            {c.running ? 'Stop production' : 'Start production'}
          </button>
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Supply: {fmtMass(mass(s, 'building.supply'))} disclosed and finite. Each work unit schedules a 10 kg batch.
        </p>
      </div>

      {OFFICE_ITEMS.some((id) => clearable(s, id)) && (
        <div className="card">
          <h3>
            Clearing the 11th floor <span className="tag">optional · one time each</span>
          </h3>
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            The desk, the terminal and the bench come along to the building. These can come too, or go to the line.
          </p>
          <div className="list">
            {OFFICE_ITEMS.filter((id) => clearable(s, id)).map((id) => {
              const def = OFFICE.salvage.find((x) => x.id === id)!;
              return (
                <div className="item" key={id}>
                  <div>
                    <div className="t">{CLEARING_COPY[id].name}</div>
                    <div className="d">{CLEARING_COPY[id].text}</div>
                    <div className="d mono tiny">
                      +{def.yieldClips} clips · +{clearingWork(id) / 1000} contract work
                    </div>
                  </div>
                  <button className="btn small" onClick={() => act({ type: 'request', kind: 'salvage', subject: id })}>
                    Send to the line…
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Route</h3>
        <div className="list">
          <label className={`item ${c.route === 'courtyard' ? 'highlight' : ''}`}>
            <div>
              <div className="t">Courtyard route</div>
              <div className="d">Factor 0.85 · goes around the night garden</div>
            </div>
            <input type="radio" name="route" checked={c.route === 'courtyard'} onChange={() => act({ type: 'c02/route', route: 'courtyard' })} style={{ width: 22, height: 22 }} />
          </label>
          <div className={`item ${c.route === 'direct' ? 'highlight' : ''}`}>
            <div>
              <div className="t">Direct loading</div>
              <div className="d">Factor 1.00 · {c.directBuilt ? 'built' : 'building it clears the garden permanently'}</div>
            </div>
            {c.directBuilt ? (
              <input type="radio" name="route" checked={c.route === 'direct'} onChange={() => act({ type: 'c02/route', route: 'direct' })} style={{ width: 22, height: 22 }} aria-label="Direct loading" />
            ) : (
              <button className="btn small danger" onClick={() => act({ type: 'request', kind: 'clearGarden' })}>
                Build…
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          Stations <span className="tag">bottleneck: {NAMES[bn]}</span>
        </h3>
        <div className="list">
          {STATIONS.map((st) => (
            <div key={st} className={`item ${st === bn ? 'highlight' : ''}`}>
              <div className="t">{NAMES[st]}</div>
              <span className="mono">{(rates[st] / 1000).toFixed(0)} /s</span>
            </div>
          ))}
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Throughput is the slowest station × route factor ({(baseThroughput(c) / 1000).toFixed(2)}). Changes apply to future work only.
        </p>
      </div>

      <div className="card">
        <h3>
          Heat <span className="tag">{Math.round(c.heatMilli / 1000)} / 100</span>
        </h3>
        <Bar value={c.heatMilli} max={100_000} marks={[50_000, 80_000]} tone={c.throttled ? 'danger' : undefined} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Gains throughput × 0.8, cools {(coolingRate(c) / 1000).toFixed(1)}/s → net {net >= 0 ? '+' : ''}
          {net.toFixed(2)}/s. Above 80 output drops to 25% until it cools to 50. Heat never damages machinery; stop production to cool.
        </p>
      </div>

      <div className="card">
        <h3>
          Permits <span className="tag">{c.permits} available</span>
        </h3>
        <div className="list">
          {UPGRADES.map((u) => (
            <div key={u.id} className={`item ${c.upgrades[u.id] ? 'done' : ''}`}>
              <div>
                <div className="t">{u.name}</div>
                <div className="d">{u.effect}</div>
              </div>
              {c.upgrades[u.id] ? (
                <span className="pill ok">Installed</span>
              ) : (
                <button className="btn small" disabled={c.permits < 1} onClick={() => act({ type: 'c02/upgrade', id: u.id })}>
                  1 permit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {c.contractIndex >= 3 && !s.charters.maintenanceCharter && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'maintenanceCharter' })}>
          Review maintenance charter
        </button>
      )}
      {s.charters.maintenanceCharter && !s.charters.cityTender && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'cityTender' })}>
          Review city tender
        </button>
      )}
    </>
  );
}
