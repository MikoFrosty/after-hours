import { useEffect, useMemo, useRef, useState } from 'react';
import { game } from '../runtime/game';
import { readSave, parse, importV1, deserialize, readCheckpoints, clearSave, clearCheckpoints } from '../game/save';
import { CHAPTER_META } from '../content/campaign';
import { CHAPTERS } from '../game/types';
import type { ChapterId } from '../game/types';
import { SettingsPanel } from './drawer/SettingsPanel';

const DEV = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

export function TitleScreen() {
  const [view, setView] = useState<'menu' | 'chapters' | 'settings' | 'import'>('menu');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useMemo(() => readSave(), []);
  const checkpoints = useMemo(() => readCheckpoints(), [view]);
  const [time, setTime] = useState('11:47 PM');

  useEffect(() => {
    const t = window.setInterval(() => setTime((x) => (x === '11:47 PM' ? '11:47 PM ' : '11:47 PM')), 1200);
    return () => window.clearInterval(t);
  }, []);

  const begin = () => {
    if (save.status === 'ok' && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    clearCheckpoints();
    clearSave();
    game.newGame();
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const r = parse(text);
    if (r.status === 'ok') {
      game.load(r.state, false);
      game.save('import');
      return;
    }
    // Try an original office save (version 1).
    try {
      const v1 = importV1(deserialize(text));
      if (v1.ok) {
        game.load(v1.state, false);
        game.save('import-v1');
        setMessage(`Imported office save. ${v1.summary.join(' ')}`);
        return;
      }
      setMessage(`Import rejected: ${v1.errors.join(' ')}`);
    } catch {
      setMessage(`Import rejected: ${r.status === 'invalid' ? r.errors.join(' ') : 'unreadable file'}`);
    }
  };

  const chapterEntries = CHAPTERS.map((ch) => ({ ch, cp: checkpoints.filter((c) => c.chapter === ch && c.kind === 'chapter').at(-1) }));

  return (
    <main className="title-screen" aria-label="After Hours title screen">
      <div className="title-art">
        <img src="./art/00-title-office.webp" alt="An isometric office at night: a desk lamp, a green terminal, a wire spool and a small bending machine." />
        <div className="rain" aria-hidden />
        <div className="rain two" aria-hidden />
      </div>
      <div className="title-copy">
        <div className="clock" aria-hidden>
          {time}
        </div>
        <h1>
          AFTER
          <br />
          HOURS
        </h1>
        <div className="tagline">A small game about making more.</div>

        {view === 'menu' && (
          <nav className="title-menu" aria-label="Main menu">
            {save.status === 'ok' && (
              <button className="btn primary" onClick={() => game.continueGame()} autoFocus>
                Continue · Chapter {save.state.chapter}
              </button>
            )}
            {save.status === 'invalid' && (
              <div className="card small">
                <strong>{save.futureVersion ? 'Save from a newer version' : 'Save could not be loaded'}</strong>
                <div className="muted">{save.errors.join(' ')}</div>
                <div className="muted">It has been left untouched. You can export it or start a new shift.</div>
                <button
                  className="btn small"
                  onClick={() => download('after-hours-unreadable-save.json', save.raw)}
                >
                  Export the unreadable save
                </button>
              </div>
            )}
            {!confirmNew ? (
              <button className={`btn ${save.status === 'ok' ? '' : 'primary'}`} onClick={begin} autoFocus={save.status !== 'ok'}>
                Begin the night shift
              </button>
            ) : (
              <div className="card small">
                <div>Starting over replaces your current save and checkpoints on this device.</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small danger" onClick={begin}>
                    Start a new shift
                  </button>
                  <button className="btn small" onClick={() => setConfirmNew(false)}>
                    Keep my save
                  </button>
                </div>
              </div>
            )}
            <button className="btn" onClick={() => setView('chapters')}>
              Chapter select
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import a save file
            </button>
            <button className="btn" onClick={() => setView('settings')}>
              Settings &amp; accessibility
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])}
            />
          </nav>
        )}

        {view === 'chapters' && (
          <div className="title-menu" style={{ maxWidth: 460 }}>
            <div className="muted small">Chapter entry checkpoints you have reached on this device.</div>
            {chapterEntries.map(({ ch, cp }) => (
              <button
                key={ch}
                className="btn"
                disabled={!cp && !DEV}
                onClick={() => {
                  if (cp) game.restoreCheckpoint(cp);
                  else if (DEV) {
                    // Developer seeded states come from the deterministic autopilot, loaded only on demand.
                    void import('../game/autopilot').then(({ seeded, CANONICAL, EFFICIENT }) => {
                      game.load(seeded(ch as ChapterId, ch >= '05' ? EFFICIENT : CANONICAL), false);
                      game.introChapter = ch as ChapterId;
                      game.notify();
                    });
                  }
                }}
              >
                <span className="mono">{ch}</span> {CHAPTER_META[ch].title}
                {!cp && DEV && <span className="pill warn">dev seed</span>}
              </button>
            ))}
            <button className="btn ghost" onClick={() => setView('menu')}>
              Back
            </button>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ maxWidth: 460 }}>
            <SettingsPanel />
            <button className="btn ghost" onClick={() => setView('menu')} style={{ marginTop: 12 }}>
              Back
            </button>
          </div>
        )}

        {message && (
          <div className="card small" role="status">
            {message}
          </div>
        )}
        <p className="title-foot">
          A finite incremental strategy game in eight chapters. Your progress saves on this device. Headphones recommended; sound is optional
          and never required to understand what is happening.
        </p>
      </div>
    </main>
  );
}

export function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
