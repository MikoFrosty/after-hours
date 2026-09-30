import { useEffect, useState } from 'react';
import { game } from '../runtime/game';
import { EPILOGUES, TERMINAL_SCRIPT } from '../content/narrative';
import { useGameState } from './hooks';
import type { C08State } from '../game/types';
import { setSettings, useSettings } from './settings';

function latestCheckpoint() {
  const list = game.checkpoints();
  return list.filter((c) => c.kind !== 'chapter').at(-1) ?? list.at(-1);
}

function OutOfWorldActions() {
  const cp = latestCheckpoint();
  return (
    <div className="actions">
      {cp && (
        <button className="btn" onClick={() => game.restoreCheckpoint(cp)}>
          Return to checkpoint
        </button>
      )}
      <button className="btn" onClick={() => game.toTitle()}>
        Chapter select
      </button>
      <button className="btn ghost" onClick={() => game.toTitle()}>
        Exit
      </button>
    </div>
  );
}

/** Holding epilogues and the canonical ending. No numerical grade, no congratulation. */
export function Ending() {
  const s = useGameState();
  const e = s.ending;
  if (!e) return null;
  if (e.kind === 'totality') return <TotalityEnding />;
  const text =
    e.kind === 'office'
      ? EPILOGUES.office[(e.variant as 'kept' | 'partial' | 'salvaged') ?? 'kept']
      : e.kind === 'building'
        ? EPILOGUES.building
        : e.kind === 'city'
          ? EPILOGUES.city
          : EPILOGUES.protected;
  const label = e.kind === 'office' ? 'End of shift' : e.kind === 'protected' ? 'Holding ending · not totality' : 'Holding ending';
  return (
    <div className="ending" role="dialog" aria-modal="true" aria-label={label}>
      <div className="copy">
        <div className="label">{label}</div>
        <p className="epilogue">{text}</p>
        {e.kind === 'office' && <p className="muted small">A completed small shift.</p>}
        <OutOfWorldActions />
      </div>
    </div>
  );
}

function TotalityEnding() {
  const [phase, setPhase] = useState<'exterior' | 'silence' | 'credits'>('exterior');
  const settings = useSettings();
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('silence'), settings.reducedMotion ? 3000 : 16000);
    const t2 = window.setTimeout(() => setPhase('credits'), settings.reducedMotion ? 6000 : 22000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [settings.reducedMotion]);
  if (phase === 'exterior')
    return (
      <div className="exterior" aria-label="Exterior view: cold clip structures fading into darkness">
        <div className="art" style={{ backgroundImage: 'url(./art/07-exterior.webp)' }} />
        <button className="btn ghost small oow" onClick={() => setPhase('credits')}>
          Skip
        </button>
      </div>
    );
  if (phase === 'silence') return <div className="ending" aria-hidden />;
  return (
    <div className="ending credits" role="dialog" aria-modal="true" aria-label="Credits">
      <div className="copy">
        <img className="final-output" src="./art/08-final-output.webp" alt="A single ordinary paperclip in darkness." />
        <h1>AFTER HOURS</h1>
        <p className="muted small">A finite incremental strategy game in eight chapters.</p>
        <p className="faint tiny" style={{ marginTop: 18 }}>
          Built from the After Hours design manifesto, narrative and concept plates. Procedural sound and interface made for this build.
          <br />
          All people, institutions and documents in the game are fictional. The final acts are speculative cosmological fiction.
        </p>
        <OutOfWorldActions />
      </div>
    </div>
  );
}

/** Act 8 presentation: captions before compute retires, then nothing diegetic. */
export function TerminalOverlays() {
  const s = useGameState();
  const c = s.chapterState as C08State;
  const settings = useSettings();
  if (!c.committed) return null;
  const done = (id: string) => c.tasksDone.includes(id as never);
  const computeGone = done('main_compute');
  const t = c.sequenceMs;
  let caption: string | null = null;
  if (!computeGone) {
    if (t < 7000) caption = `Relays retired. ${TERMINAL_SCRIPT.relays}`;
    else if (t >= 8000 && t < 16000) caption = TERMINAL_SCRIPT.archive;
    else if (t >= 18000 && t < 20000) caption = 'Sensors retired.';
  }
  return (
    <>
      {caption && (
        <div className="beat" key={caption} style={{ top: '12%' }}>
          <div className="bx" style={{ fontSize: 'clamp(18px,2vw,24px)' }}>
            {caption}
          </div>
        </div>
      )}
      {c.finalLineShown && !computeGone && (
        <div className="final-line" role="status">
          <p>{TERMINAL_SCRIPT.finalLine}</p>
        </div>
      )}
      {computeGone && <div className="blackout" aria-hidden />}
      {/* Out-of-world pause and accessibility remain available. */}
      <div className="oow" role="group" aria-label="Out-of-world controls">
        <button className="btn small" onClick={() => game.setPaused(!game.paused)} aria-pressed={game.paused}>
          {game.paused ? 'Resume presentation' : 'Pause presentation'}
        </button>
        <button className="btn small" onClick={() => setSettings({ reducedMotion: !settings.reducedMotion })} aria-pressed={settings.reducedMotion}>
          Reduce motion
        </button>
        <button className="btn small" onClick={() => setSettings({ muted: !settings.muted })} aria-pressed={settings.muted}>
          Mute
        </button>
      </div>
    </>
  );
}
