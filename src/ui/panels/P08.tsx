import { useGameState, act } from '../hooks';
import { TERMINAL } from '../../content/campaign';
import { TERMINAL_SCRIPT } from '../../content/narrative';
import type { C08State } from '../../game/types';
import { charged, energyRemaining, machineStart, schedulePreview } from '../../game/chapters/c08';
import { fmtMass } from '../../game/mass';
import { nonClipMatter } from '../../game/ledger';
import { Bar } from './Panel';

const TASK_NAME: Record<string, string> = {
  relays: 'Retire relays',
  archive: 'Close the archive',
  sensors: 'Retire sensors',
  main_compute: 'Retire main compute',
  controller: 'Execute controller disassembly',
};

const TASK_EFFECT: Record<string, string> = {
  relays: 'Region navigation closes. No more distant messages can be requested.',
  archive: 'The in-world history viewer is removed. Out-of-world checkpoints remain.',
  sensors: 'The office view becomes its last captured frame.',
  main_compute: 'The interface ends. The final sentence is recorded before this.',
  controller: 'A preloaded passive mechanism. It does not report.',
};

export function P08() {
  const s = useGameState();
  const c = s.chapterState as C08State;
  const p = schedulePreview(s);
  return (
    <>
      <div className="card">
        <h3>
          Terminal reserve <span className="tag">{Math.round(c.chargeMilli / 1000)} / 100</span>
        </h3>
        <Bar value={c.chargeMilli} max={TERMINAL.reserve} tone="alt" />
        <p className="small muted">
          A one-time abstract readiness process using power hardware already inside the terminal machine. Charge cannot fund other operations.
        </p>
        {!charged(c) && (
          <button className="btn" disabled={c.charging} onClick={() => act({ type: 'c08/charge' })}>
            {c.charging ? 'Charging…' : 'Charge the terminal reserve'}
          </button>
        )}
      </div>

      <div className="card">
        <h3>
          Dependency schedule <span className="tag">terminal machine {fmtMass(machineStart(s))}</span>
        </h3>
        <div className="list">
          {p.tasks.map((t, i) => {
            const done = c.tasksDone.includes(t.id);
            return (
              <div key={t.id} className={`item ${done ? 'done' : ''}`}>
                <div>
                  <div className="t">
                    {i + 1}. {TASK_NAME[t.id]} <span className="faint mono small">at {t.atMs / 1000}s</span>
                  </div>
                  <div className="d">{TASK_EFFECT[t.id]}</div>
                  <div className="d mono tiny">
                    energy {t.energy / 1000} · capital {fmtMass(t.capital)} → clips {fmtMass(t.clips)} + radiation {fmtMass(t.radiation)}
                    {t.dependsOn ? ` · after ${TASK_NAME[t.dependsOn].toLowerCase()}` : ''}
                  </div>
                </div>
                {done ? <span className="pill">retired</span> : <span className="pill">{t.energy / 1000} u</span>}
              </div>
            );
          })}
        </div>
        <table className="ledger-table" style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <td>Energy: tasks 10 + 15 + 15 + 20 + 30, passive release</td>
              <td className="num">90 + 10 = 100</td>
            </tr>
            <tr>
              <td>Residual shaping (automatic final mechanism)</td>
              <td className="num">{p.remainder.toString()} µg → one smaller clip</td>
            </tr>
            <tr>
              <td>Non-clip matter now</td>
              <td className="num">{fmtMass(nonClipMatter(s))}</td>
            </tr>
            <tr>
              <td>Energy remaining</td>
              <td className="num">{Math.round(energyRemaining(s) / 1000)}</td>
            </tr>
          </tbody>
        </table>
        {!c.committed && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={!charged(c) || c.scheduleValidated} onClick={() => act({ type: 'c08/validate' })}>
              {c.scheduleValidated ? 'Schedule validated' : 'Validate the schedule'}
            </button>
            <button className="btn danger" disabled={!c.scheduleValidated || s.choices.length > 0} onClick={() => act({ type: 'request', kind: 'commit' })}>
              Precommit…
            </button>
          </div>
        )}
      </div>

      {!c.committed && (
        <div className="card">
          <div className="note">{TERMINAL_SCRIPT.beforeCommit}</div>
          <div className="note-meta">Before commitment, you can hold the remainder, return to the ledger, or authorize the schedule.</div>
        </div>
      )}
    </>
  );
}
