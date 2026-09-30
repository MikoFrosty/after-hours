import { useEffect, useRef } from 'react';
import { useGameState } from '../hooks';
import { LogPanel } from './LogPanel';
import { LedgerPanel } from './LedgerPanel';
import { OfficeBookmark } from './OfficeBookmark';
import { ArchivePanel } from './ArchivePanel';
import { CheckpointPanel } from './CheckpointPanel';
import { SettingsPanel } from './SettingsPanel';
import { RegionsPanel } from './RegionsPanel';
import type { C08State } from '../../game/types';

export type DrawerTab = 'log' | 'ledger' | 'office' | 'archive' | 'regions' | 'checkpoints' | 'settings';

const TITLES: Record<DrawerTab, string> = {
  log: 'Log & correspondence',
  ledger: 'Matter ledger',
  office: 'The office',
  archive: 'Archive',
  regions: 'Regions',
  checkpoints: 'Checkpoints & saves',
  settings: 'Settings',
};

export function Drawer({ tab, onTab, onClose }: { tab: DrawerTab; onTab: (t: DrawerTab) => void; onClose: () => void }) {
  const s = useGameState();
  const ref = useRef<HTMLDivElement>(null);
  const c8 = s.chapterState.kind === '08' ? (s.chapterState as C08State) : null;
  const gone = (t: string) => Boolean(c8?.tasksDone.includes(t as never));
  // Out-of-world tabs stay available; in-world history and region navigation are withdrawn in Act 8.
  const hidden: Partial<Record<DrawerTab, boolean>> = {
    regions: gone('relays') || s.chapter < '06',
    log: gone('archive'),
    ledger: gone('archive'),
    archive: gone('archive'),
    office: gone('main_compute'),
  };
  useEffect(() => {
    ref.current?.focus();
  }, [tab]);
  useEffect(() => {
    if (hidden[tab]) onClose();
  });
  const tabs = (Object.keys(TITLES) as DrawerTab[]).filter((t) => !hidden[t]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={TITLES[tab]} tabIndex={-1} ref={ref}>
        <header>
          <h2>{TITLES[tab]}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <nav className="row" style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', gap: 4 }} aria-label="Drawer sections">
          {tabs.map((t) => (
            <button key={t} className="btn small ghost" aria-pressed={t === tab} onClick={() => onTab(t)}>
              {TITLES[t].split(' ')[0]}
            </button>
          ))}
        </nav>
        <div className="body">
          {tab === 'log' && <LogPanel />}
          {tab === 'ledger' && <LedgerPanel />}
          {tab === 'office' && <OfficeBookmark />}
          {tab === 'archive' && <ArchivePanel />}
          {tab === 'regions' && <RegionsPanel />}
          {tab === 'checkpoints' && <CheckpointPanel onClose={onClose} />}
          {tab === 'settings' && <SettingsPanel />}
        </div>
      </aside>
    </>
  );
}
