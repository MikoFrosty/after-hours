import { useSyncExternalStore } from 'react';
import { game } from '../runtime/game';
import type { CampaignState } from '../game/types';

/** Re-render whenever the runtime notifies (at most once per animation frame with steps). */
export function useGame(): { s: CampaignState | null; v: number } {
  const v = useSyncExternalStore(game.subscribe, game.getVersion);
  return { s: game.state, v };
}

export function useGameState(): CampaignState {
  const { s } = useGame();
  if (!s) throw new Error('No game state');
  return s;
}

export const act = game.dispatch;
