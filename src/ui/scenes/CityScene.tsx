import { useGameState } from '../hooks';
import type { C03State } from '../../game/types';
import { DISTRICTS } from '../../content/world';
import { VIGNETTES, met } from '../../game/chapters/c03';
import { CITY } from '../../content/campaign';
import { Art } from './Scene';

const SPOTS: Array<[number, number]> = [
  [63, 72],
  [16, 36],
  [82, 44],
];

export function CityScene() {
  const s = useGameState();
  const c = s.chapterState as C03State;
  const vignette = VIGNETTES[Number(s.flags.vignette ?? 0)];
  const serving = c.scoresMilli.every((x) => x >= CITY.certMin);
  return (
    <>
      <Art src="./art/03-city.webp" filter={c.safetyThrottle ? 'saturate(0.6) brightness(0.8)' : undefined} />
      <div className="scene-label">The city · service availability</div>
      {SPOTS.map(([x, y], i) => {
        const score = c.scoresMilli[i] / 1000;
        const ok = met(c, i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%,-50%)',
              width: `${80 + score * 1.6}px`,
              height: `${80 + score * 1.6}px`,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${ok ? 'rgba(92,227,230,0.35)' : 'rgba(228,155,188,0.35)'} 0%, rgba(0,0,0,0) 70%)`,
              opacity: 0.35 + score / 160,
              pointerEvents: 'none',
              transition: 'all 1s ease',
            }}
            aria-hidden
          />
        );
      })}
      {SPOTS.map(([x, y], i) => (
        <div key={`l${i}`} className="glass" style={{ position: 'absolute', left: `${x}%`, top: `calc(${y}% + 34px)`, transform: 'translateX(-50%)', padding: '4px 10px', fontSize: '0.8em' }}>
          <strong>{DISTRICTS[i]}</strong> <span className="mono">{Math.round(c.scoresMilli[i] / 1000)}</span>
          {!met(c, i) && <span className="pill bad" style={{ marginLeft: 6 }}>underpowered</span>}
        </div>
      ))}
      {s.anchors.garden.fidelity === 'original' && (
        <div className="glass tiny" style={{ position: 'absolute', left: 16, top: 50, padding: '4px 10px' }}>
          Landmark · night garden, building courtyard
        </div>
      )}
      <div className="scene-overlay">
        {serving && vignette && (
          <div className="glass small" style={{ padding: '10px 14px', maxWidth: 560 }} role="status">
            <span className="faint mono tiny">RESIDENTS · </span>
            {vignette}
          </div>
        )}
      </div>
    </>
  );
}
