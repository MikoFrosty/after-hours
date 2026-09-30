import { useGameState } from '../hooks';
import { openCase } from '../panels/P04';
import type { C04State, CaseId } from '../../game/types';
import { ANCHOR_LABELS } from '../../content/world';
import { FidIcon, FID_LABEL } from '../drawer/OfficeBookmark';
import { Art } from './Scene';

const SPOTS: Record<CaseId, [number, number]> = {
  habitat: [62, 30],
  garden: [44, 58],
  square: [80, 62],
  mural: [24, 40],
  correspondence: [88, 30],
  office: [14, 74],
};

export function GardenScene() {
  const s = useGameState();
  const c = s.chapterState as C04State;
  const lost = Object.values(c.cases).filter((k) => k.resolved && k.treatment !== 'original' && k.treatment !== 'relocate').length;
  // The world loses particulars: saturation falls with every non-original outcome.
  const filter = `saturate(${Math.max(0.25, 1 - lost * 0.14)}) brightness(${1 - lost * 0.03})`;
  return (
    <>
      <Art src="./art/04-garden.webp" filter={filter} />
      <div className="scene-label">Preservation · six cases</div>
      {(Object.keys(SPOTS) as CaseId[]).map((id) => {
        const [x, y] = SPOTS[id];
        const k = c.cases[id];
        const fid = s.anchors[id].fidelity;
        const focus = c.focus === id;
        return (
          <button
            key={id}
            className="glass"
            onClick={() => openCase(c, id)}
            aria-pressed={focus}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%,-50%)',
              padding: '6px 10px',
              minHeight: 44,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderColor: focus ? 'var(--accent)' : undefined,
              color: 'var(--text)',
              fontSize: '0.82em',
            }}
          >
            <FidIcon f={fid} />
            <span>{ANCHOR_LABELS[id]}</span>
            <span className="faint mono">{k.resolved ? FID_LABEL[fid] : k.locked ? `${Math.floor(k.workMilli / 1000)}/30` : 'open'}</span>
          </button>
        );
      })}
    </>
  );
}
