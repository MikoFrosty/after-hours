// The night in the 3D room (prototype): the same rules and actions as the panel, played from Mara's chair.
import { useEffect, useRef, useState } from 'react';
import { game } from '../../runtime/game';
import { act, useGameState } from '../hooks';
import { setSettings, useSettings } from '../settings';
import { officeViewFrom } from '../scenes/OfficeScene';
import { burstReady, bigPacked, loose, machineRate, nextGoal, pressYield, uncovered, wireGrams } from '../../game/chapters/c01';
import { OFFICE } from '../../content/campaign';
import { storyClock } from '../../game/selectors';
import type { C01State } from '../../game/types';
import { AlertLine, Desk, OrderCard, Upgrades, useOfficeKeys } from '../panels/P01';
import { createRoom, type Room, type Target } from './officeRoom';

interface Floater {
  id: number;
  text: string;
}
let floaterSeq = 0;

export default function Night3D() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [terminal, setTerminal] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [hint, setHint] = useState(true);
  useOfficeKeys();

  const l = loose(s);
  const packLabel =
    c.capped
      ? null
      : c.trial === 'open'
        ? l >= OFFICE.trial.clips
          ? 'Send the trial run · S'
          : `The trial run needs ${OFFICE.trial.clips} clips (${l} now)`
        : c.trial === 'sent'
          ? 'Waiting to hear back about the trial'
          : l >= OFFICE.boxSize
            ? 'Pack a carton of 250 · S'
            : `A carton takes 250 clips (${l} now)`;
  const labels: Partial<Record<Target, string | null>> = {
    press: c.capped ? null : wireGrams(s) === 0 ? 'Out of wire' : pressYield(s) > 1 ? `Make clips · +${pressYield(s)} · B` : 'Bend a clip · B',
    carton: packLabel,
    machine: c.jammed ? 'Free the snag · F' : null,
    dark: !uncovered(c) && c.trial === 'approved' ? 'Turn the lamp toward it' : null,
    glint: burstReady(s) ? 'Grab the speed burst · C' : null,
    monitor: 'Use the terminal · T',
  };

  const press = () => {
    const before = (game.state!.chapterState as C01State).madeClips;
    if (act({ type: 'c01/make' })) return;
    roomRef.current?.press();
    const made = (game.state!.chapterState as C01State).madeClips - before;
    if (made <= 0) return;
    const id = ++floaterSeq;
    setFloaters((f) => [...f.slice(-5), { id, text: `+${made}` }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 800);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  const onTarget = (t: Target) => {
    setHint(false);
    const st = game.state!.chapterState as C01State;
    if (t === 'press') pressRef.current();
    else if (t === 'carton') act({ type: st.trial === 'open' ? 'c01/sendTrial' : 'c01/pack' });
    else if (t === 'machine') act({ type: 'c01/free' });
    else if (t === 'dark') act({ type: 'c01/lift' });
    else if (t === 'glint') act({ type: 'c01/catch' });
    else if (t === 'monitor') setTerminal(true);
  };
  const onTargetRef = useRef(onTarget);
  onTargetRef.current = onTarget;

  useEffect(() => {
    const room = createRoom(canvasRef.current!, (t) => onTargetRef.current(t), setHover);
    roomRef.current = room;
    return () => room.dispose();
  }, []);

  useEffect(() => {
    roomRef.current?.set({
      v: officeViewFrom(s, false, true, c.madeClips),
      labels,
      rate: machineRate(s) / 1000,
      loose: l,
      owned: c.owned,
      reducedMotion: settings.reducedMotion,
    });
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (k === 'b') pressRef.current();
      if (k === 't') setTerminal((x) => !x);
      if (e.key === 'Escape') setTerminal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const order = c.trial !== 'approved' ? `Order 1 of 3 · trial run` : c.sealed === 0 ? 'Order 2 of 3 · first carton' : `Order 3 of 3 · ${bigPacked(c)} of 11 cartons`;
  const rate = machineRate(s);

  return (
    <div className="night3d">
      <canvas ref={canvasRef} className="night3d-canvas" aria-label="The office at night. Drag to look around; click things to use them." />
      <div className="n3-hud n3-top">
        <div className="eyebrow">{order}</div>
        <div className="n3-goal">{nextGoal(s)}</div>
        <div className="n3-stats mono">
          {l.toLocaleString('en-US')} clips on the desk{rate > 0 ? ` · ${(rate / 1000).toFixed(1)}/s` : ''} · {storyClock(s)}
        </div>
      </div>
      <div className="n3-cross" aria-hidden>
        {hover && <span className="n3-label">{hover}</span>}
        {floaters.map((f) => (
          <span key={f.id} className="n3-floater">
            {f.text}
          </span>
        ))}
      </div>
      {hint && <div className="n3-hint">Drag to look around · click things to use them · the terminal has the orders and upgrades</div>}
      <div className="n3-hud n3-bottom">
        <div className="n3-alert">
          <AlertLine />
        </div>
        {c.capped && !s.charters.buildingLease && s.choices.length === 0 && (
          <button className="btn primary" onClick={() => act({ type: 'request', kind: 'report' })}>
            Review the shift report
          </button>
        )}
      </div>
      <div className="n3-hud n3-tools">
        <button className="btn small primary n3-make" onClick={press} disabled={c.capped || wireGrams(s) === 0}>
          Bend a clip <span className="kbd">B</span>
        </button>
        <button className="btn small" onClick={() => setTerminal(true)}>
          Terminal <span className="kbd">T</span>
        </button>
        <button className="btn small ghost" onClick={() => setSettings({ view3d: false })} title="Back to the painted view and panel">
          2D view
        </button>
      </div>
      {terminal && (
        <div className="n3-terminal-back" onClick={() => setTerminal(false)}>
          <div className="n3-terminal" role="dialog" aria-label="Terminal" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <span className="eyebrow">Terminal · 11th floor</span>
              <button className="btn small ghost" onClick={() => setTerminal(false)}>
                Close <span className="kbd">Esc</span>
              </button>
            </div>
            <div className="card action-dock o-dock">
              <OrderCard />
              <AlertLine />
            </div>
            {!c.capped && uncovered(c) && <Upgrades />}
            <Desk />
          </div>
        </div>
      )}
    </div>
  );
}
