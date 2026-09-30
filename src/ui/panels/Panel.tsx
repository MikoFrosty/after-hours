import { useGameState } from '../hooks';
import { P01 } from './P01';
import { P02 } from './P02';
import { P03 } from './P03';
import { P04 } from './P04';
import { P05 } from './P05';
import { P06 } from './P06';
import { P07 } from './P07';
import { P08 } from './P08';

export function Panel() {
  const s = useGameState();
  switch (s.chapter) {
    case '01':
      return <P01 />;
    case '02':
      return <P02 />;
    case '03':
      return <P03 />;
    case '04':
      return <P04 />;
    case '05':
      return <P05 />;
    case '06':
      return <P06 />;
    case '07':
      return <P07 />;
    case '08':
      return <P08 />;
  }
}

export function Bar({ value, max, marks, tone }: { value: number; max: number; marks?: number[]; tone?: 'alt' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone ?? ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <i style={{ width: `${pct}%` }} />
      {marks?.map((m) => <span key={m} className="mark" style={{ left: `${(m / max) * 100}%` }} />)}
    </div>
  );
}
