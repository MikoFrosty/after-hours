import { useEffect, useState } from 'react';
import { game } from '../runtime/game';
import { useGameState } from './hooks';
import { metrics, storyClock, charterStatus, STORY_SPANS, STORY_SCALE_TEXT } from '../game/selectors';
import { CHAPTER_META } from '../content/campaign';
import type { C01State, C08State } from '../game/types';
import { DecisionDialog } from './DecisionDialog';
import { Drawer, type DrawerTab } from './drawer/Drawer';
import { ChapterIntro } from './ChapterIntro';
import { Ending, TerminalOverlays } from './Ending';
import { Scene } from './scenes/Scene';
import { Panel } from './panels/Panel';

export function Shell() {
  const s = useGameState();
  const [tab, setTab] = useState<DrawerTab | null>(null);
  const m = metrics(s);
  const meta = CHAPTER_META[s.chapter];
  const c8 = s.chapterState.kind === '08' ? (s.chapterState as C08State) : null;
  // Act 8 withdraws diegetic features in causal order.
  const relaysGone = Boolean(c8?.tasksDone.includes('relays'));
  const archiveGone = Boolean(c8?.tasksDone.includes('archive'));
  const computeGone = Boolean(c8?.tasksDone.includes('main_compute'));
  const choice = s.choices[0];
  const unread = s.log.filter((l) => l.kind === 'letter' || l.kind === 'note').length;
  // In the office, faster pace and skipping arrive with the wire feeder, so the night cannot be fast-forwarded.
  const paceOpen = s.chapter !== '01' || Boolean(s.flags['c01.pace']);
  const inOffice = s.chapter === '01';
  const c1 = inOffice ? (s.chapterState as C01State) : null;
  const showLedger = !c1 || c1.owned.length > 0 || c1.sealed > 0;
  const hasReflection = Object.keys(s.flags).some((k) => k.startsWith('reflection.')) || s.anchors.frame.fidelity === 'absent';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (s.choices.length || game.introChapter) return;
      if (e.key === 'p' || e.key === 'P') game.setPaused(!game.paused);
      else if (e.key === '1') game.setSpeed(1);
      else if (e.key === '4' && paceOpen) game.setSpeed(4);
      else if ((e.key === 'n' || e.key === 'N') && s.mode === 'playing' && paceOpen) void game.advanceToNextEvent();
      else if ((e.key === 'l' || e.key === 'L') && !archiveGone) setTab((t) => (t === 'ledger' ? null : 'ledger'));
      else if ((e.key === 'o' || e.key === 'O') && !computeGone) setTab((t) => (t === 'office' ? null : 'office'));
      else if (e.key === 'Escape') setTab(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, archiveGone, computeGone, paceOpen]);

  if (s.mode === 'holding' || s.mode === 'ended') return <Ending />;

  const saveAge = Math.max(0, Math.round((Date.now() - game.saveStatus.at) / 1000));

  return (
    <div className="app" data-chapter={s.chapter}>
      <header className={`rail ${computeGone ? 'withdrawn' : ''}`} aria-label="Status rail">
        <div className="brand">
          <span className="ch">
            {s.chapter} · {meta.verb}
          </span>
          <span className="name">{meta.title}</span>
        </div>
        <div className="metrics" role="group" aria-label="Headline metrics">
          {m.items.slice(0, 2).map((x) => (
            <div className="metric" key={x.label} title={x.hint}>
              <div className="k">{x.label}</div>
              <div className="v">{x.value}</div>
            </div>
          ))}
          <div className="metric bottleneck">
            <div className="k">Bottleneck</div>
            <div className="v">{m.bottleneck}</div>
          </div>
          <div className="metric" title="The most recent charter signed">
            <div className="k">Charter</div>
            <div className="v">{charterStatus(s)}</div>
          </div>
        </div>
        <div className="story-clock" title={`Presentation scale only, not a physics simulation: ${STORY_SCALE_TEXT[s.chapter]}. Simulated ${Math.round(s.simMs / 1000)} s; active play ${Math.round(s.activePlayMs / 60000)} min.`}>
          {storyClock(s)}
          <small>{STORY_SPANS[s.chapter]}</small>
        </div>
        <div className="controls" role="group" aria-label="Time controls">
          <button className="btn icon" aria-pressed={game.paused} onClick={() => game.setPaused(!game.paused)} title="Pause (P)" aria-label={game.paused ? 'Resume' : 'Pause'}>
            {game.paused ? '▶' : '❚❚'}
          </button>
          {paceOpen && (
            <>
              <button className="btn small" aria-pressed={game.speed === 1} onClick={() => game.setSpeed(1)} title="Normal pace (1)">
                1×
              </button>
              <button className="btn small" aria-pressed={game.speed === 4} onClick={() => game.setSpeed(4)} title="Routine pace (4)" disabled={s.mode === 'terminal'}>
                4×
              </button>
              {game.fastForward ? (
                <button className="btn small" onClick={() => game.cancelAdvance()}>
                  Stop
                </button>
              ) : (
                <button
                  className="btn small"
                  onClick={() => void game.advanceToNextEvent()}
                  disabled={s.choices.length > 0 || s.mode !== 'playing' || game.paused}
                  title="Advance to next event (N)"
                >
                  Next event ⏭
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="stage">
        <Scene />
        <section className={`panel ${computeGone ? 'withdrawn' : ''}`} aria-label={`${meta.title} controls`}>
          {game.paused && (
            <div className="card row between" role="status">
              <span>{game.pauseReason ?? 'Paused.'}</span>
              <button className="btn small" onClick={() => game.setPaused(false)}>
                Resume
              </button>
            </div>
          )}
          <Panel />
        </section>
      </main>

      <footer className={`dock ${computeGone ? 'withdrawn' : ''}`} aria-label="Records and settings">
        {!archiveGone && (
          <button className="btn ghost" onClick={() => setTab('log')}>
            Log {unread > 0 && <span className="dot" aria-label={`${unread} letters`} />}
          </button>
        )}
        {!archiveGone && showLedger && (
          <button className="btn ghost" onClick={() => setTab('ledger')}>
            Ledger <span className="kbd">L</span>
          </button>
        )}
        {!computeGone && !inOffice && (
          <button className="btn ghost" onClick={() => setTab('office')}>
            Office <span className="kbd">O</span>
          </button>
        )}
        {!archiveGone && hasReflection && (
          <button className="btn ghost" onClick={() => setTab('archive')}>
            Archive
          </button>
        )}
        {s.chapter >= '06' && !relaysGone && (
          <button className="btn ghost" onClick={() => setTab('regions')}>
            Regions
          </button>
        )}
        <button className="btn ghost" onClick={() => setTab('checkpoints')}>
          Checkpoints
        </button>
        <button className="btn ghost" onClick={() => setTab('settings')}>
          Settings
        </button>
        <span className={`save-status ${game.saveStatus.ok ? '' : 'bad'}`} role="status" aria-live="polite">
          {game.saveStatus.ok ? (game.saveStatus.at ? `${game.saveStatus.message} · ${saveAge}s ago` : game.saveStatus.message) : game.saveStatus.message}
        </span>
      </footer>

      {tab && <Drawer tab={tab} onTab={setTab} onClose={() => setTab(null)} />}
      {choice && !game.introChapter && <DecisionDialog key={choice.id} choice={choice} />}
      {game.introChapter && <ChapterIntro chapter={game.introChapter} />}
      {game.conflict && <ConflictDialog />}
      {s.chapter === '08' && <TerminalOverlays />}
      {game.lastRejection && Date.now() - game.lastRejection.at < 2200 && (
        <div className="toastline" role="status">
          {game.lastRejection.text}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {game.toast ? `${game.toast.title}. ${game.toast.text}` : ''}
      </div>
    </div>
  );
}

function ConflictDialog() {
  return (
    <div className="modal-backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title">
        <div className="eyebrow">Save status</div>
        <h2 id="conflict-title">Another window is playing</h2>
        <p>A newer save was written by another tab. Writes from this window are paused so the two timelines are never merged.</p>
        <div className="actions">
          <button
            className="btn"
            onClick={() => {
              const text = game.exportSave();
              if (text) {
                const blob = new Blob([text], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'after-hours-this-window.json';
                a.click();
              }
            }}
          >
            Export this window’s snapshot
          </button>
          <button className="btn primary" onClick={() => game.reloadFromStorage()}>
            Reload the newer save
          </button>
        </div>
      </div>
    </div>
  );
}
