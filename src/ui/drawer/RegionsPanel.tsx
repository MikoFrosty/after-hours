import { useGameState } from '../hooks';
import { REGIONS } from '../../game/types';
import { label } from '../../game/chapters/c06';

export function RegionsPanel() {
  const s = useGameState();
  return (
    <>
      <p className="muted small">Last-known state of each region. Reports describe places as they were when sent.</p>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Known</th>
            <th>Policy</th>
            <th>As of</th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((r) => {
            const k = s.regions[r].known;
            return (
              <tr key={r}>
                <td>{label(r)}</td>
                <td>{k.settled ? 'Settled' : s.flags[`pending.${r}`] ? 'Awaiting receipt' : 'Unknown'}</td>
                <td className="mono">{k.policy ? `${k.policy} v${k.policyVersion}` : '—'}</td>
                <td className="mono">{k.asOfMs !== null ? `${Math.round((s.simMs - k.asOfMs) / 1000)} s ago` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
