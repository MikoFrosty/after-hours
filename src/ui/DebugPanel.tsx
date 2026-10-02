import { useEffect } from 'react';
import { game } from '../runtime/game';
import { useGame } from './hooks';
import { finishCurrent, grantClips } from '../game/debug';

const SPEEDS = [1, 2, 5, 10, 30];

/** Playtesting tools: speed the clock, add clips, finish the current goal, jump between stages. Toggle with ` (backquote). */
export function DebugPanel() {
  const { s } = useGame();
  if (!game.debugOpen || !s) return null;
  const finishLabel = s.chapter === '01' ? 'Finish the night’s order' : s.chapter === '02' ? 'Finish this contract' : null;
  return (
    <div className="debug-panel" role="dialog" aria-label="Debug tools">
      <div className="row between">
        <strong>Debug</strong>
        <button className="btn ghost small" onClick={() => game.toggleDebug(false)} aria-label="Close debug tools">
          ✕
        </button>
      </div>
      <div className="debug-group">
        <span className="tiny muted">Time speed</span>
        <div className="row">
          {SPEEDS.map((v) => (
            <button key={v} className="btn small" aria-pressed={game.debugSpeed === v} onClick={() => game.setDebugSpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
      </div>
      <div className="debug-group">
        <span className="tiny muted">{s.chapter === '02' ? 'Clips to spend' : 'Clips on the desk'}</span>
        <div className="row">
          {[100, 1000, 10000].map((n) => (
            <button key={n} className="btn small" onClick={() => game.debug((st) => grantClips(st, n))}>
              +{n.toLocaleString('en-US')}
            </button>
          ))}
        </div>
      </div>
      {finishLabel && (
        <div className="debug-group">
          <button className="btn small" onClick={() => game.debug(finishCurrent)}>
            {finishLabel}
          </button>
        </div>
      )}
      <div className="debug-group">
        <span className="tiny muted">Jump</span>
        <div className="row">
          <button className="btn small" onClick={() => void game.jumpTo('01')}>
            Restart the night
          </button>
          <button className="btn small" onClick={() => void game.jumpTo('02')}>
            Start the building
          </button>
        </div>
        <button className="btn small ghost" onClick={() => game.continuePastDemo()} title="The unfinished chapters 3–8">
          {s.flags['campaign.full'] ? 'Unfinished chapters unlocked' : 'Continue past the demo'}
        </button>
      </div>
      <div className="tiny faint">
        Stage {s.chapter} · {Math.floor(s.simMs / 60000)} min {Math.floor((s.simMs % 60000) / 1000)} s simulated · ` toggles this panel
      </div>
    </div>
  );
}

/** Backquote opens and closes the debug tools anywhere in the game. */
export function useDebugKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) game.toggleDebug();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
