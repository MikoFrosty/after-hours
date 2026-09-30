import { useGameState, act } from '../hooks';
import type { C07State } from '../../game/types';
import { CELL_NAMES, recovered, surveyed } from '../../game/chapters/c07';
import { mass } from '../../game/ledger';
import { Art } from './Scene';

export function CosmicScene() {
  const s = useGameState();
  const c = s.chapterState as C07State;
  const cleared = c.cells.filter(recovered).length;
  return (
    <>
      <Art src="./art/07-ledger.webp" filter={`brightness(${0.85 - cleared * 0.05}) saturate(${1 - cleared * 0.08})`} />
      <div className="scene-label">Inventory · eight cells</div>
      <div className="scene-overlay">
        <div className="glass" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }} role="list" aria-label="Cosmic inventory cells">
            {c.cells.map((cell) => {
              const cov = cell.coverageMilli / 1000;
              const remain = cell.startMass === 0n ? 0 : Number((mass(s, cell.account) * 1000n) / cell.startMass) / 10;
              const locked = cell.exotic && s.projects.coupling !== 'complete';
              return (
                <button
                  key={cell.index}
                  role="listitem"
                  onClick={() => act({ type: 'c07/slots', cell: cell.index, role: surveyed(cell) ? 'recovery' : 'survey', delta: 1 })}
                  className="btn"
                  style={{
                    position: 'relative',
                    height: 86,
                    padding: 8,
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderColor: cell.exotic ? 'rgba(141,115,220,0.7)' : undefined,
                    textAlign: 'left',
                    gap: 2,
                  }}
                  aria-label={`${CELL_NAMES[cell.index]}: coverage ${Math.floor(cov)} percent, ${recovered(cell) ? 'recovered' : `${remain.toFixed(0)} percent of stock remaining`}${locked ? ', requires matter coupling' : ''}. Add a slot.`}
                >
                  <span
                    aria-hidden
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${cov}%`, background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 4px, transparent 4px 8px)' }}
                  />
                  <span aria-hidden style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${remain}%`, background: cell.exotic ? '#8d73dc' : 'var(--accent)' }} />
                  <span className="mono tiny faint">CELL {cell.index + 1}</span>
                  <span className="small" style={{ lineHeight: 1.2 }}>
                    {CELL_NAMES[cell.index]}
                  </span>
                  <span className="tiny mono faint">
                    {recovered(cell) ? 'recovered' : surveyed(cell) ? (locked ? 'coupling required' : `${remain.toFixed(0)}% stock`) : `${Math.floor(cov)}% surveyed`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
