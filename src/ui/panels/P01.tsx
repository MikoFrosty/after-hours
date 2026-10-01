import { useEffect, useRef, useState } from 'react';
import { game } from '../../runtime/game';
import { useGameState, act } from '../hooks';
import { OFFICE, type OfficeProject } from '../../content/campaign';
import { MARA, TERMINAL_FILES } from '../../content/narrative';
import type { C01State, LineSpeed, OfficeProjectId } from '../../game/types';
import { canStart, CARTONS, cleanRunActive, glintActive, goodRate, handLevel, loose, offeredProjects, owns, project, salvageAvailable, spareOffered, tendingBonus, tuneBand, wireGrams } from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';

const EFFECT: Record<OfficeProjectId, string> = {
  calibrate: 'The bender starts forming clips on its own, about one every two seconds.',
  oil: 'The die runs half again as fast.',
  tensioner: 'The wire catches less often: every 60 clips instead of every 25.',
  feeder: 'A powered feeder adds its own output, and the wire stops catching.',
  die2: 'A second die on the bender adds output.',
  packer: 'Routes a share of new clips straight into a carton.',
  roller: 'A second roller keeps the wire straight into the die. Adds output.',
  fan: 'Keeps the die cool through the long run. Adds output.',
  jig: 'A six-station jig on the side table, now clear of cartons. Adds a line-speed control.',
  head1: 'One more forming head on the jig.',
  head2: 'One more forming head on the jig.',
  head3: 'The last forming head the jig will take.',
  straightener: 'Draws ruined clips back into usable wire, slowly.',
};

const SALVAGE_COPY = {
  cabinet: { name: 'Filing cabinet', text: 'Ten kilograms of steel against the wall. Its bottom drawer holds the spare coil either way.' },
  lamp: { name: 'Desk lamp', text: 'The only warm light in the room.' },
  frame: { name: 'Picture frame', text: 'The photograph would stay on the desk.' },
} as const;

const SPEEDS: Array<{ id: LineSpeed; name: string; text: string }> = [
  { id: 'steady', name: 'Steady', text: 'Every clip passes.' },
  { id: 'brisk', name: 'Brisk', text: '×1.25 · about 1 in 20 ruined' },
  { id: 'hard', name: 'Hard', text: '×1.45 · about 1 in 8 ruined' },
];

export function P01() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [openFile, setOpenFile] = useState<string | null>(null);
  const deskClips = loose(s);
  const wire = wireGrams(s);
  const offered = offeredProjects(s);
  const note = c.madeClips === 0 ? MARA.wire : s.log.filter((l) => l.kind === 'note').at(-1);
  const files = Object.keys(c.files);
  const unread = files.filter((f) => c.files[f] === 'unread').length;

  const glint = glintActive(s);
  const tending = owns(c, 'feeder');

  // B bends (or tends), F frees the wire, C catches a true-wire moment. Key repeat is ignored.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'b' || e.key === 'B') act({ type: 'c01/make' });
      if ((e.key === 'f' || e.key === 'F') && c.jammed) act({ type: 'c01/free' });
      if ((e.key === 'c' || e.key === 'C') && glint) act({ type: 'c01/catch' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c.jammed, glint]);

  return (
    <>
      {note && (
        <div className="terminal-note" role="note">
          <div>{note.text}</div>
          <div className="tiny" style={{ opacity: 0.6, marginTop: 6 }}>
            {'dateline' in note ? note.dateline : ''}
          </div>
        </div>
      )}

      {glint && (
        <div className="card reveal truewire" role="alert">
          <h3>
            The wire is running true <span className="tag">{Math.max(0, Math.ceil((c.glintUntilMs - s.simMs) / 1000))} s</span>
          </h3>
          <p className="small" style={{ margin: '0 0 10px' }}>
            Light runs the whole length of it without a kink. Catch it for a clean run: the line works at ×1.6 for 20 seconds.
          </p>
          <button className="btn primary" onClick={() => act({ type: 'c01/catch' })}>
            Catch the clean run <span className="kbd">C</span>
          </button>
        </div>
      )}

      {c.jammed && (
        <div className="card reveal jam" role="alert">
          <h3>The wire caught in the guide</h3>
          <p className="small" style={{ margin: '0 0 10px' }}>
            The bender has stopped. Free it at the guide; don’t pull.
          </p>
          <button className="btn primary" onClick={() => act({ type: 'c01/free' })} autoFocus>
            Free the wire <span className="kbd">F</span>
          </button>
        </div>
      )}

      <div className="card">
        <button className="btn primary make-btn" onClick={() => act({ type: 'c01/make' })} disabled={c.capped || (!tending && wire === 0)}>
          {c.capped ? 'The order is complete' : c.madeClips === 0 ? 'Bend the first clip' : tending ? 'Tend the line' : 'Bend a clip by hand'}
          {!c.capped && <span className="kbd">B</span>}
        </button>
        {owns(c, 'calibrate') && !c.capped && (
          <div style={{ marginTop: 10 }}>
            <div className="row between small">
              <span className="muted">{tending ? 'Tending: the feeder has the wire; your hands keep it fed' : 'Tending: hand bends keep the bender fed'}</span>
              <span className="mono">+{Math.round(tendingBonus(c) / 10)}%</span>
            </div>
            <Bar value={c.tending} max={100_000} />
            {handLevel(c) > 0 && <div className="tiny faint">Practice {handLevel(c)} of 3: each press tends {50 * handLevel(c)}% more.</div>}
          </div>
        )}
        {cleanRunActive(s) && (
          <div className="row between small cleanrun" role="status">
            <span>Clean run · ×1.6</span>
            <span className="mono">{Math.ceil((c.cleanRunUntilMs - s.simMs) / 1000)} s</span>
          </div>
        )}
        <div className="row between small" style={{ marginTop: 10 }}>
          <span className="muted">Clips on the desk</span>
          <span className="mono" style={{ fontSize: '1.2em' }}>
            {deskClips.toLocaleString()}
          </span>
        </div>
        {owns(c, 'calibrate') && (
          <div className="row between small">
            <span className="muted">Machines</span>
            <span className="mono">{c.jammed ? 'stopped' : `${(goodRate(s) / 1000).toFixed(2)} clips/s`}</span>
          </div>
        )}
        {(c.spareTaken || wire < 1500 || c.files.inventory) && (
          <div style={{ marginTop: 8 }}>
            <div className="row between small">
              <span className="muted">Wire on the spindle</span>
              <span className="mono">{fmtMass(mass(s, 'office.wire'))}</span>
            </div>
            <Bar value={wire} max={c.spareTaken ? 5000 : 3000} tone="alt" />
          </div>
        )}
      </div>

      {c.installing && (
        <div className="card reveal">
          <h3>
            Installing <span className="tag">{project(c.installing.id).name}</span>
          </h3>
          <Bar value={c.installing.ms} max={project(c.installing.id).installMs} />
          <div className="tiny faint" style={{ marginTop: 6 }}>
            {Math.max(0, Math.ceil((project(c.installing.id).installMs - c.installing.ms) / 1000))} s · production continues meanwhile
          </div>
        </div>
      )}

      {owns(c, 'feeder') && !c.capped && <TuningCard />}

      {spareOffered(s) && (
        <div className="card reveal highlight-card">
          <h3>Spare coil</h3>
          <p className="small" style={{ margin: '0 0 10px' }}>
            The inventory lists a 2 kg coil in the cabinet’s bottom drawer. Machines cost wire too: clips spent on them have to be bent again.
          </p>
          <button className="btn" onClick={() => act({ type: 'c01/takeSpare' })}>
            Put the spare coil on the spindle
          </button>
        </div>
      )}

      {offered.length > 0 && !c.capped && (
        <div className="card">
          <h3>
            Workshop <span className="tag">paid from clips on the desk</span>
          </h3>
          <div className="list">
            {offered.map((p) => (
              <ProjectRow key={p.id} p={p} reason={canStart(s, p.id)} installing={c.installing?.id === p.id} deskClips={deskClips} />
            ))}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>
            Clips spent here become machinery. They have to be bent again before they can fill a carton.
          </p>
        </div>
      )}

      {c.files.order && (
        <div className="card reveal">
          <h3>
            Order 4471 <span className="tag">{c.sealed} of {CARTONS} cartons</span>
          </h3>
          <div className="cartons" role="img" aria-label={`${c.sealed} of ${CARTONS} cartons sealed`}>
            {Array.from({ length: CARTONS }, (_, i) => (
              <span key={i} className={`carton ${i < c.sealed ? 'sealed' : i === c.sealed && c.openBox > 0 ? 'open' : ''}`}>
                {i === c.sealed && c.openBox > 0 && <i style={{ height: `${(c.openBox / OFFICE.boxSize) * 100}%` }} />}
              </span>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="small muted">{c.sealed >= CARTONS ? 'All cartons sealed.' : `A carton holds ${OFFICE.boxSize}.`}</span>
            <button className="btn small" disabled={deskClips < OFFICE.boxSize || c.sealed >= CARTONS} onClick={() => act({ type: 'c01/pack' })}>
              Seal a carton · {OFFICE.boxSize}
            </button>
          </div>
          {owns(c, 'packer') && !c.capped && (
            <div style={{ marginTop: 10 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Auto-packer: share of new clips sent to the open carton
              </div>
              <div className="row" role="group" aria-label="Auto-packer share">
                {[0, 25, 50, 75, 100].map((x) => (
                  <button key={x} className="btn small" aria-pressed={c.packShare === x} onClick={() => act({ type: 'c01/packShare', share: x })}>
                    {x}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {owns(c, 'jig') && !c.capped && (
        <div className="card reveal">
          <h3>
            Line speed <span className="tag">{c.rejects > 0 ? `${c.rejects} ruined so far` : 'nothing ruined'}</span>
          </h3>
          <div className="list" role="radiogroup" aria-label="Line speed">
            {SPEEDS.map((x) => (
              <label key={x.id} className={`item ${c.lineSpeed === x.id ? 'highlight' : ''}`}>
                <div>
                  <div className="t">{x.name}</div>
                  <div className="d">{x.text}</div>
                </div>
                <input type="radio" name="speed" checked={c.lineSpeed === x.id} onChange={() => act({ type: 'c01/speed', speed: x.id })} style={{ width: 22, height: 22 }} />
              </label>
            ))}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>
            Ruined clips go to the rejects tray as wire, not lost. {owns(c, 'straightener') ? `The straightener is drawing ${fmtMass(mass(s, 'office.rejects'))} back into wire.` : ''}
          </p>
        </div>
      )}

      {OFFICE.salvage.filter((sv) => salvageAvailable(c, sv.id)).map((sv) => (
        <div className="card reveal" key={sv.id}>
          <h3>
            Salvage · optional <span className="tag">+{sv.yieldClips} clips now</span>
          </h3>
          <div className="item">
            <div>
              <div className="t">{SALVAGE_COPY[sv.id].name}</div>
              <div className="d">{SALVAGE_COPY[sv.id].text}</div>
            </div>
            <button className="btn small" onClick={() => act({ type: 'request', kind: 'salvage', subject: sv.id })}>
              Salvage…
            </button>
          </div>
        </div>
      ))}

      {files.length > 0 && (
        <div className="card">
          <h3>
            Terminal <span className="tag">{unread > 0 ? `${unread} unread` : `${files.length} files`}</span>
          </h3>
          <div className="row" role="list" aria-label="Files">
            {files.map((f) => (
              <button
                key={f}
                role="listitem"
                className="btn small"
                aria-pressed={openFile === f}
                onClick={() => {
                  setOpenFile(openFile === f ? null : f);
                  if (c.files[f] === 'unread') act({ type: 'c01/read', file: f });
                }}
              >
                {c.files[f] === 'unread' && <span className="dot" aria-label="unread" />} {TERMINAL_FILES[f].name}
              </button>
            ))}
          </div>
          {openFile && (
            <div className="terminal-note reveal" style={{ marginTop: 10 }} aria-live="polite">
              {(openFile === 'contract' && c.capped ? TERMINAL_FILES.contractRenewed : TERMINAL_FILES[openFile]).lines.map((l, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {c.capped && !s.charters.buildingLease && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'report' })}>
          Review the shift report
        </button>
      )}
    </>
  );
}

function ProjectRow({ p, reason, installing, deskClips }: { p: OfficeProject; reason: string | null; installing: boolean; deskClips: number }) {
  const affordable = deskClips >= p.costClips;
  return (
    <div className={`item ${!reason ? 'highlight' : ''} reveal`}>
      <div>
        <div className="t">{p.name}</div>
        <div className="d">{EFFECT[p.id]}</div>
        <div className="d mono tiny">
          {p.costClips} clips · {p.installMs / 1000} s to install
          {!affordable && ` · ${p.costClips - deskClips} more needed`}
        </div>
      </div>
      <button className="btn small" disabled={Boolean(reason)} onClick={() => act({ type: 'c01/project', id: p.id })} title={reason ?? undefined}>
        {installing ? 'Installing' : `Install · ${p.costClips}`}
      </button>
    </div>
  );
}

/** Tuning the die: stop the swinging needle inside the band. A miss costs a few seconds, nothing else. */
function TuningCard() {
  const s = game.state!;
  const c = s.chapterState as C01State;
  const max = OFFICE.active.tuning.levels;
  const band = tuneBand(c);
  const [needle, setNeedle] = useState(50);
  const needleRef = useRef(50);
  const done = c.tuneLevel >= max;
  const cooling = s.simMs < c.tuneCooldownUntilMs;
  const slow = c.slowTuneMs !== null;

  useEffect(() => {
    if (done) return;
    let raf = 0;
    const start = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (game.paused) return;
      const v = 50 + 50 * Math.sin(((t - start) / OFFICE.active.tuning.periodMs) * Math.PI * 2);
      needleRef.current = v;
      setNeedle(v);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  const set = () => act({ type: 'c01/tune', needle: needleRef.current });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 't' || e.key === 'T') && !done) set();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done]);

  return (
    <div className="card reveal">
      <h3>
        Tune the die <span className="tag">{c.tuneLevel} of {max} · +{(c.tuneLevel * OFFICE.active.tuning.bonusPerLevel) / 10}%</span>
      </h3>
      {done ? (
        <div className="small muted">Tuned as far as it will go.</div>
      ) : (
        <>
          <div className="gauge" aria-hidden>
            <span className="band" style={{ left: `${band.center - band.width / 2}%`, width: `${band.width}%` }} />
            <span className="needle" style={{ left: `${needle}%` }} />
          </div>
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="small muted" role="status">
              {slow
                ? `Tuning by hand… ${Math.ceil((OFFICE.active.tuning.slowMs - (c.slowTuneMs ?? 0)) / 1000)} s`
                : cooling
                  ? 'Missed. Let the gauge settle…'
                  : c.lastTune === 'hit'
                    ? 'Set. The band narrows.'
                    : 'Stop the needle inside the band.'}
            </span>
            <div className="row">
              <button className="btn small" disabled={cooling || slow} onClick={set}>
                Set the die <span className="kbd">T</span>
              </button>
              <button className="btn small ghost" disabled={slow} onClick={() => act({ type: 'c01/tuneSlow' })} title="Always works; takes 20 seconds">
                Tune by hand · 20 s
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
