import { useGameState, act } from '../hooks';
import type { C06State, RegionId } from '../../game/types';
import { REGIONS } from '../../game/types';
import { REMOTE } from '../../content/campaign';
import { label } from '../../game/chapters/c06';
import { Art } from './Scene';

export const NODE_POS: Record<RegionId, [number, number]> = {
  origin: [80, 250],
  A: [230, 120],
  B: [250, 310],
  C: [420, 90],
  D: [430, 290],
  E: [570, 190],
};

const POLICY_COLOR = { steward: '#8fd6a6', balanced: '#cfd7de', extractor: '#d78351' } as const;

/** Route from origin to a region along known edges (for drawing outbound messages). */
function routeTo(r: RegionId): RegionId[] {
  const parent: Partial<Record<RegionId, RegionId>> = { A: 'origin', B: 'origin', C: 'A', D: 'B', E: 'D' };
  const path: RegionId[] = [r];
  while (path[0] !== 'origin') path.unshift(parent[path[0]]!);
  return path;
}

export function RemoteScene() {
  const s = useGameState();
  const c = s.chapterState.kind === '06' ? (s.chapterState as C06State) : null;
  const R = s.regions;
  // Only outbound messages the central office itself sent are drawn; inbound evidence is invisible until it arrives.
  const outbound = s.messages.filter((m) => m.from === 'origin');
  return (
    <>
      <Art src="./art/06-offices.webp" filter="brightness(0.7)" />
      <div className="scene-label">Distant offices · last known state</div>
      <div style={{ position: 'absolute', inset: '40px 12px 12px' }}>
        <svg className="schematic" viewBox="0 0 640 380" style={{ height: '100%' }} role="img" aria-label={REGIONS.map((r) => `${label(r)}: ${R[r].known.settled ? `settled, ${R[r].known.policy}` : s.flags[`pending.${r}`] ? 'awaiting receipt' : 'unknown'}`).join('. ')}>
          {REMOTE.edges.map((e) => {
            const [x1, y1] = NODE_POS[e.from];
            const [x2, y2] = NODE_POS[e.to];
            const known = R[e.from].known.settled && R[e.to].known.settled;
            return (
              <g key={e.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={known ? 'rgba(207,215,222,0.55)' : 'rgba(207,215,222,0.2)'} strokeWidth={known ? 2 : 1.5} strokeDasharray={known ? undefined : '4 6'} />
                <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6} fill="var(--faint)" fontSize={11} fontFamily="var(--font-mono)">
                  {e.delayMs / 1000}s
                </text>
              </g>
            );
          })}
          {outbound.map((m) => {
            const path = routeTo(m.to).map((r) => NODE_POS[r]);
            const t = Math.min(1, Math.max(0, (s.simMs - m.sentAtMs) / Math.max(1, m.deliverAtMs - m.sentAtMs)));
            // Position along the polyline.
            const segs = path.slice(1).map((p, i) => [path[i], p] as const);
            const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
            let d = t * lens.reduce((x, y) => x + y, 0);
            let pos = path[0];
            for (let i = 0; i < segs.length; i++) {
              if (d <= lens[i]) {
                const [a, b] = segs[i];
                pos = [a[0] + ((b[0] - a[0]) * d) / lens[i], a[1] + ((b[1] - a[1]) * d) / lens[i]];
                break;
              }
              d -= lens[i];
              pos = segs[i][1];
            }
            return (
              <g key={m.id}>
                <circle cx={pos[0]} cy={pos[1]} r={5} fill="var(--accent)" />
                <text x={pos[0] + 8} y={pos[1] - 8} fontSize={10} fill="var(--accent)" fontFamily="var(--font-mono)">
                  {m.kind === 'command' ? 'order' : m.kind} · {Math.max(0, Math.ceil((m.deliverAtMs - s.simMs) / 1000))}s
                </text>
              </g>
            );
          })}
          {REGIONS.map((r) => {
            const [x, y] = NODE_POS[r];
            const k = R[r].known;
            const pending = Boolean(s.flags[`pending.${r}`]) && !k.settled;
            const focus = c?.focus === r;
            const col = k.policy ? POLICY_COLOR[k.policy] : 'rgba(255,255,255,0.4)';
            return (
              <g key={r} transform={`translate(${x},${y})`} style={{ cursor: c ? 'pointer' : 'default' }} onClick={() => c && act({ type: 'c06/focus', region: r })}>
                {focus && <circle r={34} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
                <circle r={24} fill="rgba(8,10,14,0.92)" stroke={k.settled ? col : 'rgba(255,255,255,0.35)'} strokeWidth={2.5} strokeDasharray={k.settled ? undefined : pending ? '3 3' : '1 5'} />
                {r === 'C' && (k.protected || s.anchors.cworld.protected) && k.settled && <circle r={29} fill="none" stroke="#8fd6a6" strokeWidth={1} strokeDasharray="2 3" />}
                <text textAnchor="middle" y={5} fill="#fff" fontSize={14} fontFamily="var(--font-mono)">
                  {r === 'origin' ? 'O' : r}
                </text>
                <text textAnchor="middle" y={42} fill={k.settled ? col : 'var(--faint)'} fontSize={11}>
                  {k.settled ? `${k.policy} v${k.policyVersion}` : pending ? 'awaiting receipt' : 'unknown'}
                </text>
                {k.settled && k.asOfMs !== null && r !== 'origin' && (
                  <text textAnchor="middle" y={56} fill="var(--faint)" fontSize={10} fontFamily="var(--font-mono)">
                    as of {Math.round((s.simMs - k.asOfMs) / 1000)}s ago
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}
