import { useEffect, useRef, useState } from 'react';
import { game } from '../../runtime/game';
import { useGameState, act } from '../hooks';
import { OFFICE, type OfficeProject } from '../../content/campaign';
import { MARA, TERMINAL_FILES } from '../../content/narrative';
import type { C01State, LineSpeed, OfficeProjectId } from '../../game/types';
import {
  canStart,
  CARTONS,
  cleanRunActive,
  glintActive,
  goodRate,
  handLevel,
  loose,
  nextGoal,
  offeredProjects,
  owns,
  project,
  spareOffered,
  tendingBonus,
  tendsLine,
  wearLeftMs,
  boxFull,
  tuneBand,
  wireGrams,
} from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';

const EFFECT: Record<OfficeProjectId, string> = {
  calibrate: 'The bender starts forming clips on its own, about one every three seconds.',
  oil: 'The die runs half again as fast.',
  tensioner: 'The wire catches less often: every 60 clips instead of every 25.',
  feeder: 'A powered feeder adds its own output, and the wire stops catching.',
  dieHigh: 'Bends ×1.35 faster, but the wire starts catching again every 300 clips.',
  dieSmooth: 'Bends ×1.15 faster and never catches. Tending drains half as fast.',
  die2: 'A second die on the bender adds output.',
  packer: 'Packs every clip above a reserve you choose straight into the open carton.',
  roller: 'A second roller keeps the wire straight into the die. Adds output.',
  pedal: 'Tending can add up to +40% instead of +25%. Rewards keeping your hands on the line.',
  governor: 'Tending never drains below half. Forgives stepping away; tending still tops it up.',
  fan: 'Keeps the die cool through the long run. Adds output.',
  jig: 'A frame on the side table, now clear of cartons, with room for six stations. Adds a line-speed control.',
  station1: 'A forming station on the jig. Adds output.',
  station2: 'A second forming station.',
  station3: 'A third forming station.',
  station4: 'A fourth station. The jig is half full.',
  station5: 'A fifth station.',
  station6: 'The last station the jig will take: the line at full speed.',
  overdrive: 'The whole line runs ×1.2 faster, and about 1 in 25 more clips are ruined at every speed.',
  careful: 'No clip is ruined at any speed, and a clean run lasts 30 seconds.',
  straightener: 'Draws ruined clips back into usable wire, slowly, and keeps hard running from catching the wire.',
};

const FORKS: Record<string, string> = {
  die: 'Choose a die',
  hands: 'Choose what your hands do',
  finish: 'Choose a finish',
};

const SPEEDS: Array<{ id: LineSpeed; name: string; text: string }> = [
  { id: 'steady', name: 'Steady', text: 'Every clip passes.' },
  { id: 'brisk', name: 'Brisk', text: '×1.25 · about 1 in 20 ruined' },
  { id: 'hard', name: 'Hard', text: '×1.45 · about 1 in 8 ruined · the wire catches every 200 clips until a straightener' },
];

/** The early van; whatever is still unsealed then goes on the 7:00 run. */
const VAN_LABEL = '5:22';

interface Floater {
  id: number;
  text: string;
  x: number;
}
let floaterSeq = 0;

export function P01() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [openFile, setOpenFile] = useState<string | null>(null);
  const deskClips = loose(s);
  const wire = wireGrams(s);
  const offered = offeredProjects(s);
  const plain = offered.filter((p) => !p.exclusive);
  const forks = [...new Set(offered.filter((p) => p.exclusive).map((p) => p.exclusive!))];
  const files = Object.keys(c.files);
  const unread = files.filter((f) => c.files[f] === 'unread').length;

  return (
    <>
      <ActionDock />

      {c.capped && !s.charters.buildingLease && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'report' })}>
          Review the shift report
        </button>
      )}

      <MaraNote />

      {spareOffered(s) && (
        <div className="card reveal highlight-card">
          <h3>Spare coil</h3>
          <p className="small" style={{ margin: '0 0 10px' }}>
            The inventory lists a 3 kg coil in the cabinet’s bottom drawer. Machines cost wire too: clips spent on them have to be bent again.
          </p>
          <button className="btn" onClick={() => act({ type: 'c01/takeSpare' })}>
            Put the spare coil on the spindle
          </button>
        </div>
      )}

      {!c.capped &&
        forks.map((g) => {
          const options = offered.filter((p) => p.exclusive === g);
          return (
            <div className="card reveal fork" key={g}>
              <h3>
                {FORKS[g]} <span className="tag">one or the other</span>
              </h3>
              <div className="fork-options">
                {options.map((p) => (
                  <ForkOption key={p.id} p={p} reason={canStart(s, p.id)} deskClips={deskClips} />
                ))}
              </div>
              <p className="tiny faint" style={{ margin: '8px 0 0' }}>
                Installing one takes the other off the table for the rest of the night.
              </p>
            </div>
          );
        })}

      {plain.length > 0 && !c.capped && (
        <div className="card">
          <h3>
            Workshop <span className="tag">paid from clips on the desk</span>
          </h3>
          <div className="list">
            {plain.map((p) => (
              <ProjectRow key={p.id} p={p} reason={canStart(s, p.id)} installing={c.installing?.id === p.id} deskClips={deskClips} />
            ))}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>
            Clips spent here become machinery. They have to be bent again before they can fill a carton.
          </p>
        </div>
      )}

      {owns(c, 'feeder') && !c.capped && <TuningCard />}

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
                  <div className="d">{owns(c, 'careful') && x.id !== 'steady' ? `${x.text.split(' · ')[0]} · nothing ruined (careful finish)` : x.text}</div>
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

      {(c.spareTaken || wire < 1500 || c.files.inventory) && (
        <div className="card slim">
          <div className="row between small">
            <span className="muted">Wire on the spindle</span>
            <span className="mono">{fmtMass(mass(s, 'office.wire'))}</span>
          </div>
          <Bar value={wire} max={c.spareTaken ? 6000 : 3000} tone="alt" />
        </div>
      )}

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
    </>
  );
}

/** Mara's latest note: in full until the first clip, then one line that opens on request. */
function MaraNote() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const note = c.madeClips === 0 ? MARA.wire : s.log.filter((l) => l.kind === 'note').at(-1);
  const [open, setOpen] = useState(false);
  const noteId = note && 'id' in note ? note.id : '';
  useEffect(() => setOpen(false), [noteId]);
  if (!note) return null;
  const dateline = 'dateline' in note ? note.dateline : '';
  if (c.madeClips === 0) {
    return (
      <div className="terminal-note" role="note">
        <div>{note.text}</div>
        <div className="tiny" style={{ opacity: 0.6, marginTop: 6 }}>
          {dateline}
        </div>
      </div>
    );
  }
  return (
    <button className={`terminal-note note-line ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="note-from">Mara</span>
      <span className="note-text">{note.text}</span>
      {open && dateline && <span className="tiny note-date">{dateline}</span>}
    </button>
  );
}

/**
 * The action dock stays in view while the rest of the panel scrolls: the main button, the
 * tending meter, one fixed-height slot for whatever needs attention, the next goal, and the order.
 */
function ActionDock() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [pressed, setPressed] = useState(0);
  const deskClips = loose(s);
  const wire = wireGrams(s);
  const glint = glintActive(s);
  const tends = tendsLine(c);
  const governed = owns(c, 'governor');
  const full250 = boxFull(c);
  const [justSealed, setJustSealed] = useState(-1);
  const sealedRef = useRef(c.sealed);

  useEffect(() => {
    if (c.sealed > sealedRef.current) {
      setJustSealed(c.sealed - 1);
      const t = setTimeout(() => setJustSealed(-1), 900);
      sealedRef.current = c.sealed;
      return () => clearTimeout(t);
    }
    sealedRef.current = c.sealed;
  }, [c.sealed]);

  const press = () => {
    const c0 = game.state!.chapterState as C01State;
    const [made0, tend0] = [c0.madeClips, c0.tending];
    const err = act({ type: 'c01/make' });
    if (err) return;
    const c1 = game.state!.chapterState as C01State;
    const text = c1.madeClips > made0 ? `+${c1.madeClips - made0}` : c1.tending > tend0 ? `+${Math.round((c1.tending - tend0) / 1000)}%` : 'full';
    const id = ++floaterSeq;
    setFloaters((f) => [...f.slice(-6), { id, text, x: 30 + ((id * 37) % 40) }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);
    setPressed((p) => p + 1);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  // B bends (or tends), F frees the wire, C catches a true-wire moment. Key repeat is ignored.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'b' || e.key === 'B') pressRef.current();
      if ((e.key === 'f' || e.key === 'F') && c.jammed) act({ type: 'c01/free' });
      if ((e.key === 'c' || e.key === 'C') && glint) act({ type: 'c01/catch' });
      if (e.key === 's' || e.key === 'S') act({ type: 'c01/pack' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c.jammed, glint]);

  const label = c.capped
    ? 'The order is complete'
    : c.madeClips === 0
      ? 'Bend the first clip'
      : tends
          ? 'Tend the line'
          : 'Bend a clip by hand';
  const bonus = tendingBonus(c);
  const full = c.tending >= 95_000;
  const vanGone = c.vanCartons !== null;

  return (
    <div className="card action-dock" aria-label="Bench">
      <AlertSlot />
      <div className="dock-main">
        <div className="make-wrap">
          <button className={`btn primary make-btn ${pressed ? `press-${pressed % 2}` : ''}`} onClick={press} disabled={c.capped || (!tends && wire === 0)}>
            {label}
            {!c.capped && <span className="kbd">B</span>}
          </button>
          {floaters.map((f) => (
            <span key={f.id} className="floater" style={{ left: `${f.x}%` }} aria-hidden>
              {f.text}
            </span>
          ))}
        </div>
        <div className="dock-stats">
          <div className="stat">
            <span className="muted tiny">On the desk</span>
            <span className="mono big">{deskClips.toLocaleString()}</span>
          </div>
          {owns(c, 'calibrate') && (
            <div className="stat">
              <span className="muted tiny">Machines</span>
              <span className="mono">{c.jammed ? 'stopped' : c.capped ? 'off' : `${(goodRate(s) / 1000).toFixed(2)}/s`}</span>
            </div>
          )}
        </div>
      </div>
      {owns(c, 'calibrate') && !c.capped && (
        <div className={`tending ${full ? 'full' : ''}`}>
          <div className="row between tiny">
            <span className="muted">
              {tends ? 'Tending the feeder' : 'Tending the bender'}
              {governed && ' · the governor holds half'}
              {handLevel(c) > 0 && ` · practice ${handLevel(c)} of 3`}
              {c.tending > 50_000 && ' · light comes sooner'}
            </span>
            <span className="mono">+{Math.round(bonus / 10)}%</span>
          </div>
          <Bar value={c.tending} max={100_000} />
        </div>
      )}
      {c.files.order && (
        <div className="dock-order">
          <div className="cartons" role="img" aria-label={`${c.sealed} of ${CARTONS} cartons sealed`}>
            {Array.from({ length: CARTONS }, (_, i) => (
              <span key={i} className={`carton ${i < c.sealed ? 'sealed' : i === c.sealed && c.openBox > 0 ? 'open' : ''} ${i === c.sealed && full250 ? 'waiting' : ''} ${i === justSealed ? 'just' : ''}`}>
                {i === c.sealed && c.openBox > 0 && <i style={{ height: `${(c.openBox / OFFICE.boxSize) * 100}%` }} />}
              </span>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 8, gap: 8 }}>
            <span className="tiny muted">
              {c.sealed} of {CARTONS} sealed ·{' '}
              {vanGone ? `${c.vanCartons} went on the ${VAN_LABEL} van` : `van at ${VAN_LABEL}, the rest go at 7:00`}
            </span>
            {!c.capped && (
              <button className={`btn small ${full250 ? 'primary' : ''}`} disabled={!full250 && (deskClips < OFFICE.boxSize || c.sealed >= CARTONS)} onClick={() => act({ type: 'c01/pack' })}>
                {full250 ? 'Seal the carton' : `Seal · ${OFFICE.boxSize}`} <span className="kbd">S</span>
              </button>
            )}
          </div>
          {owns(c, 'packer') && !c.capped && (
            <div className="row between reserve" style={{ marginTop: 8, gap: 8 }}>
              <span className="tiny muted">Packer keeps on the desk</span>
              <div className="row" role="radiogroup" aria-label="Auto-packer reserve">
                {OFFICE.packerReserves.map((x) => (
                  <button key={x} className="btn small" role="radio" aria-checked={c.reserve === x} aria-pressed={c.reserve === x} onClick={() => act({ type: 'c01/reserve', reserve: x })}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One fixed-height line for whatever needs attention now, so nothing below it jumps. */
function AlertSlot() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const left = (ms: number) => Math.max(0, Math.ceil((ms - s.simMs) / 1000));
  if (c.jammed) {
    return (
      <div className="alert-slot jam" role="alert">
        <span>The wire caught in the guide. The bender has stopped.</span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/free' })}>
          Free it <span className="kbd">F</span>
        </button>
      </div>
    );
  }
  if (glintActive(s)) {
    const run = owns(c, 'careful') ? 30 : 20;
    return (
      <div className="alert-slot truewire" role="alert">
        <span>
          The wire is running true · <span className="mono">{left(c.glintUntilMs)} s</span>
          <span className="tiny"> · ×1.6 for {run} s</span>
        </span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/catch' })}>
          Catch it <span className="kbd">C</span>
        </button>
      </div>
    );
  }
  if (boxFull(c)) {
    return (
      <div className="alert-slot sealme" role="alert">
        <span>The packer’s carton is full. Tape it shut.</span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/pack' })}>
          Seal it <span className="kbd">S</span>
        </button>
      </div>
    );
  }
  if (cleanRunActive(s)) {
    return (
      <div className="alert-slot clean" role="status">
        <span>Clean run · ×1.6</span>
        <span className="mono">{left(c.cleanRunUntilMs)} s</span>
      </div>
    );
  }
  if (c.installing) {
    const p = project(c.installing.id);
    return (
      <div className="alert-slot installing" role="status">
        <span>
          Installing {p.name.toLowerCase()} · <span className="mono">{Math.max(0, Math.ceil((p.installMs - c.installing.ms) / 1000))} s</span>
        </span>
        <span className="slot-bar">
          <Bar value={c.installing.ms} max={p.installMs} />
        </span>
      </div>
    );
  }
  return (
    <div className="alert-slot goal" role="status">
      <span className="tiny muted">Next</span>
      <span>{nextGoal(s)}</span>
    </div>
  );
}

function ForkOption({ p, reason, deskClips }: { p: OfficeProject; reason: string | null; deskClips: number }) {
  const affordable = deskClips >= p.costClips;
  return (
    <div className={`fork-option ${!reason ? 'highlight' : ''}`}>
      <div className="t">{p.name}</div>
      <div className="d">{EFFECT[p.id]}</div>
      <div className="d mono tiny">
        {p.costClips} clips · {p.installMs / 1000} s{!affordable && ` · ${p.costClips - deskClips} more`}
      </div>
      <button className="btn small" disabled={Boolean(reason)} onClick={() => act({ type: 'c01/project', id: p.id })} title={reason ?? undefined}>
        Choose · {p.costClips}
      </button>
    </div>
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
        {installing ? 'Installing…' : `Install · ${p.costClips}`}
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
  const coolLeft = Math.ceil((c.tuneCooldownUntilMs - s.simMs) / 1000);
  const wear = wearLeftMs(s);
  const wearText = wear !== null ? `Running ${c.lineSpeed} wears the die: −1 level in ${Math.ceil(wear / 1000)} s` : null;
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

  if (done) {
    return (
      <div className="card slim small">
        <div className="row between">
          <span className="muted">Die tuned as far as it will go</span>
          <span className="mono">+{(max * OFFICE.active.tuning.bonusPerLevel) / 10}%</span>
        </div>
        {wearText && <div className="tiny faint">{wearText}</div>}
      </div>
    );
  }

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
                : cooling && c.lastTune === 'hit'
                  ? `Set. Let it run in… ${coolLeft} s`
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
          {wearText && <div className="tiny faint" style={{ marginTop: 6 }}>{wearText}</div>}
        </>
      )}
    </div>
  );
}
