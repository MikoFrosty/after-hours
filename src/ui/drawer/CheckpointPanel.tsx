import { useMemo, useRef, useState } from 'react';
import { game } from '../../runtime/game';
import { deleteCheckpoint, parse } from '../../game/save';
import { useGameState } from '../hooks';
import { download } from '../TitleScreen';

export function CheckpointPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = useMemo(() => game.checkpoints().slice().reverse(), [rev, s.revision]);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="row">
        <button className="btn small" onClick={() => { game.save('manual'); setMsg('Saved.'); }}>Save now</button>
        <button className="btn small" onClick={() => { game.manualCheckpoint(); setRev((r) => r + 1); }}>Store a checkpoint</button>
        <button className="btn small" onClick={() => { const t = game.exportSave(); if (t) download(`after-hours-ch${s.chapter}.json`, t); }}>Export save file</button>
        <button className="btn small" onClick={() => fileRef.current?.click()}>Import save file</button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = parse(await f.text());
          if (r.status === 'ok') { game.load(r.state, false); game.save('import'); onClose(); }
          else setMsg(`Import rejected: ${r.status === 'invalid' ? r.errors.join(' ') : ''}`);
        }} />
      </div>
      {msg && <div className="small muted" role="status">{msg}</div>}
      <p className="tiny faint">Checkpoints are created at every chapter entry and before every charter and irreversible decision. The precommit checkpoint cannot be deleted. Restoring never merges timelines.</p>
      <div className="list">
        {list.map((cp) => (
          <div className="item" key={cp.id}>
            <div>
              <div className="t">{cp.label}</div>
              <div className="d mono">Chapter {cp.chapter} · {new Date(cp.createdAt).toLocaleString()}</div>
            </div>
            <div className="row">
              {confirm === cp.id ? (
                <>
                  <button className="btn small primary" onClick={() => { game.restoreCheckpoint(cp); onClose(); }}>Restore</button>
                  <button className="btn small" onClick={() => setConfirm(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn small" onClick={() => setConfirm(cp.id)}>Return here</button>
              )}
              {cp.kind !== 'precommit' && cp.kind !== 'chapter' && (
                <button className="btn small ghost" aria-label={`Delete ${cp.label}`} onClick={() => { deleteCheckpoint(cp.id); setRev((r) => r + 1); }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="btn ghost" onClick={() => game.toTitle()}>Return to title</button>
    </>
  );
}
