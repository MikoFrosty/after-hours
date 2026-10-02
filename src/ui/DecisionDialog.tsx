import { useEffect, useRef } from 'react';
import { game } from '../runtime/game';
import type { PendingChoice } from '../game/types';
import { choiceView } from './choiceContent';
import { useGameState } from './hooks';

/** Pauses play. Names its subject and effect. No option is preselected. */
export function DecisionDialog({ choice }: { choice: PendingChoice }) {
  const s = useGameState();
  const ref = useRef<HTMLDivElement>(null);
  const v = choiceView(s, choice);
  const choose = (option: string) => game.dispatch({ type: 'choose', choiceId: choice.id, option });

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && v.later) {
        e.preventDefault();
        choose('later');
      }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.id]);

  return (
    <div className="modal-backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={`t-${choice.id}`} tabIndex={-1} ref={ref}>
        <div className="eyebrow">
          <span>{v.eyebrow}</span>
          {v.irreversible && <span className="pill irreversible">Irreversible · checkpoint saved</span>}
        </div>
        <h2 id={`t-${choice.id}`}>{v.title}</h2>
        {v.quote && <div className="quote">{v.quote}</div>}
        {v.body?.map((p, i) => <p key={i}>{p}</p>)}
        {v.witness && (
          <div className="evidence" style={{ marginBottom: 12 }}>
            <div className="card">
              <h3>Original evidence</h3>
              {v.witness.evidence.map((l, i) => (
                <p key={i} className="small">
                  {l}
                </p>
              ))}
            </div>
            <div className="card">
              <h3>Certificate</h3>
              {v.witness.certificate.map((l, i) => (
                <p key={i} className="small">
                  {l}
                </p>
              ))}
            </div>
          </div>
        )}
        {v.facts && (
          <div className="facts">
            {v.facts.map(([k, val]) => (
              <div key={k}>
                <span className="k">{k}</span>
                <span className="v">{val}</span>
              </div>
            ))}
          </div>
        )}
        <div className={`actions ${v.options.some((o) => o.detail) ? 'cards' : ''}`}>
          {v.options.map((o) =>
            o.detail ? (
              <button key={o.id} className={`btn option-card ${o.tone ?? ''}`} onClick={() => choose(o.id)}>
                <span className="t">{o.label}</span>
                {o.detail.map((d, i) => (
                  <span key={i} className="d">
                    {d}
                  </span>
                ))}
              </button>
            ) : (
              <button key={o.id} className={`btn ${o.tone ?? ''}`} onClick={() => choose(o.id)}>
                {o.label}
              </button>
            ),
          )}
        </div>
        {v.later && (
          <button className="btn ghost small later" onClick={() => choose('later')}>
            {v.later}
          </button>
        )}
      </div>
    </div>
  );
}
