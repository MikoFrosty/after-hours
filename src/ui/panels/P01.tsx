import { useEffect, useRef, useState } from 'react';
import { game } from '../../runtime/game';
import { useGameState, act } from '../hooks';
import { OFFICE, type OfficeProject } from '../../content/campaign';
import { MARA, TERMINAL_FILES } from '../../content/narrative';
import type { C01State } from '../../game/types';
import {
  BIG_ORDER,
  bestUpgrade,
  bigPacked,
  burstReady,
  burstRunning,
  canStart,
  fmtPayback,
  loose,
  machineRate,
  nextGoal,
  offeredProjects,
  owns,
  paybackSeconds,
  paybackHorizon,
  paysInTime,
  pressYield,
  project,
  rateGain,
  secondsToVan,
  sheetReady,
  spareOffered,
  uncovered,
  vanBonus,
  vanForecast,
  wireGrams,
  forkTaken,
} from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { Bar } from './Panel';

/** The early van; whatever of the big order is still unsealed then goes on the 7:00 run. */
const VAN_LABEL = '5:22';
const perSec = (milli: number) => `${(milli / 1000).toFixed(milli < 10_000 ? 1 : 0)}/s`;

interface Floater {
  id: number;
  text: string;
  x: number;
}
let floaterSeq = 0;

/**
 * The office night, top to bottom: the order you are working on (with the one next step), the
 * button and what the desk holds, a single line for whatever needs you right now, the upgrades
 * (each with what it adds and how fast it pays for itself), and the desk's notes and files.
 */
export function P01() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  useOfficeKeys();
  return (
    <>
      <div className="card action-dock o-dock">
        <OrderCard />
        <MakeRow />
        <AlertLine />
      </div>
      {c.capped && !s.charters.buildingLease && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'report' })}>
          Review the shift report
        </button>
      )}
      {!c.capped && uncovered(c) && <Upgrades />}
      <Desk />
      <MakeRow pinned />
    </>
  );
}

/** B makes clips, F frees a snag, C grabs a speed burst, S sends the trial run or packs a carton. */
function useOfficeKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = game.state;
      if (!s || s.chapter !== '01') return;
      const c = s.chapterState as C01State;
      const k = e.key.toLowerCase();
      if (k === 'f' && c.jammed) act({ type: 'c01/free' });
      if (k === 'c' && burstReady(s)) act({ type: 'c01/catch' });
      if (k === 's') act({ type: c.trial === 'open' ? 'c01/sendTrial' : 'c01/pack' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** The current order: what it is, how far along, the one next step, and (for the big order) the van. */
function OrderCard() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const l = loose(s);
  const next = nextGoal(s);
  const [justSealed, setJustSealed] = useState(-1);
  const sealedRef = useRef(c.sealed);
  useEffect(() => {
    if (c.sealed > sealedRef.current) {
      setJustSealed(c.sealed - 2);
      const t = setTimeout(() => setJustSealed(-1), 900);
      sealedRef.current = c.sealed;
      return () => clearTimeout(t);
    }
    sealedRef.current = c.sealed;
  }, [c.sealed]);

  // Before the first clip: only Mara's note, and the button below it.
  if (c.madeClips === 0) {
    return (
      <div className="o-order">
        <div className="o-eyebrow">11:47 PM · the 11th floor</div>
        <div className="terminal-note o-note" role="note">
          <div>{MARA.wire.text}</div>
          <div className="tiny" style={{ opacity: 0.6, marginTop: 6 }}>
            {MARA.wire.dateline}
          </div>
        </div>
        <p className="o-next">{next}</p>
      </div>
    );
  }

  if (c.capped) {
    return (
      <div className="o-order">
        <div className="o-eyebrow">Done</div>
        <div className="o-title">Every carton is packed</div>
        <p className="o-next">
          {c.vanCartons ?? BIG_ORDER} of {BIG_ORDER} went on the {VAN_LABEL} van
          {(c.vanCartons ?? 0) > 0 ? ` · +${(c.vanCartons ?? 0) * OFFICE.vanBonusPerCarton} clips for the building` : ''}.
        </p>
      </div>
    );
  }

  if (c.trial !== 'approved') {
    const sent = c.trial === 'sent';
    const have = sent ? OFFICE.trial.clips : Math.min(l, OFFICE.trial.clips);
    return (
      <div className="o-order">
        <div className="o-head">
          <span className="o-eyebrow">Order 1 of 3 · trial run</span>
          <span className="mono small">
            {have} / {OFFICE.trial.clips}
          </span>
        </div>
        <div className="o-title">{sent ? 'Sent. Waiting to hear back…' : '100 clips for the customer to try'}</div>
        <Bar value={have} max={OFFICE.trial.clips} />
        <div className="o-act">
          <p className="o-next">{next}</p>
          {!sent && (
            <button className={`btn small ${l >= OFFICE.trial.clips ? 'primary' : ''}`} disabled={l < OFFICE.trial.clips} onClick={() => act({ type: 'c01/sendTrial' })}>
              Send it <span className="kbd">S</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (c.sealed === 0) {
    return (
      <div className="o-order">
        <div className="o-head">
          <span className="o-eyebrow">Order 2 of 3 · first carton</span>
          <span className="mono small">
            {Math.min(l, OFFICE.boxSize)} / {OFFICE.boxSize}
          </span>
        </div>
        <div className="o-title">One carton of 250</div>
        <Bar value={Math.min(l, OFFICE.boxSize)} max={OFFICE.boxSize} />
        <div className="o-act">
          <p className="o-next">{next}</p>
          <button className={`btn small ${l >= OFFICE.boxSize ? 'primary' : ''}`} disabled={l < OFFICE.boxSize} onClick={() => act({ type: 'c01/pack' })}>
            Pack it <span className="kbd">S</span>
          </button>
        </div>
      </div>
    );
  }

  const packedBig = bigPacked(c);
  const left = secondsToVan(s);
  const forecast = vanForecast(s);
  return (
    <div className="o-order">
      <div className="o-head">
        <span className="o-eyebrow">Order 3 of 3 · the big order</span>
        <span className="mono small">
          {packedBig} / {BIG_ORDER} cartons
        </span>
      </div>
      <div className="cartons o-cartons" role="img" aria-label={`${packedBig} of ${BIG_ORDER} cartons packed`}>
        {Array.from({ length: BIG_ORDER }, (_, i) => (
          <span key={i} className={`carton ${i < packedBig ? 'sealed' : ''} ${i === justSealed ? 'just' : ''} ${c.vanCartons !== null && i < c.vanCartons ? 'gone' : ''}`} />
        ))}
      </div>
      {left !== null && forecast !== null ? (
        <div className={`o-forecast ${forecast >= BIG_ORDER - c.courierCartons ? 'ok' : ''}`}>
          <span>
            Van at {VAN_LABEL}, in {fmtPayback(left)}. At this rate: <b>{forecast} of {BIG_ORDER - c.courierCartons}</b> on it
            {c.courierCartons > 0 && <> · {c.courierCartons} went by courier</>}
          </span>
          <span className="mono">+{forecast * OFFICE.vanBonusPerCarton} clips</span>
        </div>
      ) : (
        <div className="o-forecast done">
          {c.vanCartons} went on the {VAN_LABEL} van{c.courierCartons > 0 ? ` and ${c.courierCartons} by courier` : ''} (+{vanBonus(c)} clips for the building). The rest go at 7:00.
        </div>
      )}
      <div className="o-act">
        <p className="o-next">{next}</p>
        <button className={`btn small ${l >= OFFICE.boxSize ? 'primary' : ''}`} disabled={l < OFFICE.boxSize} onClick={() => act({ type: 'c01/pack' })}>
          Pack a carton <span className="kbd">S</span>
        </button>
      </div>
    </div>
  );
}

/** The main button, and the two numbers that matter: clips on the desk and what the machines make. */
/**
 * The main button with the desk count and machine speed. On a phone a second, pinned copy sits at
 * the bottom of the screen (with the pack button) so it stays under the thumb while the page scrolls.
 */
function MakeRow({ pinned = false }: { pinned?: boolean }) {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [pressed, setPressed] = useState(0);
  const per = pressYield(s);
  const rate = machineRate(s);

  const press = () => {
    const before = (game.state!.chapterState as C01State).madeClips;
    if (act({ type: 'c01/make' })) return;
    const made = (game.state!.chapterState as C01State).madeClips - before;
    setPressed((p) => p + 1);
    if (made <= 0) return;
    const id = ++floaterSeq;
    setFloaters((f) => [...f.slice(-6), { id, text: `+${made}`, x: 72 + ((id * 37) % 14) }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);
  };
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'b' || e.key === 'B') pressRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  if (c.capped) return null;
  if (pinned) {
    const l = loose(s);
    const canPack = c.trial === 'approved' && l >= OFFICE.boxSize;
    return (
      <div className="o-pinned" aria-hidden={false}>
        <div className="make-wrap">
          <button className={`btn primary make-btn ${pressed ? `press-${pressed % 2}` : ''}`} onClick={press} disabled={wireGrams(s) === 0}>
            {per > 1 ? `Make · +${per}` : 'Make a clip'}
          </button>
          {floaters.map((f) => (
            <span key={f.id} className="floater" style={{ left: `${f.x}%` }} aria-hidden>
              {f.text}
            </span>
          ))}
        </div>
        <div className="o-pinned-stat">
          <span className="mono">{l.toLocaleString('en-US')}</span>
          <span className="tiny muted">{owns(c, 'calibrate') ? (c.jammed ? 'stopped' : perSec(rate)) : 'on the desk'}</span>
        </div>
        {canPack && (
          <button className="btn small primary" onClick={() => act({ type: 'c01/pack' })}>
            Pack
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dock-main">
      <div className="make-wrap">
        <button className={`btn primary make-btn ${pressed ? `press-${pressed % 2}` : ''}`} onClick={press} disabled={wireGrams(s) === 0}>
          {per > 1 ? `Make clips · +${per} a press` : 'Make a clip'}
          <span className="kbd">B</span>
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
          <span className="mono big">{loose(s).toLocaleString('en-US')}</span>
        </div>
        {owns(c, 'calibrate') && (
          <div className="stat">
            <span className="muted tiny">Machines</span>
            <span className={`mono ${burstRunning(s) ? 'o-hot' : ''}`}>{c.jammed ? 'stopped' : perSec(rate)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** One line for the thing that needs you right now. It keeps its height so nothing below jumps. */
function AlertLine() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const left = (ms: number) => Math.max(0, Math.ceil((ms - s.simMs) / 1000));
  if (c.capped) return null;
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
  const E = OFFICE.events;
  if (c.hot?.phase === 'offer') {
    return (
      <div className="alert-slot jam o-choice" role="alert">
        <span>
          The machine is running hot · <span className="mono">{left(c.hot.untilMs)} s</span>
        </span>
        <span className="row">
          <button className="btn small" onClick={() => act({ type: 'c01/hot', cool: true })} title={`Everything stops for ${E.hot.coolMs / 1000} s`}>
            Let it cool · {E.hot.coolMs / 1000} s
          </button>
          <button className="btn small" onClick={() => act({ type: 'c01/hot', cool: false })} title={`About half the time it seizes for ${E.hot.stallMs / 1000} s`}>
            Keep going
          </button>
        </span>
      </div>
    );
  }
  if (c.courier?.phase === 'offer') {
    return (
      <div className="alert-slot truewire o-choice" role="alert">
        <span>
          A courier can take {E.courier.cartons} cartons in the next {E.courier.runMs / 1000} s for +{E.courier.bonus} clips · <span className="mono">{left(c.courier.untilMs)} s</span>
        </span>
        <span className="row">
          <button className="btn small primary" onClick={() => act({ type: 'c01/courier', accept: true })}>
            Take it
          </button>
          <button className="btn small" onClick={() => act({ type: 'c01/courier', accept: false })}>
            Not tonight
          </button>
        </span>
      </div>
    );
  }
  if (burstReady(s)) {
    return (
      <div className="alert-slot truewire" role="alert">
        <span>
          The wire is running perfectly straight · <span className="mono">{left(c.burstReadyUntilMs)} s</span>
        </span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/catch' })}>
          Speed ×{OFFICE.bursts.multiplier / 1000} <span className="kbd">C</span>
        </button>
      </div>
    );
  }
  if (sheetReady(s)) {
    return (
      <div className="alert-slot truewire" role="alert">
        <span>Something on the desk is under a dust sheet.</span>
        <button className="btn primary small" onClick={() => act({ type: 'c01/lift' })}>
          Lift the sheet
        </button>
      </div>
    );
  }
  if (spareOffered(s)) {
    return (
      <div className="alert-slot" role="status">
        <span>{wireGrams(s) < 800 ? 'The wire is running low.' : 'There is a spare coil in the cabinet.'}</span>
        <button className="btn small" onClick={() => act({ type: 'c01/takeSpare' })}>
          Load the spare coil
        </button>
      </div>
    );
  }
  if (c.hot) {
    return (
      <div className="alert-slot jam" role="status">
        <span>{c.hot.phase === 'cooling' ? 'Letting the machines cool.' : 'The bending arm seized. Freeing it.'}</span>
        <span className="mono">{left(c.hot.untilMs)} s</span>
      </div>
    );
  }
  if (c.courier?.phase === 'run') {
    return (
      <div className="alert-slot truewire" role="status">
        <span>
          The courier is waiting: {Math.max(0, c.courier.goal - c.sealed)} more carton{c.courier.goal - c.sealed === 1 ? '' : 's'}
        </span>
        <span className="mono">{left(c.courier.untilMs)} s</span>
      </div>
    );
  }
  if (burstRunning(s)) {
    return (
      <div className="alert-slot clean" role="status">
        <span>Everything runs ×{OFFICE.bursts.multiplier / 1000}</span>
        <span className="mono">{left(c.burstUntilMs)} s</span>
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
  return null;
}

/** The upgrades on offer, the next one coming, and what each one is worth. */
function Upgrades() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const offered = offeredProjects(s);
  const best = bestUpgrade(s);
  const plain = offered.filter((p) => !p.exclusive);
  const pair = offered.filter((p) => p.exclusive);
  const coming = upcoming(c);
  if (offered.length === 0 && !coming) return null;
  return (
    <div className="card o-shop">
      <h3>
        Upgrades <span className="tag">paid with clips on the desk</span>
      </h3>
      <div className="list">
        {plain.map((p) => (
          <UpgradeRow key={p.id} p={p} best={offered.length > 1 && best?.id === p.id} />
        ))}
        {pair.length > 0 && (
          <div className="o-pair">
            <div className="o-pair-head">Pick one · the other goes away</div>
            {pair.map((p) => (
              <UpgradeRow key={p.id} p={p} best={offered.length > 1 && best?.id === p.id} />
            ))}
          </div>
        )}
        {coming && (
          <div className="item o-up locked">
            <div>
              <div className="t">{coming.p.name}</div>
              <div className="d">{coming.when}</div>
            </div>
            <span className="mono tiny faint">{coming.p.costClips}</span>
          </div>
        )}
      </div>
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>
        Clips you spend become the machine: you make them again for the order.
      </p>
    </div>
  );
}

/** The next upgrade that is not on offer yet, and what it is waiting for. */
function upcoming(c: C01State): { p: OfficeProject; when: string } | null {
  for (const p of OFFICE.projects) {
    if (owns(c, p.id) || c.installing?.id === p.id || forkTaken(c, p)) continue;
    const u = p.unlock;
    if (u.after && !owns(c, u.after)) continue;
    if (u.boxes !== undefined && c.sealed < u.boxes) return { p, when: 'Comes with the next order, once the first carton is packed.' };
    if (u.made !== undefined && c.madeClips < u.made) return { p, when: `After ${u.made.toLocaleString('en-US')} clips made (${c.madeClips.toLocaleString('en-US')} so far).` };
    if (u.jams !== undefined && c.jams < u.jams) continue;
  }
  return null;
}

function UpgradeRow({ p, best }: { p: OfficeProject; best: boolean }) {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [open, setOpen] = useState(false);
  const reason = canStart(s, p.id);
  const installing = c.installing?.id === p.id;
  const gain = rateGain(s, p);
  const payback = paybackSeconds(s, p);
  const pays = paysInTime(s, p);
  const l = loose(s);
  const affordable = l >= p.costClips;
  let worth: string;
  if (installing) worth = 'Installing…';
  else if (gain > 0) worth = `+${perSec(gain)}${payback !== null ? ` · pays for itself in ${fmtPayback(payback)}` : ''}`;
  else worth = p.short;
  return (
    <div className={`item o-up ${best && affordable && pays ? 'highlight' : ''} ${!pays ? 'late' : ''}`}>
      <button className="o-up-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="t">
          {p.name} {best && pays && !installing && <span className="pill accent">best value</span>}
        </span>
        <span className="d">{gain > 0 ? p.short : ''}</span>
        <span className={`d mono ${!pays ? 'o-warn' : ''}`}>{!pays ? `${worth} · not before ${paybackHorizon(s)?.until ?? 'the end'}` : worth}</span>
        {open && <span className="d o-more">{p.text}</span>}
      </button>
      <button className={`btn small ${!reason && pays ? 'primary' : ''}`} disabled={Boolean(reason)} onClick={() => act({ type: 'c01/project', id: p.id })} title={reason ?? undefined}>
        {installing ? '…' : `Buy · ${p.costClips}`}
        {!affordable && !installing && <span className="tiny mono o-need">{p.costClips - l} more</span>}
      </button>
    </div>
  );
}

/** Mara's notes, the terminal's files and the coil: background, folded away until wanted. */
function Desk() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [openFile, setOpenFile] = useState<string | null>(null);
  const files = Object.keys(c.files);
  const unread = files.filter((f) => c.files[f] === 'unread').length;
  const notes = s.log.filter((l) => l.kind === 'note');
  if (c.madeClips === 0) return null;
  const wire = wireGrams(s);
  return (
    <details className="card o-desk">
      <summary>
        <span className="o-desk-title">Desk</span>
        <span className="tiny muted">
          {notes.length} note{notes.length === 1 ? '' : 's'} · {files.length} file{files.length === 1 ? '' : 's'}
          {unread > 0 && <span className="pill accent o-unread">{unread} new</span>}
        </span>
      </summary>
      <div className="o-desk-body">
        {notes
          .slice()
          .reverse()
          .map((n) => (
            <div key={n.id} className="terminal-note small">
              {n.text}
              {'dateline' in n && n.dateline && <div className="tiny" style={{ opacity: 0.6, marginTop: 4 }}>{n.dateline}</div>}
            </div>
          ))}
        {files.length > 0 && (
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
        )}
        {openFile && (
          <div className="terminal-note reveal" aria-live="polite">
            {(openFile === 'contract' && c.capped ? TERMINAL_FILES.contractRenewed : TERMINAL_FILES[openFile]).lines.map((l, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {l}
              </div>
            ))}
          </div>
        )}
        <div>
          <div className="row between small">
            <span className="muted">Wire left on the coil</span>
            <span className="mono">{fmtMass(mass(s, 'office.wire'))}</span>
          </div>
          <Bar value={wire} max={c.spareTaken ? 8000 : 3000} tone="alt" />
        </div>
      </div>
    </details>
  );
}
