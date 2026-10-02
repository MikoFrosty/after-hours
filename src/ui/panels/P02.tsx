import { useEffect, useRef, useState } from 'react';
import { useGameState, act } from '../hooks';
import { game } from '../../runtime/game';
import { BUILDING, OFFICE, type BuildingUpgradeId } from '../../content/campaign';
import type { BuildingStation, C02State } from '../../game/types';
import {
  availableUpgrades,
  baseThroughput,
  buildingGoal,
  CONTRACTS,
  coolingRate,
  currentContract,
  heatGainRate,
  heatIntroduced,
  NAMES,
  onlineStations,
  routeIntroduced,
  stationRates,
  handTarget,
} from '../../game/chapters/c02';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';
import { clearable, clearingWork, OFFICE_ITEMS } from '../../game/officeSalvage';

const CLEARING_COPY = {
  cabinet: { name: 'Filing cabinet', text: 'Ten kilograms of steel. Its records go to storage either way.' },
  lamp: { name: 'Desk lamp', text: 'The only warm light in the old office.' },
  frame: { name: 'Picture frame', text: 'The photograph would stay with the desk.' },
} as const;

/** Which contract introduced each station, for a "new" tag while it is new. */
const OPENED: Record<BuildingStation, number> = { dock: 0, drawing: 1, bender: 0, dispatch: 2 };

const ROLE: Record<BuildingStation, string> = {
  dock: 'Coils come in off the trucks.',
  drawing: 'Rod is drawn down into wire.',
  bender: 'The bench from the 11th floor forms the clips.',
  dispatch: 'Cartons go up the freight lift and out.',
};

export function P02() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const done = c.contractIndex >= CONTRACTS.length;
  return (
    <>
      <BuildingDock />

      {done && !s.charters.maintenanceCharter && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'maintenanceCharter' })}>
          Review maintenance charter
        </button>
      )}
      {s.charters.maintenanceCharter && !s.charters.cityTender && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'cityTender' })}>
          Review city tender
        </button>
      )}

      <LineCard />

      {c.permits > 0 && availableUpgrades(c).length > 0 && <PermitsCard />}

      {heatIntroduced(c) && <HeatCard />}

      {routeIntroduced(c) && <RouteCard />}

      <ClearingCard />
    </>
  );
}

/**
 * The building's bench: the current contract, one line saying what needs attention, and the shipping
 * rate. Stop/start appears once heat is part of the job.
 */
function BuildingDock() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const done = c.contractIndex >= CONTRACTS.length;
  const k = currentContract(c);
  const goal = buildingGoal(s);
  const hot = c.throttled ? 'hot' : heatIntroduced(c) && c.heatMilli >= 60_000 && heatGainRate(c) > coolingRate(c) ? 'warm' : '';
  const left = c.shipRate > 0 ? Math.ceil((k.work - c.contractWorkMilli) / c.shipRate) : null;

  // H lends a hand at the station last helped; D at the dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const c2 = game.state?.chapterState as C02State | undefined;
      if ((e.key === 'h' || e.key === 'H') && c2?.kind === '02') act({ type: 'c02/hand', station: handTarget(c2) });
      if (e.key === 'd' || e.key === 'D') act({ type: 'c02/hand', station: 'dock' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="card action-dock" aria-label="Contract">
      <div className={`alert-slot ${hot ? `heat ${hot}` : 'goal'}`} role="status">
        {!hot && <span className="tiny muted">Next</span>}
        <span>{goal}</span>
      </div>
      {!done ? (
        <div>
          <div className="row between small">
            <span>
              <span className="muted">Contract {c.contractIndex + 1} of {CONTRACTS.length} · </span>
              {k.title}
            </span>
            <span className="mono">
              {Math.floor(c.contractWorkMilli / 1000)} / {k.work / 1000}
            </span>
          </div>
          <Bar value={c.contractWorkMilli} max={k.work} />
          <div className="row between tiny" style={{ marginTop: 4 }}>
            <span className="faint">{left !== null && !c.awaitingInspection ? `about ${left} s to go at this pace` : c.awaitingInspection ? 'inspection' : 'waiting for work to reach the end of the line'}</span>
            <span className="mono">{(c.shipRate / 1000).toFixed(1)}/s shipped</span>
          </div>
        </div>
      ) : (
        <div className="small">All {CONTRACTS.length} contracts delivered. Building work total {(c.cumulativeWorkMilli / 1000).toFixed(0)}.</div>
      )}
      {!done && !c.awaitingInspection && <HandButton />}
      {heatIntroduced(c) && !done && (
        <div className="row between">
          <span className="small muted">
            Heat <span className="mono">{Math.round(c.heatMilli / 1000)}</span>
            {c.throttled ? ' · throttled to 25%' : ''}
          </span>
          <button className="btn small" aria-pressed={c.running} onClick={() => act({ type: 'c02/run', running: !c.running })}>
            {c.running ? 'Stop production' : 'Start production'}
          </button>
        </div>
      )}
    </div>
  );
}

/** The building's one hands-on verb, kept in reach: unload at the dock, then help wherever work piles up. */
function HandButton() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const st = handTarget(c);
  const [n, setN] = useState(0);
  return (
    <button
      className={`btn primary make-btn hand-btn ${n ? `press-${n % 2}` : ''}`}
      onClick={() => {
        if (!act({ type: 'c02/hand', station: st })) setN(n + 1);
      }}
    >
      {st === 'dock' && !c.upgrades.dockCrew ? 'Unload a coil' : `Lend a hand at ${NAMES[st].toLowerCase()}`}
      <span className="kbd">{st === 'dock' ? 'D' : 'H'}</span>
    </button>
  );
}

/** The line, station by station, in the order work flows. Queues show where work is piling up. */
function LineCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const list = onlineStations(c);
  const rates = stationRates(c);
  const [pulse, setPulse] = useState<{ st: BuildingStation; n: number } | null>(null);
  const n = useRef(0);
  const help = (st: BuildingStation) => {
    const err = act({ type: 'c02/hand', station: st });
    if (!err) setPulse({ st, n: ++n.current });
  };
  const installed = BUILDING.upgrades.filter((u) => c.upgrades[u.id]).map((u) => u.name);
  return (
    <div className="card">
      <h3>
        The line <span className="tag">{list.length} of 4 stations open</span>
      </h3>
      <div className="line-list">
        {list.map((st, i) => {
          const next = list[i + 1];
          const q = next ? c.queues[st as keyof C02State['queues']] : 0;
          const isNew = OPENED[st] === c.contractIndex && c.contractIndex > 0;
          const byHand = st === 'dock' && !c.upgrades.dockCrew;
          return (
            <div key={st}>
              <div className={`station-row ${pulse?.st === st ? `helped h${pulse.n % 2}` : ''}`}>
                <div>
                  <div className="t">
                    {NAMES[st]} {isNew && <span className="pill accent">new</span>}
                  </div>
                  <div className="d">{ROLE[st]}</div>
                </div>
                <span className="mono rate">{byHand ? 'by hand' : `${(rates[st] / 1000).toFixed(1)}/s`}</span>
                <button className={`btn small ${byHand ? 'primary' : ''}`} onClick={() => help(st)} title={st === 'dock' ? 'Unload a coil (D)' : 'Push one unit through by hand (H)'}>
                  {st === 'dock' ? 'Unload a coil' : 'Lend a hand'}
                </button>
              </div>
              {next && (
                <div className="queue-row" aria-label={`${Math.floor(q / 1000)} waiting for ${NAMES[next].toLowerCase()}`}>
                  <span className="tiny faint">↓ waiting for {NAMES[next].toLowerCase()}</span>
                  <div className={`queue ${q >= BUILDING.bufferCap ? 'full' : ''}`}>
                    <i style={{ width: `${(q / BUILDING.bufferCap) * 100}%` }} />
                  </div>
                  <span className="mono tiny">{Math.floor(q / 1000)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        Work waits between stations; a queue that fills up sits in front of the slowest one. Your hands push one unit through any station, two a second at most.
        {installed.length > 0 && ` Installed: ${installed.join(', ')}.`}
      </p>
    </div>
  );
}

/** Permits kept from an inspection, spent here instead. */
function PermitsCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  return (
    <div className="card highlight-card">
      <h3>
        Permits <span className="tag">{c.permits} to spend</span>
      </h3>
      <div className="list">
        {availableUpgrades(c).map((id) => {
          const u = BUILDING.upgrades.find((x) => x.id === id)!;
          return (
            <div key={id} className="item">
              <div>
                <div className="t">{u.name}</div>
                <div className="d">{u.effect}</div>
                <div className="d mono tiny">{outcome(c, id)}</div>
              </div>
              <button className="btn small" onClick={() => act({ type: 'c02/upgrade', id })}>
                1 permit
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function outcome(c: C02State, id: BuildingUpgradeId): string {
  const before = baseThroughput(c);
  const next: C02State = { ...c, throttled: false, upgrades: { ...c.upgrades, [id]: true } };
  const after = baseThroughput(next);
  const n = (heatGainRate(next) - coolingRate(next)) / 1000;
  const heat = n > 0 ? `bench heats +${n.toFixed(2)}/s` : 'bench runs cool';
  const ship = after === before ? `still ${(before / 1000).toFixed(1)}/s (not the slowest station)` : `${(before / 1000).toFixed(1)} → ${(after / 1000).toFixed(1)}/s`;
  return `${ship} · ${heat}`;
}

function HeatCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  return (
    <div className="card reveal">
      <h3>
        Heat <span className="tag">{Math.round(c.heatMilli / 1000)} / 100</span>
      </h3>
      <Bar value={c.heatMilli} max={100_000} marks={[50_000, 80_000]} tone={c.throttled ? 'danger' : undefined} />
      <HeatForecast c={c} />
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        At full rate the bench adds {(heatGainRate(c) / 1000).toFixed(1)} heat a second and the room takes away {(coolingRate(c) / 1000).toFixed(1)}. At 80 the workshop throttles to 25% until it is back to 50. Heat never damages anything.
      </p>
    </div>
  );
}

/** Heat, said plainly: how soon it throttles, and once it has, what recovery costs. */
function HeatForecast({ c }: { c: C02State }) {
  const heat = c.heatMilli;
  const cool = coolingRate(c);
  const gain = heatGainRate(c);
  if (c.throttled) {
    const toGo = heat - BUILDING.heat.throttleOff;
    const running = cool > gain ? Math.ceil(toGo / (cool - gain)) : null;
    const stopped = Math.ceil(toGo / cool);
    return (
      <div className="heat-note hot small" role="status">
        Throttled until heat falls to 50: {running !== null ? `about ${running} s at 25%, ` : ''}or about {stopped} s stopped. Next time, a short stop just before 80 keeps the bench at full speed.
      </div>
    );
  }
  const net = gain - cool;
  if (!c.running || net <= 0 || heat >= BUILDING.heat.throttleOn) return null;
  const secs = Math.ceil((BUILDING.heat.throttleOn - heat) / net);
  if (secs > 120) return null;
  return (
    <div className="heat-note warm small" role="status">
      At this rate the workshop throttles in about {secs} s.{!c.upgrades.roofCooling && ' Roof cooling would stop it for good.'}
    </div>
  );
}

function RouteCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  return (
    <div className="card reveal">
      <h3>
        Deliveries <span className="tag">{c.route === 'direct' ? 'direct ×1.00' : 'courtyard ×0.85'}</span>
      </h3>
      <div className="list">
        <label className={`item ${c.route === 'courtyard' ? 'highlight' : ''}`}>
          <div>
            <div className="t">Through the courtyard</div>
            <div className="d">Round the night garden. The dock crew manages 3.4 coils a second this way.</div>
          </div>
          <input type="radio" name="route" checked={c.route === 'courtyard'} onChange={() => act({ type: 'c02/route', route: 'courtyard' })} style={{ width: 22, height: 22 }} />
        </label>
        <div className={`item ${c.route === 'direct' ? 'highlight' : ''}`}>
          <div>
            <div className="t">Direct loading</div>
            <div className="d">{c.directBuilt ? 'Built. 4 coils a second.' : 'Straight across the courtyard: 4 coils a second. Building it removes the night garden permanently.'}</div>
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
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        The route only matters when the dock is the slowest station. Keeping the garden always leaves enough to finish every contract; your hands at the dock make up some of the difference.
      </p>
    </div>
  );
}

/** The move from the 11th floor, offered during the first two contracts. */
function ClearingCard() {
  const s = useGameState();
  const items = OFFICE_ITEMS.filter((id) => clearable(s, id));
  if (items.length === 0) return null;
  if (s.flags['c02.officeKept'] === true) {
    return (
      <div className="card slim row between small">
        <span className="muted">The old office comes along whole: {items.join(', ')}.</span>
        <button className="btn small ghost" onClick={() => act({ type: 'request', kind: 'reviewOffice' })}>
          Reconsider
        </button>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>
        Clearing the 11th floor <span className="tag">optional · one time each</span>
      </h3>
      <p className="small muted" style={{ margin: '0 0 10px' }}>
        The desk, the terminal and the bench come along to the building. These can come too, or go to the line.
      </p>
      <div className="list">
        {items.map((id) => {
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
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="tiny faint">Available until the third contract begins.</span>
        <button className="btn small" onClick={() => act({ type: 'request', kind: 'keepOffice' })}>
          Keep them all
        </button>
      </div>
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        Supply: {fmtMass(mass(s, 'building.supply'))} disclosed and finite.
      </p>
    </div>
  );
}
