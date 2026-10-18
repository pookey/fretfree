import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from './engine/model';
import { getDb, getSettings, saveSettings } from './storage';

interface AppState {
  settings: Settings;
  loaded: boolean;
  load(): Promise<void>;
  update(patch: Partial<Settings>): Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    set({ settings: await getSettings(getDb()), loaded: true });
  },
  async update(patch) {
    set({ settings: await saveSettings(getDb(), patch) });
  },
}));
