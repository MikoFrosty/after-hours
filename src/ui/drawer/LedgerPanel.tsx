import { useGameState } from '../hooks';
import { byCategory, checkInvariant, nonClipMatter, total } from '../../game/ledger';
import { exact, fmtBig, fmtMass, fmtClips, CLIP } from '../../game/mass';
import type { Category } from '../../game/types';

const CAT_LABEL: Record<Category, string> = {
  unreached: 'Unreached',
  raw: 'Raw',
  inTransit: 'In transit',
  capital: 'Capital',
  livingProtected: 'Living (protected)',
  archiveProtected: 'Originals & archives (protected)',
  clips: 'Clips',
  radiatedEquivalent: 'Radiated equivalent',
};

const ORDER: Category[] = ['clips', 'raw', 'capital', 'inTransit', 'archiveProtected', 'livingProtected', 'unreached', 'radiatedEquivalent'];

export function LedgerPanel() {
  const s = useGameState();
  const inv = checkInvariant(s);
  const cats = byCategory(s);
  const accounts = Object.values(s.ledger.accounts).filter((a) => a.mass > 0n);
  return (
    <>
      <div className="card">
        <h3>
          Conservation <span className={`pill ${inv ? 'bad' : 'ok'}`}>{inv ? 'Violated' : 'Exact'}</span>
        </h3>
        <div className="small muted">Initial allocation = all material accounts + radiated equivalent. Every value is an integer number of micrograms.</div>
        <table className="ledger-table" style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td>Initial allocation</td>
              <td className="num">
                <Exact v={s.ledger.initial} />
              </td>
            </tr>
            <tr>
              <td>Sum of accounts</td>
              <td className="num">
                <Exact v={total(s)} />
              </td>
            </tr>
            <tr>
              <td>Non-clip matter</td>
              <td className="num">
                <Exact v={nonClipMatter(s)} />
              </td>
            </tr>
            <tr>
              <td>Lifetime clips made (statistic)</td>
              <td className="num">{fmtClips(s.clips.lifetimeMadeMicrograms)}</td>
            </tr>
            <tr>
              <td>Clip stock remainder below one clip</td>
              <td className="num">{(s.clips.currentMicrograms % CLIP).toString()} µg</td>
            </tr>
          </tbody>
        </table>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          The universe of this game is an authored finite inventory of 10⁶⁴ µg. It is a convenient fiction, not an estimate of the real universe.
        </div>
      </div>
      {ORDER.map((cat) => {
        const list = accounts.filter((a) => a.cat === cat);
        if (!list.length) return null;
        return (
          <div className="card" key={cat}>
            <h3>
              {CAT_LABEL[cat]} <span className="tag">{fmtMass(cats[cat])}</span>
            </h3>
            <table className="ledger-table">
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.label}
                      <div className="tiny faint mono">
                        {a.id}
                        {a.protected ? ' · protected' : ''}
                        {a.kind === 'record' ? ' · recording' : a.kind === 'reconstruction' ? ' · reconstruction' : ''}
                      </div>
                    </td>
                    <td className="num">
                      <Exact v={a.mass} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="tiny faint">{s.ledger.txCount.toLocaleString()} transactions committed.</p>
    </>
  );
}

export function Exact({ v }: { v: bigint }) {
  if (v < 1_000_000_000n) return <span title={`${exact(v)} µg`}>{fmtMass(v)}</span>;
  return (
    <details className="exact">
      <summary title="Show the exact value">{fmtMass(v)}</summary>
      <div className="digits">{exact(v)} µg</div>
      <div className="digits">≈ {fmtBig(v)} µg</div>
    </details>
  );
}
