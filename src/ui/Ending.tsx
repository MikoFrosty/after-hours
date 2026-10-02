import { useEffect, useState } from 'react';
import { game } from '../runtime/game';
import { EPILOGUES, TERMINAL_SCRIPT } from '../content/narrative';
import { useGameState } from './hooks';
import type { C02State, C08State } from '../game/types';
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
  if (e.kind === 'demo') return <DemoEnding />;
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

/** The end of the playable demo: what this playthrough chose, and thanks. */
function DemoEnding() {
  const s = useGameState();
  const minutes = (ch: '01' | '02') => {
    const sum = s.summaries[ch];
    return Math.max(1, Math.round((sum?.activePlayMs || sum?.simMs || 0) / 60000));
  };
  const c = s.chapterState.kind === '02' ? (s.chapterState as C02State) : null;
  const kept = (['cabinet', 'lamp', 'frame'] as const).filter((k) => s.anchors[k].fidelity === 'original');
  const facts: Array<[string, string]> = [
    ['The night shift', `${minutes('01')} min`],
    ['The building', `${minutes('02')} min`],
    ['The old office', kept.length === 3 ? 'kept whole' : kept.length === 0 ? 'all sent to the line' : `kept: ${kept.join(', ')}`],
    ['The night garden', s.anchors.garden.fidelity === 'original' ? 'still in the courtyard' : 'paved over'],
  ];
  if (c) facts.push(['Rush orders won', String(c.rushesWon)]);
  return (
    <div className="ending demo-end" role="dialog" aria-modal="true" aria-label="End of the demo">
      <div className="art" style={{ backgroundImage: 'url(./art/03-city.webp)' }} aria-hidden />
      <div className="copy">
        <div className="label">End of the demo</div>
        <h1 className="demo-title">The city has the same problem, at a larger scale.</h1>
        <p className="epilogue">
          The building runs without a night crew now, and the city wants the same. What happens next (the city, the garden under glass, the sun, the
          distant offices) is still being built.
        </p>
        <div className="facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Thank you for playing.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => game.newGame()}>
            Play again from the start
          </button>
          <button className="btn ghost" onClick={() => game.toTitle()}>
            Back to the title
          </button>
        </div>
      </div>
    </div>
  );
}
