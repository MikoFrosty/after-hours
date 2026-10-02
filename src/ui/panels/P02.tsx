import { useEffect, useRef, useState } from 'react';
import { useGameState, act } from '../hooks';
import { game } from '../../runtime/game';
import { BUILDING, OFFICE, type Room } from '../../content/campaign';
import type { C02State } from '../../game/types';
import {
  allDelivered,
  buildingGoal,
  CONTRACTS,
  cooling,
  currentContract,
  heatGain,
  heatOpen,
  openRooms,
  price,
  roomRate,
  routeOpen,
  shopOpen,
  slowestRoom,
  dockBehind,
} from '../../game/chapters/c02';
import { Bar } from './Panel';
import { clearable, OFFICE_ITEMS } from '../../game/officeSalvage';

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const perSec = (milli: number) => `${(milli / 1000).toFixed(milli < 10_000 ? 1 : 0)}/s`;

/** What a room's machines are called, counted. */
const UNITS: Record<Room['id'], (n: number) => string> = {
  dock: (n) => `${n} dock hand${n === 1 ? '' : 's'}`,
  wireRoom: (n) => `${n} wire machine${n === 1 ? '' : 's'}`,
  workshop: (n) => `${n} clip machine${n === 1 ? '' : 's'}`,
  shipping: (n) => `${n} lift run${n === 1 ? '' : 's'} an hour`,
};

const CLEARING_COPY = {
  cabinet: { name: 'Filing cabinet', text: 'Ten kilograms of steel. Its records go to storage either way.' },
  lamp: { name: 'Desk lamp', text: 'The only warm light in the old office.' },
  frame: { name: 'Picture frame', text: 'The photograph would stay with the desk.' },
} as const;

export function P02() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const done = allDelivered(c);
  return (
    <>
      <BuildingDock />

      {done && !s.charters.maintenanceCharter && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'maintenanceCharter' })}>
          Review the maintenance offer
        </button>
      )}
      {s.charters.maintenanceCharter && !s.charters.cityTender && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter', subject: 'cityTender' })}>
          Review the city tender
        </button>
      )}

      {c.rush && !done && <RushCard />}
      {!done && <RoomsCard />}
      {heatOpen(c) && !done && <HeatCard />}
      {routeOpen(c) && <RouteCard />}
      <ClearingCard />
    </>
  );
}

/** Always in view: what to do next, the contract, clips to spend, and the one hands-on verb. */
function BuildingDock() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const done = allDelivered(c);
  const k = currentContract(c);
  const goal = buildingGoal(s);
  const hot = c.throttled ? 'hot' : heatOpen(c) && c.heatMilli >= 60_000 && heatGain(c) > cooling(c) ? 'warm' : '';
  const [n, setN] = useState(0);
  const [floaters, setFloaters] = useState<Array<{ id: number; x: number }>>([]);
  const seq = useRef(0);
  const unload = () => {
    const before = (game.state?.chapterState as C02State).wire;
    if (act({ type: 'c02/unload' })) return;
    setN((x) => x + 1);
    if ((game.state?.chapterState as C02State).wire > before) {
      const id = ++seq.current;
      setFloaters((f) => [...f.slice(-5), { id, x: 78 + ((id * 37) % 10) }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);
    }
  };
  const unloadRef = useRef(unload);
  unloadRef.current = unload;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'd' || e.key === 'D' || e.key === 'b' || e.key === 'B') unloadRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const left = c.rate > 0 ? Math.ceil(((k.clips - c.contractClips) * 1000) / c.rate) : null;
  return (
    <div className="card action-dock" aria-label="Building">
      <div className={`alert-slot ${hot ? `heat ${hot}` : 'goal'}`} role="status">
        {!hot && <span className="tiny muted">Next</span>}
        <span>{goal}</span>
      </div>
      {!done && (
        <div>
          <div className="row between small">
            <span>
              <span className="muted">Contract {c.contractIndex + 1} of {CONTRACTS.length} · </span>
              {k.title}
            </span>
            <span className="mono">
              {fmt(c.contractClips)} / {fmt(k.clips)}
            </span>
          </div>
          <Bar value={c.contractClips} max={k.clips} />
          <div className="row between tiny" style={{ marginTop: 4 }}>
            <span className="faint">For {k.client}</span>
            <span className="faint">{left !== null ? `about ${left} s to go` : ''}</span>
          </div>
        </div>
      )}
      <div className="dock-main">
        <div className="make-wrap">
          <button className={`btn primary make-btn hand-btn ${n ? `press-${n % 2}` : ''}`} onClick={unload} disabled={done}>
            Unload a coil of wire
            <span className="kbd">D</span>
          </button>
          {floaters.map((f) => (
            <span key={f.id} className="floater" style={{ left: `${f.x}%` }} aria-hidden>
              +{BUILDING.handCoilClips}
            </span>
          ))}
        </div>
        <div className="dock-stats">
          <div className="stat">
            <span className="muted tiny">Clips to spend</span>
            <span className="mono big">{fmt(c.stock)}</span>
          </div>
          <div className="stat">
            <span className="muted tiny">Making</span>
            <span className="mono">{(c.rate / 1000).toFixed(1)}/s</span>
          </div>
        </div>
      </div>
      <div className="tiny faint">
        Wire waiting at the dock: {fmt(c.wire)} clips’ worth{c.levels.dock === 0 ? ' · each coil makes ' + BUILDING.handCoilClips + ' clips' : ''}
      </div>
    </div>
  );
}

/** The rooms of the line, in the order wire moves through them. The slowest one sets the pace. */
function RoomsCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const rooms = openRooms(c);
  const shop = shopOpen(c);
  const slow = slowestRoom(c);
  const max = Math.max(...rooms.map((r) => roomRate(c, r)), 1);
  const dockShort = dockBehind(c);
  return (
    <div className="card">
      <h3>
        The building <span className="tag">{rooms.length} of 4 rooms open</span>
      </h3>
      <p className="small" style={{ margin: '0 0 10px' }}>
        {shop
          ? 'Wire goes through each room in turn, so the whole line only runs as fast as its slowest room. Spend clips there.'
          : 'Wire comes in at the dock and goes to the workshop to be bent into clips. For now, the dock is you.'}
      </p>
      <div className="list">
        {rooms.map((r) => (
          <RoomRow key={r.id} r={r} slowest={shop && (dockShort ? r.id === 'dock' : r.id === slow.id)} shop={shop} max={max} />
        ))}
      </div>
    </div>
  );
}

function RoomRow({ r, slowest, shop, max }: { r: Room; slowest: boolean; shop: boolean; max: number }) {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const rate = roomRate(c, r);
  const cost = price(c, r.id);
  const level = c.levels[r.id];
  const handsOnly = r.id === 'dock' && level === 0;
  const isNew = r.opensWith === c.contractIndex && r.opensWith > 0;
  return (
    <div className={`item room-row ${slowest ? 'highlight' : ''}`}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t">
          {r.name} {isNew && <span className="pill accent">new</span>} {slowest && <span className="pill warn">slowest</span>}
        </div>
        <div className="d">{r.does}</div>
        <div className="room-speed">
          <span className="mono tiny">{handsOnly ? 'you, by hand' : `${perSec(rate)} · ${UNITS[r.id](r.id === 'dock' ? level : level + 1)}`}</span>
          {!handsOnly && <Bar value={rate} max={max} tone={slowest ? undefined : 'alt'} />}
        </div>
      </div>
      {shop && (
        <button className={`btn small ${slowest ? 'primary' : ''}`} disabled={c.stock < cost} onClick={() => act({ type: 'c02/buy', room: r.id })} title={`+${perSec(r.perLevel)}`}>
          {r.buy}
          <span className="tiny mono" style={{ display: 'block' }}>
            {fmt(cost)} clips · +{perSec(r.perLevel)}
          </span>
        </button>
      )}
    </div>
  );
}

function RushCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const r = c.rush!;
  const left = Math.max(0, Math.ceil((r.untilMs - s.simMs) / 1000));
  return (
    <div className="card reveal rush">
      <h3>
        Rush order <span className="tag">{left} s</span>
      </h3>
      {r.taken ? (
        <>
          <div className="row between small">
            <span>
              Make {fmt(r.target)} clips before the time runs out · bonus {fmt(r.bonus)}
            </span>
            <span className="mono">
              {fmt(r.made)} / {fmt(r.target)}
            </span>
          </div>
          <Bar value={r.made} max={r.target} />
        </>
      ) : (
        <div className="row between">
          <span className="small">
            {fmt(r.target)} clips in {BUILDING.rush.ms / 1000} seconds, for a bonus of {fmt(r.bonus)} clips. Nothing is lost if you miss it.
          </span>
          <button className="btn primary small" onClick={() => act({ type: 'c02/rush' })}>
            Take it
          </button>
        </div>
      )}
    </div>
  );
}

function HeatCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const cost = price(c, 'fan');
  const gain = heatGain(c);
  const cool = cooling(c);
  const secs = c.running && !c.throttled && gain > cool ? Math.ceil((BUILDING.heat.throttleOn - c.heatMilli) / (gain - cool)) : null;
  return (
    <div className="card reveal">
      <h3>
        Workshop heat <span className="tag">{Math.round(c.heatMilli / 1000)} / 100</span>
      </h3>
      <Bar value={c.heatMilli} max={100_000} marks={[50_000, 80_000]} tone={c.throttled ? 'danger' : undefined} />
      <p className="small" style={{ margin: '8px 0' }}>
        {c.throttled
          ? 'Overheated: the clip machines are at a quarter speed until the heat falls to 50.'
          : gain > cool
            ? `Heating up${secs !== null && secs < 120 ? `: it overheats in about ${secs} s` : ''}. Fans or a short stop keep it below 80.`
            : 'The fans keep up with the machines. It will not overheat at this pace.'}
      </p>
      <div className="row between">
        <button className="btn small" disabled={c.stock < cost} onClick={() => act({ type: 'c02/buy', room: 'fan' })}>
          Add a fan · {fmt(cost)} clips
        </button>
        <button className="btn small" aria-pressed={c.running} onClick={() => act({ type: 'c02/run', running: !c.running })}>
          {c.running ? 'Stop the machines' : 'Start the machines'}
        </button>
      </div>
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        The faster the workshop runs, the hotter it gets. Each fan takes away {(BUILDING.heat.perFan / 1000).toFixed(1)} heat a second. Heat never breaks anything.
      </p>
    </div>
  );
}

function RouteCard() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  return (
    <div className="card reveal">
      <h3>
        The courtyard <span className="tag">{c.route === 'direct' ? 'straight across' : 'trucks go round'}</span>
      </h3>
      <p className="small" style={{ margin: '0 0 10px' }}>
        {c.directBuilt
          ? 'The garden is gone. Trucks drive straight up to the dock.'
          : 'With the street closed, trucks go round the night garden, and the dock hands work at 85% speed. A road straight across would be quicker, but the garden would have to go.'}
      </p>
      {!c.directBuilt && (
        <button className="btn small danger" onClick={() => act({ type: 'request', kind: 'clearGarden' })}>
          Pave over the garden…
        </button>
      )}
    </div>
  );
}

/** The old office: offered after the first delivery, if the player chose to decide item by item. */
function ClearingCard() {
  const s = useGameState();
  const items = OFFICE_ITEMS.filter((id) => clearable(s, id));
  if (items.length === 0 || s.flags['c02.officeKept'] !== false) return null;
  return (
    <div className="card">
      <h3>
        The old office <span className="tag">until the next contract is done</span>
      </h3>
      <div className="list">
        {items.map((id) => {
          const def = OFFICE.salvage.find((x) => x.id === id)!;
          return (
            <div className="item" key={id}>
              <div>
                <div className="t">{CLEARING_COPY[id].name}</div>
                <div className="d">{CLEARING_COPY[id].text}</div>
                <div className="d mono tiny">+{def.yieldClips} clips to spend</div>
              </div>
              <button className="btn small" onClick={() => act({ type: 'request', kind: 'salvage', subject: id })}>
                Send to the line…
              </button>
            </div>
          );
        })}
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="tiny faint">Whatever is left comes down as it is.</span>
        <button className="btn small" onClick={() => act({ type: 'request', kind: 'keepOffice' })}>
          Keep the rest
        </button>
      </div>
    </div>
  );
}
