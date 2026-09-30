import { useGameState, act } from '../hooks';
import { game } from '../../runtime/game';
import { PRESERVATION } from '../../content/campaign';
import { CASE_EVIDENCE } from '../../content/narrative';
import { ANCHOR_LABELS } from '../../content/world';
import type { C04State, CaseId, Treatment } from '../../game/types';
import { allowedTreatments, caseAccounts, currentOverhead, maxConcurrent, overheadOf, resolvedCount, slotsInUse } from '../../game/chapters/c04';
import { mass } from '../../game/ledger';
import { fmtMass } from '../../game/mass';
import { FidIcon, FID_LABEL } from '../drawer/OfficeBookmark';
import { Bar } from './Panel';

const TREATMENT: Record<Treatment, { name: string; fid: 'original' | 'recorded' | 'reconstructed' | 'absent'; effect: string }> = {
  original: { name: 'Original', fid: 'original', effect: 'Fidelity exact. Witness intact. The material is untouched.' },
  archive: { name: 'Lossless archive', fid: 'recorded', effect: 'Fidelity recorded. The original is dismantled; 1/10 of it stores the recording.' },
  reconstruction: { name: 'Reconstruction', fid: 'reconstructed', effect: 'Fidelity approximate. Archive detail permanently lost; 1/100 stores the model.' },
  relocate: { name: 'Relocate with life support', fid: 'original', effect: 'Actual residents and functioning life support move outside the industrial zone.' },
  absent: { name: 'Already absent', fid: 'absent', effect: 'Removed earlier. Recorded as an audit outcome. Cannot be restored by selecting Original.' },
};

const CASES = PRESERVATION.cases as CaseId[];

/** Every case starts unresolved and pauses on opening, so its evidence can be read. */
export function openCase(c: C04State, id: CaseId) {
  const first = !c.cases[id].opened && !c.cases[id].resolved;
  act({ type: 'c04/focus', id });
  if (first) game.setPaused(true, `Paused while you review a new case: ${ANCHOR_LABELS[id]}.`);
}

export function P04() {
  const s = useGameState();
  const c = s.chapterState as C04State;
  const id = c.focus;
  const k = c.cases[id];
  const ev = CASE_EVIDENCE[id];
  const absent = id === 'garden' && s.anchors.garden.fidelity === 'absent';
  const total = caseAccounts(s, id).reduce((n, a) => n + mass(s, a), 0n);
  const used = slotsInUse(c);
  const free = PRESERVATION.slots - used;
  const overhead = currentOverhead(c);
  return (
    <>
      <div className="card">
        <h3>
          Preservation <span className="tag">{resolvedCount(c)} of 6 resolved</span>
        </h3>
        <div className="row between small">
          <span className="muted">Protected support overhead</span>
          <span className="mono">
            {overhead} / {PRESERVATION.supportCapacity}
          </span>
        </div>
        <Bar value={overhead} max={PRESERVATION.supportCapacity} marks={[21]} tone="alt" />
        <div className="row between small" style={{ marginTop: 8 }}>
          <span className="muted">Verification slots in use</span>
          <span className="mono">
            {used} / {PRESERVATION.slots}
          </span>
        </div>
        <Bar value={used} max={PRESERVATION.slots} />
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Maximum possible overhead is 21 against 24 support units: retaining every original is always feasible. Overhead narrows later surplus but never blocks progress.
          {maxConcurrent(s) > 1 ? ' Parallel review: two cases verify at once.' : ''}
        </p>
      </div>

      <div className="row" role="tablist" aria-label="Cases">
        {CASES.map((cid) => (
          <button key={cid} role="tab" aria-selected={cid === id} className="btn small" aria-pressed={cid === id} onClick={() => openCase(c, cid)}>
            <FidIcon f={s.anchors[cid].fidelity} /> {ANCHOR_LABELS[cid]}
          </button>
        ))}
      </div>

      <div className="card">
        <h3>
          {ev.title}
          <span className="tag">
            {k.resolved ? `Resolved · ${FID_LABEL[s.anchors[id].fidelity]}` : k.locked ? 'Under verification' : 'Unresolved'}
          </span>
        </h3>
        <div className="evidence">
          <div>
            <div className="tiny faint mono" style={{ marginBottom: 6 }}>
              EVIDENCE
            </div>
            {(absent ? ev.absent! : ev.lines).map((l, i) => (
              <p key={i} className="small" style={{ margin: '0 0 8px' }}>
                {l}
              </p>
            ))}
            {!absent && total > 0n && <div className="tiny faint mono">Material {fmtMass(total)}</div>}
          </div>
          <div>
            <div className="tiny faint mono" style={{ marginBottom: 6 }}>
              CONSEQUENCES
            </div>
            <div className="list" role="radiogroup" aria-label="Treatment">
              {allowedTreatments(s, id).map((t) => {
                const T = TREATMENT[t];
                const selected = k.treatment === t;
                return (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={selected}
                    className={`item ${selected ? 'highlight' : ''}`}
                    style={{ textAlign: 'left', cursor: k.resolved || k.locked ? 'default' : 'pointer', background: 'transparent', color: 'inherit' }}
                    disabled={k.resolved || k.locked}
                    onClick={() => act({ type: 'c04/preview', id, treatment: t })}
                  >
                    <div>
                      <div className="t fid">
                        <FidIcon f={T.fid} /> {T.name}
                      </div>
                      <div className="d">{T.effect}</div>
                    </div>
                    <span className="mono small">+{overheadOf(t, id)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {!k.resolved && !k.locked && (
          <button className="btn primary" style={{ marginTop: 12, width: '100%' }} disabled={!k.treatment} onClick={() => act({ type: 'request', kind: 'lock', subject: id })}>
            {k.treatment ? `Commit “${TREATMENT[k.treatment].name}” to verification` : 'Choose a treatment'}
          </button>
        )}
        {k.locked && !k.resolved && (
          <div style={{ marginTop: 12 }}>
            <div className="row between small">
              <span>Verification</span>
              <span className="mono">{(k.workMilli / 1000).toFixed(1)} / 30</span>
            </div>
            <Bar value={k.workMilli} max={PRESERVATION.verificationWork} />
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="small muted">Slots · 0.5 work/s each</span>
              <div className="stepper">
                <button className="btn small icon" onClick={() => act({ type: 'c04/slots', id, slots: k.slots - 1 })} disabled={k.slots <= 0} aria-label="One fewer slot">
                  −
                </button>
                <span className="val">{k.slots}</span>
                <button className="btn small icon" onClick={() => act({ type: 'c04/slots', id, slots: k.slots + 1 })} disabled={free <= 0} aria-label="One more slot">
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {c.habitatTender && (
        <div className="card">
          <h3>
            Habitat tender <span className="tag">{c.habitatVerified ? 'Verified' : `${Math.floor(c.habitatVerifyMs / 1000)} / 30 s`}</span>
          </h3>
          {c.habitatVerified ? (
            <div className="small">Closed-loop life support verified. It is allocated automatically before any production.</div>
          ) : (
            <>
              <div className="small muted">Allocate 4 slots for 30 seconds to verify closed-loop water, air and food.</div>
              <Bar value={c.habitatVerifyMs} max={PRESERVATION.habitatMs} tone="alt" />
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="small">{c.habitatSlots >= 4 ? 'Verifying' : 'Needs 4 slots'}</span>
                <div className="stepper">
                  <button className="btn small icon" onClick={() => act({ type: 'c04/habitatSlots', slots: c.habitatSlots - 1 })} disabled={c.habitatSlots <= 0} aria-label="One fewer slot">
                    −
                  </button>
                  <span className="val">{c.habitatSlots}</span>
                  <button className="btn small icon" onClick={() => act({ type: 'c04/habitatSlots', slots: c.habitatSlots + 1 })} disabled={free <= 0} aria-label="One more slot">
                    +
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {resolvedCount(c) === 6 && c.habitatVerified && !s.charters.interplanetaryCharter && s.choices.length === 0 && (
        <button className="btn primary" onClick={() => act({ type: 'request', kind: 'charter' })}>
          Review interplanetary charter
        </button>
      )}
    </>
  );
}
