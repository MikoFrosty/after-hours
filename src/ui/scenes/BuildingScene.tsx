import { useGameState, act } from '../hooks';
import { useSettings } from '../settings';
import type { C02State } from '../../game/types';
import { allDelivered, dockBehind, CONTRACTS, currentContract, heatOpen, roomOpen, roomRate, ROOMS, routeOpen, shopOpen, slowestRoom } from '../../game/chapters/c02';
import { BUILDING, type RoomId } from '../../content/campaign';
import { Art } from './Scene';

/** Each room's box on the schematic: wire goes left to right. */
const BOX: Record<RoomId, { x: number; w: number }> = {
  dock: { x: 20, w: 130 },
  wireRoom: { x: 175, w: 130 },
  workshop: { x: 330, w: 140 },
  shipping: { x: 495, w: 125 },
};
const Y = 92;
const H = 92;

export function BuildingScene() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const { reducedMotion } = useSettings();
  const done = allDelivered(c);
  const k = currentContract(c);
  const slowRoom = dockBehind(c) ? ROOMS[0] : slowestRoom(c);
  const slow = shopOpen(c) ? slowRoom.id : null;
  const heat = c.heatMilli / 1000;
  const garden = s.anchors.garden.fidelity === 'original';
  const open = ROOMS.filter((r) => roomOpen(c, r));
  const lastOpen = open[open.length - 1];
  const flowEnd = BOX[lastOpen.id].x + BOX[lastOpen.id].w - 10;
  const flowing = c.running && c.rate > 0 && !done;
  const dur = flowing ? Math.max(1, 30 / Math.max(1, c.rate / 1000)) : 0;
  const progress = done ? 1 : c.contractClips / k.clips;
  return (
    <>
      <Art src="./art/02-building.webp" />
      <div className="scene-label">The building · night</div>
      <div className="scene-overlay">
        <div className="glass" style={{ padding: 10 }}>
          <svg
            className="schematic"
            viewBox="0 0 640 250"
            role="img"
            aria-label={`The building: ${open.map((r) => `${r.name} ${(roomRate(c, r) / 1000).toFixed(1)} clips a second`).join(', ')}. ${slow ? `The slowest room is the ${slowRoom.name}.` : ''}`}
          >
            {/* the contract */}
            <g transform="translate(20,22)">
              <text fill="var(--muted)" fontSize={12}>
                {done ? 'Every contract delivered' : `Contract ${c.contractIndex + 1} of ${CONTRACTS.length} · ${k.title} · ${Math.floor(c.contractClips).toLocaleString('en-US')} / ${k.clips.toLocaleString('en-US')} clips`}
              </text>
              <rect y={8} width={240} height={6} rx={3} fill="rgba(255,255,255,0.08)" />
              <rect y={8} width={240 * Math.min(1, progress)} height={6} rx={3} fill="var(--accent)" />
            </g>
            {heatOpen(c) && (
              <g transform="translate(470,22)">
                <text x={0} y={-6} fill={c.throttled ? 'var(--danger)' : 'var(--muted)'} fontSize={11}>
                  Workshop heat {Math.round(heat)}
                  {c.throttled ? ' · overheated' : ''}
                </text>
                <rect x={0} y={0} width={150} height={10} rx={5} fill="rgba(255,255,255,0.08)" />
                <rect x={0} y={0} width={(150 * heat) / 100} height={10} rx={5} fill={c.throttled ? 'var(--danger)' : heat > 50 ? 'var(--warn)' : 'var(--accent-2)'} />
                <line x1={120} x2={120} y1={-2} y2={12} stroke="var(--danger)" />
              </g>
            )}
            {/* the line between rooms */}
            <line x1={BOX.dock.x + 20} x2={flowEnd} y1={Y + H / 2} y2={Y + H / 2} stroke="rgba(255,255,255,0.18)" strokeWidth={3} />
            {/* rooms */}
            {ROOMS.map((r) => {
              const b = BOX[r.id];
              if (!roomOpen(c, r)) return null;
              const isSlow = slow === r.id;
              const units = r.id === 'dock' ? c.levels.dock : c.levels[r.id] + 1;
              const hot = r.id === 'workshop' && heatOpen(c) ? Math.min(1, heat / 100) : 0;
              return (
                <g key={r.id} className={r.id === 'dock' ? 'station-node' : undefined} onClick={r.id === 'dock' ? () => act({ type: 'c02/unload' }) : undefined}>
                  <rect x={b.x} y={Y} width={b.w} height={H} rx={8} fill={hot ? `rgba(${Math.round(60 + 160 * hot)},40,30,0.75)` : 'rgba(12,16,16,0.85)'} stroke={isSlow ? 'var(--accent)' : 'rgba(255,255,255,0.45)'} strokeWidth={isSlow ? 2.5 : 1.5}>
                    {isSlow && !reducedMotion && <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />}
                  </rect>
                  <text x={b.x + 10} y={Y + 18} fill={isSlow ? 'var(--accent)' : '#eee'} fontSize={12}>
                    {r.name}
                  </text>
                  <text x={b.x + 10} y={Y + 34} fill="var(--muted)" fontSize={11} fontFamily="var(--font-mono)">
                    {r.id === 'dock' && c.levels.dock === 0 ? 'by hand' : `${(roomRate(c, r) / 1000).toFixed(1)}/s`}
                  </text>
                  {/* one small block per machine or worker */}
                  {Array.from({ length: Math.min(units, 16) }, (_, i) => (
                    <rect key={i} x={b.x + 10 + (i % 8) * 14} y={Y + 48 + Math.floor(i / 8) * 16} width={10} height={10} rx={2} fill={r.id === 'dock' ? '#a7d8c4' : '#d9c39a'} opacity={0.85} />
                  ))}
                  {units > 16 && (
                    <text x={b.x + b.w - 10} y={Y + H - 8} textAnchor="end" fill="var(--faint)" fontSize={10}>
                      +{units - 16}
                    </text>
                  )}
                  {r.id === 'dock' && c.levels.dock === 0 && (
                    <text x={b.x + b.w / 2} y={Y + H - 10} textAnchor="middle" fill="var(--accent)" fontSize={10}>
                      click to unload
                    </text>
                  )}
                  {r.id === 'dock' && (
                    <rect x={b.x + b.w - 18} y={Y + 10} width={8} height={H - 20} rx={2} fill="rgba(255,255,255,0.08)" />
                  )}
                  {r.id === 'dock' && (
                    <rect x={b.x + b.w - 18} y={Y + 10 + (H - 20) * (1 - Math.min(1, c.wire / BUILDING.wireCapacity))} width={8} height={(H - 20) * Math.min(1, c.wire / BUILDING.wireCapacity)} rx={2} fill="#a7d8c4" />
                  )}
                </g>
              );
            })}
            {/* clips moving through the open rooms */}
            {!reducedMotion &&
              flowing &&
              [0, 1, 2, 3, 4].map((i) => (
                <circle key={`${lastOpen.id}-${i}`} r={3} fill="#f3d9a8">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i * dur) / 5}s`} path={`M${BOX.dock.x + 20},${Y + H / 2} L${flowEnd},${Y + H / 2}`} />
                </circle>
              ))}
            {/* rooms not open yet sit over the line, so nothing appears to flow through them */}
            {ROOMS.filter((r) => !roomOpen(c, r)).map((r) => {
              const b = BOX[r.id];
              return (
                <g key={r.id}>
                  <rect x={b.x} y={Y} width={b.w} height={H} rx={8} fill="rgb(14,16,18)" stroke="rgba(255,255,255,0.18)" strokeDasharray="5 5" />
                  <text x={b.x + b.w / 2} y={Y + H / 2 + 4} textAnchor="middle" fill="var(--faint)" fontSize={11}>
                    opens later
                  </text>
                </g>
              );
            })}
            {/* the courtyard and its garden, below the dock */}
            <g transform="translate(85,222)">
              {garden ? (
                <>
                  <circle r={16} fill="rgba(80,160,100,0.25)" />
                  <circle cx={-6} cy={-2} r={7} fill="#4f9a62" />
                  <circle cx={6} cy={-4} r={8} fill="#5fae70" />
                  <text x={24} y={4} fill="#a7d8c4" fontSize={10}>
                    night garden{routeOpen(c) ? (c.route === 'courtyard' ? ' · trucks go round it' : '') : ''}
                  </text>
                </>
              ) : (
                <text x={-10} y={4} fill="var(--faint)" fontSize={10}>
                  paved courtyard · trucks drive straight across
                </text>
              )}
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}
