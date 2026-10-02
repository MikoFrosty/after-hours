import { useGameState, act } from '../hooks';
import { useSettings } from '../settings';
import type { C02State } from '../../game/types';
import { CONTRACTS, currentContract, heatIntroduced, NAMES, onlineStations, routeIntroduced, stationRates, STATIONS, type Station } from '../../game/chapters/c02';
import { BUILDING } from '../../content/campaign';
import { Art } from './Scene';

const POS: Record<Station, [number, number]> = { dock: [70, 130], drawing: [270, 130], bender: [420, 130], dispatch: [570, 130] };

export function BuildingScene() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const { reducedMotion } = useSettings();
  const rates = stationRates(c);
  const open = onlineStations(c);
  const last = open[open.length - 1];
  const gardenIntact = s.anchors.garden.fidelity === 'original';
  const routes = routeIntroduced(c);
  const courtyard = 'M70,130 C120,130 120,212 170,212 C220,212 220,130 270,130';
  const direct = 'M70,130 L270,130';
  const main = `M270,130 L${POS[last][0]},130`;
  const active = c.route === 'direct' ? direct : courtyard;
  const flowing = c.running && !c.awaitingInspection && c.shipRate > 0;
  const dur = c.shipRate > 0 ? Math.max(0.8, 5 / (c.shipRate / 1000)) : 0;
  const heat = c.heatMilli / 1000;
  const k = currentContract(c);
  const done = c.contractIndex >= CONTRACTS.length;
  const progress = done ? 1 : c.contractWorkMilli / k.work;
  // The furthest-downstream station with a full queue in front of it is the one holding the line up
  // (queues further back fill too, by backing up behind it).
  const blocked = [...open].reverse().find((st) => {
    const i = open.indexOf(st);
    return i > 0 && c.queues[open[i - 1] as keyof C02State['queues']] >= BUILDING.bufferCap;
  });
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
            aria-label={`The line: ${open.map((st) => NAMES[st]).join(', ')}. ${blocked ? `Work is piling up in front of ${NAMES[blocked]}.` : ''} ${heatIntroduced(c) ? `Heat ${Math.round(heat)}.` : ''} ${gardenIntact ? 'The night garden is intact in the courtyard.' : 'The garden has been cleared.'}`}
          >
            <defs>
              <filter id="soft">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            {/* deliveries come in round the courtyard; the direct route appears once it is a question */}
            <path d={courtyard} fill="none" stroke={c.route === 'courtyard' ? 'var(--accent-2)' : 'rgba(255,255,255,0.18)'} strokeWidth={c.route === 'courtyard' ? 4 : 2} />
            {routes && (
              <path d={direct} fill="none" stroke={c.directBuilt ? (c.route === 'direct' ? 'var(--accent)' : 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.2)'} strokeWidth={c.route === 'direct' ? 4 : 2} strokeDasharray={c.directBuilt ? undefined : '6 6'} />
            )}
            <path d={main} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={3} />
            {routes && (
              <>
                <text x={170} y={240} textAnchor="middle" fill="var(--muted)" fontSize={11} fontFamily="var(--font-mono)">
                  courtyard ×0.85
                </text>
                <text x={145} y={116} textAnchor="middle" fill="var(--muted)" fontSize={10} fontFamily="var(--font-mono)">
                  {c.directBuilt ? 'direct ×1.00' : 'direct · not built'}
                </text>
              </>
            )}
            {/* the night garden sits in the courtyard */}
            {gardenIntact ? (
              <g transform="translate(170,170)">
                <circle r={26} fill="rgba(80,160,100,0.25)" filter="url(#soft)" />
                <circle cx={-8} cy={-2} r={10} fill="#4f9a62" />
                <circle cx={8} cy={-6} r={12} fill="#5fae70" />
                <rect x={-1.5} y={4} width={3} height={10} fill="#6b4b35" />
                <text y={-22} textAnchor="middle" fill="#a7d8c4" fontSize={10}>
                  night garden
                </text>
              </g>
            ) : (
              <g transform="translate(170,170)">
                <rect x={-24} y={-14} width={48} height={28} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <text y={-22} textAnchor="middle" fill="var(--faint)" fontSize={10}>
                  former garden
                </text>
              </g>
            )}
            {/* work moving along the line */}
            {!reducedMotion && flowing &&
              [0, 1, 2, 3].map((i) => (
                <circle key={`${c.route}-${last}-${i}`} r={3.5} fill="#f3d9a8">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i * dur) / 4}s`} path={`${active} ${main.replace('M270,130', 'L270,130')}`} />
                </circle>
              ))}
            {/* queues: a stack of crates in front of each station */}
            {open.slice(1).map((st, i) => {
              const q = c.queues[open[i] as keyof C02State['queues']];
              const n = Math.round((q / BUILDING.bufferCap) * 10);
              const [x] = POS[st];
              const full = q >= BUILDING.bufferCap;
              return (
                <g key={`q-${st}`} transform={`translate(${x - 52},${118})`}>
                  {Array.from({ length: n }, (_, j) => (
                    <rect key={j} x={(j % 2) * 9} y={-Math.floor(j / 2) * 7} width={8} height={6} rx={1} fill={full ? 'var(--accent)' : 'rgba(167,216,196,0.7)'} />
                  ))}
                </g>
              );
            })}
            {/* stations: open ones, and faint outlines where the building has not opened yet */}
            {STATIONS.map((st) => {
              const [x, y] = POS[st];
              if (!open.includes(st)) {
                return (
                  <g key={st} transform={`translate(${x},${y})`} opacity={0.35}>
                    <circle r={22} fill="none" stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" />
                  </g>
                );
              }
              const isB = st === blocked;
              const byHand = st === 'dock' && !c.upgrades.dockCrew;
              return (
                <g key={st} transform={`translate(${x},${y})`} className="station-node" onClick={() => act({ type: 'c02/hand', station: st })} role="button" aria-label={`Lend a hand at ${NAMES[st]}`}>
                  {isB && (
                    <circle r={34} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.8}>
                      {!reducedMotion && <animate attributeName="r" values="30;36;30" dur="1.8s" repeatCount="indefinite" />}
                    </circle>
                  )}
                  <circle r={26} fill="rgba(10,12,12,0.9)" stroke={isB ? 'var(--accent)' : 'rgba(255,255,255,0.45)'} strokeWidth={2} />
                  <text textAnchor="middle" y={5} fill="#fff" fontSize={byHand ? 11 : 15} fontFamily="var(--font-mono)">
                    {byHand ? 'hand' : (rates[st] / 1000).toFixed(1)}
                  </text>
                  <text textAnchor="middle" y={-38} fill={isB ? 'var(--accent)' : 'var(--muted)'} fontSize={12}>
                    {NAMES[st]}
                  </text>
                </g>
              );
            })}
            {/* heat, once it is part of the job */}
            {heatIntroduced(c) && (
              <g transform="translate(470,22)">
                <text x={0} y={-6} fill="var(--muted)" fontSize={11}>
                  Heat {Math.round(heat)}
                  {c.throttled ? ' · throttled 25%' : ''}
                </text>
                <rect x={0} y={0} width={150} height={10} rx={5} fill="rgba(255,255,255,0.08)" />
                <rect x={0} y={0} width={(150 * heat) / 100} height={10} rx={5} fill={c.throttled ? 'var(--danger)' : heat > 50 ? 'var(--warn)' : 'var(--accent-2)'} />
                <line x1={75} x2={75} y1={-2} y2={12} stroke="#fff" opacity={0.5} />
                <line x1={120} x2={120} y1={-2} y2={12} stroke="var(--danger)" />
              </g>
            )}
            {/* the contract */}
            <g transform="translate(20,22)">
              <text fill="var(--muted)" fontSize={11}>
                {done ? 'All contracts delivered' : `Contract ${c.contractIndex + 1} of ${CONTRACTS.length} · ${k.title} · ${Math.floor(c.contractWorkMilli / 1000)} / ${k.work / 1000}`}
              </text>
              <rect y={8} width={150} height={6} rx={3} fill="rgba(255,255,255,0.08)" />
              <rect y={8} width={150 * Math.min(1, progress)} height={6} rx={3} fill="var(--accent)" />
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}
