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
  packerKeeps,
  tuningOpen,
  boxFull,
  tuneBand,
  wireGrams,
} from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';

const EFFECT: Record<OfficeProjectId, string> = {
  calibrate: 'Sets up the clip machine on the desk. It makes clips on its own, about one every three seconds.',
  oil: 'The clip machine runs half again as fast.',
  tensioner: 'The wire snags less often: every 60 clips instead of every 25.',
  feeder: 'Feeds wire into the machine for you and adds its own clips. The wire stops snagging. From now on, your presses boost the machines instead of making single clips.',
  dieHigh: 'The machine bends ×1.35 faster, but the wire snags again every 300 clips.',
  dieSmooth: 'The machine bends ×1.15 faster and never snags. Your boost drains half as fast.',
  die2: 'A second arm on the clip machine, so it bends two wires at a time. More clips a second.',
  packer: 'Packs finished clips into the carton for you. It always leaves enough on the desk for your next upgrade.',
  roller: 'Keeps the wire straight on its way into the machine. More clips a second, and opens fine-tuning.',
  pedal: 'Your boost can go up to +40% instead of +25%. Best if you keep pressing.',
  governor: 'Your boost never drops below half, even when you stop pressing.',
  fan: 'Keeps the clip machine cool so it can run faster. More clips a second.',
  jig: 'A rack on the side table with room for six small clip machines. Also lets you choose how fast the line runs.',
  station1: 'A small clip machine on the side-table rack. More clips a second.',
  station2: 'A second small machine on the rack.',
  station3: 'A third small machine on the rack.',
  station4: 'A fourth small machine. The rack is half full.',
  station5: 'A fifth small machine.',
  station6: 'The last machine the rack will take: everything running.',
  overdrive: 'The whole line runs ×1.2 faster, but about 1 in 25 more clips come out spoiled at every speed.',
  careful: 'No clip is ever spoiled, at any speed, and speed bursts last 30 seconds instead of 20.',
  straightener: 'Slowly turns spoiled clips back into wire, and stops the wire snagging at Very fast.',
};

const FORKS: Record<string, string> = {
  die: 'Choose a bending upgrade',
  hands: 'Choose a boost upgrade',
  finish: 'Choose how the line runs',
};

const SPEEDS: Array<{ id: LineSpeed; name: string; text: string }> = [
  { id: 'steady', name: 'Normal', text: 'Every clip comes out right.' },
  { id: 'brisk', name: 'Fast', text: '×1.25 · about 1 in 20 clips spoiled' },
  { id: 'hard', name: 'Very fast', text: '×1.45 · about 1 in 8 spoiled · the wire snags every 200 clips until you buy the wire recycler' },
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
            The inventory lists a 3 kg coil of wire in the cabinet’s bottom drawer. Upgrades are paid for in clips, and those clips have to be made again, so you may need more wire.
          </p>
          <button className="btn" onClick={() => act({ type: 'c01/takeSpare' })}>
            Load the spare coil
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
                You can only have one. Buying it takes the other off the table for the rest of the night.
              </p>
            </div>
          );
        })}

      {plain.length > 0 && !c.capped && (
        <div className="card">
          <h3>
            Upgrades <span className="tag">paid with clips on the desk</span>
          </h3>
          <div className="list">
            {plain.map((p) => (
              <ProjectRow key={p.id} p={p} reason={canStart(s, p.id)} installing={c.installing?.id === p.id} deskClips={deskClips} />
            ))}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>
            Clips you spend here are gone: they become the machine. You will have to make them again to fill the order.
          </p>
        </div>
      )}

      {tuningOpen(c) && !c.capped && <TuningCard />}

      {owns(c, 'jig') && !c.capped && (
        <div className="card reveal">
          <h3>
            Line speed <span className="tag">{c.rejects > 0 ? `${c.rejects} spoiled so far` : 'nothing spoiled'}</span>
          </h3>
          <div className="list" role="radiogroup" aria-label="Line speed">
            {SPEEDS.map((x) => (
              <label key={x.id} className={`item ${c.lineSpeed === x.id ? 'highlight' : ''}`}>
                <div>
                  <div className="t">{x.name}</div>
                  <div className="d">{owns(c, 'careful') && x.id !== 'steady' ? `${x.text.split(' · ')[0]} · nothing spoiled (careful line)` : x.text}</div>
                </div>
                <input type="radio" name="speed" checked={c.lineSpeed === x.id} onChange={() => act({ type: 'c01/speed', speed: x.id })} style={{ width: 22, height: 22 }} />
              </label>
            ))}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0' }}>
            Spoiled clips go in a tray, not the order. {owns(c, 'straightener') ? `The wire recycler is turning ${fmtMass(mass(s, 'office.rejects'))} of them back into wire.` : 'The wire recycler can turn them back into wire.'}
          </p>
        </div>
      )}

      {(c.spareTaken || wire < 1500 || c.files.inventory) && (
        <div className="card slim">
          <div className="row between small">
            <span className="muted">Wire left on the coil</span>
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
    // Making a clip shows the clip; boosting shows how far the meter rose (nothing once it is topped up: the glowing meter says so).
    const gain = Math.round((c1.tending - tend0) / 1000);
    const text = c1.madeClips > made0 ? `+${c1.madeClips - made0}` : gain >= 3 ? `+${gain}%` : null;
    setPressed((p) => p + 1);
    if (!text) return;
    const id = ++floaterSeq;
    setFloaters((f) => [...f.slice(-6), { id, text, x: 80 + ((id * 37) % 8) }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  // B makes a clip (or boosts), F frees the wire, C catches a speed burst, S tapes a carton. Key repeat is ignored.
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
      ? 'Make a clip by hand'
      : tends
          ? 'Boost the machines'
          : 'Make a clip by hand';
  const bonus = tendingBonus(c);
  const full = c.tending >= 95_000;
  const vanGone = c.vanCartons !== null;

  return (
    <div className="card action-dock" aria-label="Your desk">
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
              <span className="muted tiny">Machines make</span>
              <span className="mono">{c.jammed ? 'stopped' : c.capped ? 'off' : `${(goodRate(s) / 1000).toFixed(2)}/s`}</span>
            </div>
          )}
        </div>
      </div>
      {owns(c, 'calibrate') && !c.capped && (
        <div className={`tending ${full ? 'full' : ''}`}>
          <div className="row between tiny">
            <span className="muted">
              Boost from your presses{!tends && ' (each clip you make also boosts the machine)'}
              {governed && ' · never below half'}
              {handLevel(c) > 0 && ` · quicker hands ${handLevel(c)} of 3`}
              {tends && c.tending > 50_000 && ' · speed bursts come sooner'}
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
              {c.sealed} of {CARTONS} cartons packed ·{' '}
              {vanGone ? `${c.vanCartons} went on the ${VAN_LABEL} van` : `van at ${VAN_LABEL}, the rest go at 7:00`}
            </span>
            {!c.capped && (
              <button
                className={`btn small ${full250 ? 'primary' : ''}`}
                disabled={!full250 && (owns(c, 'packer') || deskClips < OFFICE.boxSize || c.sealed >= CARTONS)}
                onClick={() => act({ type: 'c01/pack' })}
              >
                {full250 ? 'Tape it shut' : owns(c, 'packer') ? `Packing · ${c.openBox}/${OFFICE.boxSize}` : `Pack a carton · ${OFFICE.boxSize}`} <span className="kbd">S</span>
              </button>
            )}
          </div>
          {owns(c, 'packer') && !c.capped && (
            <div className="row between reserve" style={{ marginTop: 8, gap: 8 }}>
              <span className="tiny muted">
                {packerKeeps(s) > 0 ? `The packer leaves ${packerKeeps(s)} clips on the desk for your next upgrade.` : 'Nothing left to buy: the packer packs every clip.'}
              </span>
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
  if (c.capped) {
    return (
      <div className="alert-slot goal" role="status">
        <span className="tiny muted">Done</span>
        <span>The order is complete. The machines are off.</span>
      </div>
    );
  }
  if (c.jammed) {
    return (
      <div className="alert-slot jam" role="alert">
        <span>The wire snagged. The clip machine has stopped.</span>
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
          Speed burst ready · <span className="mono">{left(c.glintUntilMs)} s</span> to grab it
          <span className="tiny"> · ×1.6 for {run} s</span>
        </span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/catch' })}>
          Grab it <span className="kbd">C</span>
        </button>
      </div>
    );
  }
  if (boxFull(c)) {
    return (
      <div className="alert-slot sealme" role="alert">
        <span>The carton is full. Tape it shut so it can go.</span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/pack' })}>
          Seal it <span className="kbd">S</span>
        </button>
      </div>
    );
  }
  if (cleanRunActive(s)) {
    return (
      <div className="alert-slot clean" role="status">
        <span>Speed burst · ×1.6</span>
        <span className="mono">{left(c.cleanRunUntilMs)} s</span>
      </div>
    );
  }
  if (c.installing) {
    const p = project(c.installing.id);
    return (
      <div className="alert-slot installing" role="status">
        <span>
          Installing the {p.name.toLowerCase()} · <span className="mono">{Math.max(0, Math.ceil((p.installMs - c.installing.ms) / 1000))} s</span>
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
        Buy · {p.costClips}
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
          {p.costClips} clips · takes {p.installMs / 1000} s to fit
          {!affordable && ` · ${p.costClips - deskClips} more needed`}
        </div>
      </div>
      <button className="btn small" disabled={Boolean(reason)} onClick={() => act({ type: 'c01/project', id: p.id })} title={reason ?? undefined}>
        {installing ? 'Installing…' : `Buy · ${p.costClips}`}
      </button>
    </div>
  );
}

/** Fine-tuning: stop the swinging needle inside the band. A miss costs a few seconds, nothing else. */
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
          <span className="muted">Machines fine-tuned as far as they go</span>
          <span className="mono">+{(max * OFFICE.active.tuning.bonusPerLevel) / 10}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card reveal">
      <h3>
        Fine-tune the machines <span className="tag">{c.tuneLevel} of {max} · +{(c.tuneLevel * OFFICE.active.tuning.bonusPerLevel) / 10}%</span>
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
                ? `Tuning slowly… ${Math.ceil((OFFICE.active.tuning.slowMs - (c.slowTuneMs ?? 0)) / 1000)} s`
                : cooling && c.lastTune === 'hit'
                  ? `Got it. Next try in ${coolLeft} s`
                  : cooling
                  ? 'Missed. Try again in a moment…'
                  : c.lastTune === 'hit'
                    ? 'Got it. The band gets narrower each time.'
                    : `Stop the needle inside the marked band: each hit makes every machine ${OFFICE.active.tuning.bonusPerLevel / 10}% faster.`}
            </span>
            <div className="row">
              <button className="btn small" disabled={cooling || slow} onClick={set}>
                Stop the needle <span className="kbd">T</span>
              </button>
              <button className="btn small ghost" disabled={slow} onClick={() => act({ type: 'c01/tuneSlow' })} title="Always works; takes 20 seconds">
                Tune slowly · 20 s
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
