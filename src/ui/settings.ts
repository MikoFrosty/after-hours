import { useSyncExternalStore } from 'react';
import { SETTINGS_KEY } from '../game/save';
import { audio } from '../audio/engine';

export interface UISettings {
  reducedMotion: boolean;
  textScale: number;
  highContrast: boolean;
  music: number;
  sfx: number;
  muted: boolean;
}

const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let settings: UISettings = {
  reducedMotion: Boolean(prefersReduced),
  textScale: 1,
  highContrast: false,
  music: 0.55,
  sfx: 0.7,
  muted: false,
};
try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) settings = { ...settings, ...JSON.parse(raw) };
} catch {
  /* storage unavailable */
}
audio.applySettings({ music: settings.music, sfx: settings.sfx, muted: settings.muted });

const listeners = new Set<() => void>();

export function setSettings(patch: Partial<UISettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* in-memory only */
  }
  audio.applySettings({ music: settings.music, sfx: settings.sfx, muted: settings.muted });
  for (const l of listeners) l();
}

export function useSettings(): UISettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => settings,
  );
}

export const getSettings = () => settings;
