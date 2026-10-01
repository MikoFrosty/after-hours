import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './ui/App';
import { game } from './runtime/game';
import { audio } from './audio/engine';
import { step } from './game/engine';

// Developer hook (only with ?dev): lets automated checks drive the real UI.
if (new URLSearchParams(location.search).has('dev')) {
  (window as unknown as Record<string, unknown>).__ah = { game, audio, step, autopilot: () => import('./game/autopilot') };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
