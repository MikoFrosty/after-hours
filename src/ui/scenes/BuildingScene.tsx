import { useGameState } from '../hooks';
import { useSettings } from '../settings';
import type { C02State } from '../../game/types';
import { bottleneck, stationRates, throughput, STATIONS, type Station } from '../../game/chapters/c02';
import { BUILDING } from '../../content/campaign';
import { Art } from './Scene';

const POS: Record<Station, [number, number]> = { dock: [70, 120], drawing: [270, 120], bender: [420, 120], dispatch: [570, 120] };
const NAMES: Record<Station, string> = { dock: 'Loading dock', drawing: 'Wire drawing', bender: 'Bender', dispatch: 'Dispatch' };

export function BuildingScene() {
  const s = useGameState();
  const c = s.chapterState as C02State;
  const { reducedMotion } = useSettings();
  const rates = stationRates(c);
  const bn = bottleneck(c);
  const tp = throughput(c);
  const gardenIntact = s.anchors.garden.fidelity === 'original';
  const courtyard = 'M70,120 C120,120 120,205 170,205 C220,205 220,120 270,120';
  const direct = 'M70,120 L270,120';
  const main = 'M270,120 L420,120 L570,120';
  const active = c.route === 'direct' ? direct : courtyard;
  const dur = tp > 0 ? Math.max(0.6, 4 / (tp / 1000)) : 0;
  const heat = c.heatMilli / 1000;
  const target = BUILDING.contracts[Math.min(2, c.contractIndex)] / 1000;
  const progress = c.contractIndex >= 3 ? 1 : c.contractWorkMilli / 1000 / target;
  return (
    <>
      <Art src="./art/02-building.webp" />
      <div className="scene-label">The building · night</div>
      <div className="scene-overlay">
        <div className="glass" style={{ padding: 10 }}>
          <svg className="schematic" viewBox="0 0 640 245" role="img" aria-label={`Pipeline schematic. Route: ${c.route}. Bottleneck: ${NAMES[bn]}. Throughput ${(tp / 1000).toFixed(2)} work per second. Heat ${Math.round(heat)}. ${gardenIntact ? 'The night garden is intact in the courtyard.' : 'The garden has been cleared.'}`}>
            <defs>
              <filter id="soft">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            {/* routes */}
            <path d={courtyard} fill="none" stroke={c.route === 'courtyard' ? 'var(--accent-2)' : 'rgba(255,255,255,0.18)'} strokeWidth={c.route === 'courtyard' ? 4 : 2} />
            <path d={direct} fill="none" stroke={c.directBuilt ? (c.route === 'direct' ? 'var(--accent)' : 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.2)'} strokeWidth={c.route === 'direct' ? 4 : 2} strokeDasharray={c.directBuilt ? undefined : '6 6'} />
            <path d={main} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={3} />
            <text x={170} y={232} textAnchor="middle" fill="var(--muted)" fontSize={11} fontFamily="var(--font-mono)">
              courtyard ×0.85
            </text>
            <text x={160} y={104} textAnchor="middle" fill="var(--muted)" fontSize={10} fontFamily="var(--font-mono)">
              direct ×1.00{c.directBuilt ? '' : ' · not built'}
            </text>
            {/* garden between the routes */}
            {gardenIntact ? (
              <g transform="translate(170,160)">
                <circle r={26} fill="rgba(80,160,100,0.25)" filter="url(#soft)" />
                <circle cx={-8} cy={-2} r={10} fill="#4f9a62" />
                <circle cx={8} cy={-6} r={12} fill="#5fae70" />
                <rect x={-1.5} y={4} width={3} height={10} fill="#6b4b35" />
                {/* label sits in the hollow above the trees, clear of both routes */}
                <text y={-22} textAnchor="middle" fill="#a7d8c4" fontSize={10}>
                  night garden
                </text>
              </g>
            ) : (
              <g transform="translate(170,160)">
                <rect x={-24} y={-14} width={48} height={28} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <text y={-22} textAnchor="middle" fill="var(--faint)" fontSize={10}>
                  former garden
                </text>
              </g>
            )}
            {/* flow */}
            {!reducedMotion && dur > 0 &&
              [0, 1, 2, 3].map((i) => (
                <circle key={`${c.route}-${i}`} r={3.5} fill="#f3d9a8">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i * dur) / 4}s`} path={`${active.replace('L270,120', 'L270,120')} ${main.replace('M270,120', '')}`} />
                </circle>
              ))}
            {/* stations */}
            {STATIONS.map((st) => {
              const [x, y] = POS[st];
              const isB = st === bn;
              return (
                <g key={st} transform={`translate(${x},${y})`}>
                  {isB && <circle r={34} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.8}>{!reducedMotion && <animate attributeName="r" values="30;36;30" dur="1.8s" repeatCount="indefinite" />}</circle>}
                  <circle r={26} fill="rgba(10,12,12,0.9)" stroke={isB ? 'var(--accent)' : 'rgba(255,255,255,0.45)'} strokeWidth={2} />
                  <text textAnchor="middle" y={5} fill="#fff" fontSize={15} fontFamily="var(--font-mono)">
                    {(rates[st] / 1000).toFixed(0)}
                  </text>
                  <text textAnchor="middle" y={-38} fill={isB ? 'var(--accent)' : 'var(--muted)'} fontSize={12}>
                    {NAMES[st]}
                    {isB ? ' · bottleneck' : ''}
                  </text>
                </g>
              );
            })}
            {/* heat gauge */}
            <g transform="translate(470,22)">
              <text x={0} y={-6} fill="var(--muted)" fontSize={11}>
                Heat {Math.round(heat)}
                {c.throttled ? ' · throttled 25%' : ''}
              </text>
              <rect x={0} y={0} width={150} height={10} rx={5} fill="rgba(255,255,255,0.08)" />
              <rect x={0} y={0} width={(150 * heat) / 100} height={10} rx={5} fill={c.throttled ? 'var(--danger)' : heat > 50 ? 'var(--warn)' : 'var(--accent-2)'} />
              <line x1={75} x2={75} y1={-2} y2={12} stroke="#fff" opacity={0.5} />
              <line x1={120} x2={120} y1={-2} y2={12} stroke="var(--danger)" />
              <text x={75} y={26} textAnchor="middle" fill="var(--faint)" fontSize={9}>50</text>
              <text x={120} y={26} textAnchor="middle" fill="var(--faint)" fontSize={9}>80</text>
            </g>
            {/* contract */}
            <g transform="translate(20,22)">
              <text fill="var(--muted)" fontSize={11}>
                {c.contractIndex >= 3 ? 'All contracts delivered' : `Contract ${c.contractIndex + 1} of 3 · ${Math.floor(c.contractWorkMilli / 1000)} / ${target} work`}
              </text>
              <rect y={8} width={110} height={6} rx={3} fill="rgba(255,255,255,0.08)" />
              <rect y={8} width={110 * Math.min(1, progress)} height={6} rx={3} fill="var(--accent)" />
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}
