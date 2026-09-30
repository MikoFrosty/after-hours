import { setSettings, useSettings } from '../settings';

export function SettingsPanel() {
  const st = useSettings();
  return (
    <div className="list">
      <div className="card">
        <h3>Sound</h3>
        <label className="row between">
          <span>Mute all sound</span>
          <input type="checkbox" checked={st.muted} onChange={(e) => setSettings({ muted: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
        <label className="row between" style={{ marginTop: 8 }}>
          <span>Music and ambience</span>
          <input type="range" min={0} max={1} step={0.05} value={st.music} onChange={(e) => setSettings({ music: Number(e.target.value) })} aria-label="Music volume" />
        </label>
        <label className="row between" style={{ marginTop: 8 }}>
          <span>Effects</span>
          <input type="range" min={0} max={1} step={0.05} value={st.sfx} onChange={(e) => setSettings({ sfx: Number(e.target.value) })} aria-label="Effects volume" />
        </label>
        <p className="tiny faint">Music is optional and never required to understand a state.</p>
      </div>
      <div className="card">
        <h3>Accessibility</h3>
        <label className="row between">
          <span>Reduce motion</span>
          <input type="checkbox" checked={st.reducedMotion} onChange={(e) => setSettings({ reducedMotion: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
        <label className="row between" style={{ marginTop: 8 }}>
          <span>Higher contrast</span>
          <input type="checkbox" checked={st.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
        <div className="row between" style={{ marginTop: 8 }}>
          <span>Text size</span>
          <div className="row" role="group" aria-label="Text size">
            {[0.9, 1, 1.15, 1.3].map((x) => (
              <button key={x} className="btn small" aria-pressed={st.textScale === x} onClick={() => setSettings({ textScale: x })}>
                {Math.round(x * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card small muted">
        <h3>Keyboard</h3>
        <div>Space or Enter on the focused button — make a clip · P pause · 1 / 4 pace · N next event · L ledger · O office · Esc close</div>
      </div>
    </div>
  );
}
