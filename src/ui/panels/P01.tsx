import { useEffect, useRef, useState } from 'react';
import { useGameState, act } from '../hooks';
import { OFFICE } from '../../content/campaign';
import { MARA } from '../../content/narrative';
import type { C01State } from '../../game/types';
import { canBuy, salvageAvailable, UPGRADE_ORDER } from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { CLIP, fmtMass } from '../../game/mass';
import { Bar } from './Panel';

const NAMES = { bender: 'Auto bender', feeder: 'Wire feeder', jig: 'Parallel jig' } as const;
const SALVAGE_NAMES = { cabinet: 'Filing cabinet', lamp: 'Desk lamp', frame: 'Picture frame' } as const;

export function P01() {
  const s = useGameState();
  const c = s.chapterState as C01State;
  const [coolUntil, setCoolUntil] = useState(0);
  const [, force] = useState(0);
  const last = useRef(0);
  const clipsOnHand = Number(s.clips.currentMicrograms / CLIP);
  const wire = mass(s, 'office.wire');

  useEffect(() => {
    if (coolUntil <= performance.now()) return;
    const id = window.setTimeout(() => force((x) => x + 1), coolUntil - performance.now());
    return () => window.clearTimeout(id);
  }, [coolUntil]);

  // One cooldown shared by mouse, touch and keyboard. Key repeat is ignored.
  const make = () => {
    const now = performance.now();
    if (now - last.current < OFFICE.cooldownMs) return;
    last.current = now;
    setCoolUntil(now + OFFICE.cooldownMs);
    act({ type: 'c01/make' });
  };
  const cooling = coolUntil > performance.now();
  const note = c.madeClips === 0 ? MARA.wire : s.log.filter((l) => l.kind === 'note').at(-1);

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

      <div className="card">
        <h3>
          Production <span className="tag">{c.madeClips.toLocaleString()} / {OFFICE.quota.toLocaleString()}</span>
        </h3>
        <button
          className="btn primary make-btn"
          onClick={make}
          onKeyDown={(e) => {
            if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
          }}
          disabled={c.capped || wire === 0n}
          aria-describedby="make-hint"
        >
          {c.capped ? 'Order complete' : 'Make a clip'}
          <span className="cool" style={{ width: cooling ? '100%' : '0%', transition: cooling ? `width ${OFFICE.cooldownMs}ms linear` : 'none' }} />
        </button>
        <div id="make-hint" className="tiny faint" style={{ marginTop: 6 }}>
          One clip per press · 1 g of wire each · Space or Enter when focused
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="row between small">
            <span className="muted">Order</span>
            <span className="mono">{Math.floor((c.madeClips / OFFICE.quota) * 100)}%</span>
          </div>
          <Bar value={c.madeClips} max={OFFICE.quota} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="row between small">
            <span className="muted">Wire coil</span>
            <span className="mono">{fmtMass(wire)} of 3 kg</span>
          </div>
          <Bar value={Number(wire / 1_000_000n)} max={3000} tone="alt" />
        </div>
      </div>

      <div className="card">
        <h3>
          Machines <span className="tag">{clipsOnHand.toLocaleString()} clips on hand</span>
        </h3>
        <div className="list">
          {OFFICE.upgrades.map((u, i) => {
            const owned = c.upgrades[u.id];
            const prevOk = i === 0 || c.upgrades[UPGRADE_ORDER[i - 1]];
            return (
              <div key={u.id} className={`item ${owned ? 'done' : canBuy(s, u.id) ? 'highlight' : ''}`}>
                <div>
                  <div className="t">{NAMES[u.id]}</div>
                  <div className="d">
                    +{u.addedRate} clip{u.addedRate > 1 ? 's' : ''}/sec · {u.costClips} clips become machine capital
                    {!prevOk && ' · requires the previous machine'}
                  </div>
                </div>
                {owned ? (
                  <span className="pill ok">Installed</span>
                ) : (
                  <button className="btn small" disabled={!canBuy(s, u.id)} onClick={() => act({ type: 'c01/buy', id: u.id })}>
                    Buy · {u.costClips}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Spent clips become installed machinery. Lifetime production never decreases.
        </p>
      </div>

      <div className="card">
        <h3>Salvage · optional</h3>
        <div className="list">
          {OFFICE.salvage.map((sv) => {
            const done = c.salvaged[sv.id];
            const avail = salvageAvailable(c, sv.id);
            return (
              <div key={sv.id} className={`item ${done ? 'done' : ''}`}>
                <div>
                  <div className="t">{SALVAGE_NAMES[sv.id]}</div>
                  <div className="d">
                    {done
                      ? sv.id === 'frame'
                        ? 'Salvaged. The photograph is on the desk.'
                        : 'Salvaged. The rest is raw scrap.'
                      : c.madeClips < sv.threshold
                        ? `Available at ${sv.threshold} clips made`
                        : `${sv.yieldClips} clips now · ${fmtMass(sv.original)} object`}
                  </div>
                </div>
                {!done && (
                  <button className="btn small" disabled={!avail} onClick={() => act({ type: 'request', kind: 'salvage', subject: sv.id })}>
                    Salvage…
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          The order can be finished without salvage. Whatever stays in the room stays in every later view of it.
        </p>
      </div>

      {c.capped && !s.charters.buildingLease && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'report' })}>
          Review the shift report
        </button>
      )}
    </>
  );
}
