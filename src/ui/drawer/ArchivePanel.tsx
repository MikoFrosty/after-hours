import { useState } from 'react';
import { useGameState } from '../hooks';
import { REFLECTIONS } from '../../content/narrative';

const UNLOCK: Record<string, string> = {
  photograph: 'reflection.photograph',
  city: 'reflection.city',
  instruction: 'reflection.instruction',
  enough: 'reflection.enough',
};

export function ArchivePanel() {
  const s = useGameState();
  const [open, setOpen] = useState<string | null>(null);
  const available = Object.values(REFLECTIONS).filter((r) => s.flags[UNLOCK[r.id]] || (r.id === 'photograph' && s.anchors.frame.fidelity === 'absent'));
  return (
    <>
      <p className="muted small">Optional reflection entries. They do not affect play and none of them announces a correct answer.</p>
      {available.length === 0 && <p className="faint">No entries yet.</p>}
      {available.map((r) => (
        <div className="card reflection" key={r.id}>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'space-between' }} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3em' }}>{r.title}</span>
            <span aria-hidden>{open === r.id ? '−' : '+'}</span>
          </button>
          {open === r.id && r.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ))}
      {Object.keys(REFLECTIONS).length > available.length && (
        <p className="tiny faint">{Object.keys(REFLECTIONS).length - available.length} entries not yet available.</p>
      )}
    </>
  );
}
