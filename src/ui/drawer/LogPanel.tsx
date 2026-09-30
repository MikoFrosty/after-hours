import { useState } from 'react';
import { useGameState } from '../hooks';
import { CHAPTER_META } from '../../content/campaign';
import type { LogEntry } from '../../game/types';

const FILTERS: Array<[string, (l: LogEntry) => boolean]> = [
  ['All', () => true],
  ['Letters & notes', (l) => l.kind === 'letter' || l.kind === 'note'],
  ['Losses', (l) => l.kind === 'loss'],
  ['Reports', (l) => l.kind === 'report'],
];

export function LogPanel() {
  const s = useGameState();
  const [f, setF] = useState(0);
  const entries = s.log.filter(FILTERS[f][1]).slice().reverse();
  return (
    <>
      <div className="row" role="group" aria-label="Filter">
        {FILTERS.map(([name], i) => (
          <button key={name} className="btn small" aria-pressed={i === f} onClick={() => setF(i)}>
            {name}
          </button>
        ))}
      </div>
      {entries.length === 0 && <p className="muted">Nothing recorded yet.</p>}
      {entries.map((l) => (
        <article key={l.id} className={`log-entry ${l.kind}`}>
          <div className="row between">
            <span className="lt">{l.title}</span>
            <span className="tiny faint mono">
              {l.chapter} · {CHAPTER_META[l.chapter].title}
            </span>
          </div>
          <div className="lx">{l.text}</div>
          {(l.author || l.dateline) && (
            <div className="note-meta">
              {l.author && l.author !== 'Mara Venn' ? `${l.author} · ` : l.author ? 'Mara Venn · ' : ''}
              {l.dateline}
            </div>
          )}
        </article>
      ))}
    </>
  );
}
