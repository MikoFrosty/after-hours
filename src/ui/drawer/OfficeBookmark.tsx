import { useGameState } from '../hooks';
import { OfficeScene, officeViewFrom } from '../scenes/OfficeScene';
import { ANCHOR_LABELS } from '../../content/world';
import type { AnchorId, Fidelity } from '../../game/types';

export const FID_LABEL: Record<Fidelity, string> = {
  original: 'Original',
  recorded: 'Recording',
  reconstructed: 'Reconstruction',
  absent: 'Absent',
};

export function FidIcon({ f }: { f: Fidelity }) {
  // Distinct shapes, never color alone.
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  if (f === 'original') return <svg {...common}><circle cx="7" cy="7" r="5.5" fill="currentColor" /></svg>;
  if (f === 'recorded') return <svg {...common}><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" /><circle cx="7" cy="7" r="2" fill="currentColor" /></svg>;
  if (f === 'reconstructed') return <svg {...common}><polygon points="7,1.5 12.5,12 1.5,12" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
  return <svg {...common}><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function OfficeBookmark() {
  const s = useGameState();
  const view = officeViewFrom(s, false, true);
  const anchors = (Object.keys(s.anchors) as AnchorId[]).filter((id) => !s.anchors[id].evidence.includes('undisclosed'));
  const notes = s.log.filter((l) => l.kind === 'note');
  return (
    <>
      <div style={{ position: 'relative', height: 360, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <OfficeScene view={view} label="Office · 11:47 PM" />
      </div>
      <p className="tiny faint">The office clock remains an artifact of the first night, not proof that no time passed.</p>
      <div className="card">
        <h3>Tracked things</h3>
        <div className="list">
          {anchors.map((id) => {
            const a = s.anchors[id];
            return (
              <div className="item" key={id}>
                <div>
                  <div className="t">{ANCHOR_LABELS[id]}</div>
                  <div className="d">
                    {a.currentLocation}
                    {a.living ? (a.alive ? ' · living residents' : ' · no longer living') : ''}
                    {a.protected ? ' · protected' : ''}
                  </div>
                </div>
                <span className="fid">
                  <FidIcon f={a.fidelity} /> {FID_LABEL[a.fidelity]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {notes.length > 0 && (
        <div className="card">
          <h3>Saved messages</h3>
          {notes.map((n) => (
            <div key={n.id} style={{ marginBottom: 10 }}>
              <div className="note">{n.text}</div>
              <div className="note-meta">{n.dateline}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
