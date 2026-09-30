import { useEffect } from 'react';
import { game } from '../runtime/game';
import { audio } from '../audio/engine';
import { useGame } from './hooks';
import { useSettings } from './settings';
import { TitleScreen } from './TitleScreen';
import { Shell } from './Shell';

export function App() {
  const { s } = useGame();
  const settings = useSettings();

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  }, [settings.textScale]);

  useEffect(() => {
    // Browsers require a gesture before audio can start.
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const cls = [settings.reducedMotion ? 'reduce-motion' : '', settings.highContrast ? 'high-contrast' : ''].join(' ');

  if (game.screen === 'title' || !s) {
    return (
      <div className={cls}>
        <TitleScreen />
      </div>
    );
  }
  return (
    <div className={cls} style={{ height: '100%' }}>
      <Shell />
    </div>
  );
}
