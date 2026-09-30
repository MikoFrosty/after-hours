import { useGameState } from '../hooks';
import { useSettings } from '../settings';
import type { C05State } from '../../game/types';
import { limits, limitingRole, output, ROLES } from '../../game/chapters/c05';
import { Art } from './Scene';

const COLORS = { collector: '#d78351', fabricator: '#cfd7de', radiator: '#5ce3e6', support: '#8fd6a6' } as const;

export function SolarScene() {
  const s = useGameState();
  const c = s.chapterState as C05State;
  const { reducedMotion } = useSettings();
  const l = limits(s);
  const role = limitingRole(s);
  const chips = ROLES.flatMap((r) => Array.from({ length: c.alloc[r] }, () => r));
  const hot = role === 'cooling';
  const out = output(s);
  const skyGone = s.anchors.sky.fidelity === 'absent';
  return (
    <>
      <Art src="./art/05-sun.webp" filter={skyGone ? 'hue-rotate(-12deg) saturate(0.8) brightness(0.85)' : undefined} />
      <div className="scene-label">Orbital allocation · schematic</div>
      <div className="scene-overlay">
        <div className="glass" style={{ padding: 10 }}>
          <svg className="schematic" viewBox="0 0 640 230" role="img" aria-label={`Ten orbital slots: ${ROLES.map((r) => `${c.alloc[r]} ${r}`).join(', ')}. Output ${(out / 1000).toFixed(2)} work per second, limited by ${role}.`}>
            <defs>
              <radialGradient id="sun">
                <stop offset="0" stopColor="#fff2c2" />
                <stop offset="0.4" stopColor="#f5a25a" />
                <stop offset="1" stopColor="#d7835100" />
              </radialGradient>
            </defs>
            <circle cx={120} cy={115} r={70} fill="url(#sun)" />
            <ellipse cx={120} cy={115} rx={105} ry={38} fill="none" stroke="rgba(255,255,255,0.18)" />
            <g>
              {!reducedMotion && <animateTransform attributeName="transform" type="rotate" from="0 120 115" to="360 120 115" dur="80s" repeatCount="indefinite" />}
              {chips.map((r, i) => {
                const a = (i / 10) * Math.PI * 2;
                return <rect key={i} x={120 + Math.cos(a) * 105 - 6} y={115 + Math.sin(a) * 38 - 6} width={12} height={12} rx={2} fill={COLORS[r]} opacity={0.95} />;
              })}
            </g>
            {hot && <circle cx={120} cy={115} r={120} fill="rgba(226,135,111,0.12)" />}
            {[
              ['Power ÷ 2', l.power, 'power'],
              ['Fabrication 2F', l.fabrication, 'fabrication'],
              [`Cooling ${s.projects.radiators === 'complete' ? '3R' : '2R'}`, l.cooling, 'cooling'],
            ].map(([name, v, key], i) => {
              const w = Math.min(300, ((v as number) / 12000) * 300);
              const isMin = key === role;
              return (
                <g key={key as string} transform={`translate(280, ${50 + i * 50})`}>
                  <text fill={isMin ? 'var(--accent)' : 'var(--muted)'} fontSize={12}>
                    {name as string} · {((v as number) / 1000).toFixed(2)} work/s {isMin ? '· limit' : ''}
                  </text>
                  <rect y={8} width={300} height={10} rx={5} fill="rgba(255,255,255,0.07)" />
                  <rect y={8} width={w} height={10} rx={5} fill={isMin ? 'var(--accent)' : 'rgba(255,255,255,0.4)'} />
                </g>
              );
            })}
            <text x={280} y={210} fill="var(--text)" fontSize={13} fontFamily="var(--font-mono)">
              Output {(out / 1000).toFixed(3)} work/s{c.starChoice && !c.habitatRelocated ? ' (×0.90 deferral)' : ''}
            </text>
          </svg>
        </div>
      </div>
    </>
  );
}
