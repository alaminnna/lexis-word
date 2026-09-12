// Settings slice: user preferences with validation clamps (§19 UserSettings).

import { create } from 'zustand';
import type { HapticsSettings, SoundSettings, UserSettings } from '../types/domain';
import { DEFAULT_SETTINGS, persistence } from '../services/persistence';

interface SettingsState extends UserSettings {
  update: (patch: Partial<UserSettings>) => void;
  updateSound: (patch: Partial<SoundSettings>) => void;
  updateHaptics: (patch: Partial<HapticsSettings>) => void;
  reset: () => void;
  hydrate: () => void;
}

function clampSettings(patch: Partial<UserSettings>): Partial<UserSettings> {
  const out: Partial<UserSettings> = { ...patch };
  if (typeof out.dailyNewTarget === 'number') {
    out.dailyNewTarget = Math.min(15, Math.max(4, Math.round(out.dailyNewTarget)));
  }
  if (typeof out.maxActiveWords === 'number') {
    out.maxActiveWords = Math.min(200, Math.max(20, Math.round(out.maxActiveWords)));
  }
  if (typeof out.sessionLengthTarget === 'number') {
    out.sessionLengthTarget = Math.min(25, Math.max(10, Math.round(out.sessionLengthTarget)));
  }
  return out;
}

export const useSettings = create<SettingsState>()((set) => ({
  ...DEFAULT_SETTINGS,
  update: (patch) => set((s) => ({ ...s, ...clampSettings(patch) })),
  updateSound: (patch) => set((s) => ({
    sound: {
      ...s.sound, ...patch,
      volume: patch.volume === undefined ? s.sound.volume : Math.min(1, Math.max(0, patch.volume)),
    },
  })),
  updateHaptics: (patch) => set((s) => ({ haptics: { ...s.haptics, ...patch } })),
  reset: () => set(() => ({ ...DEFAULT_SETTINGS })),
  hydrate: () => {
    const loaded = persistence.loadSettings();
    if (loaded) set(() => ({ ...loaded }));
  },
}));

/** Plain settings snapshot (for engine input + persistence). */
export function settingsSnapshot(): UserSettings {
  const s = useSettings.getState();
  const { update: _update, updateSound: _us, updateHaptics: _uh, reset: _reset, hydrate: _hydrate, ...rest } = s;
  return rest;
}
