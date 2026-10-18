import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app-store';
import { DEFAULT_SETTINGS } from '../engine/model';
import { getDb, saveSettings } from '../storage';
import { firstLaunchGuard, ONBOARDING_PATH } from './guard';

const url = new URL('http://app.test/');

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: false });
});

describe('firstLaunchGuard', () => {
  it('sends a first launch to onboarding', async () => {
    expect(await firstLaunchGuard(url)).toBe(ONBOARDING_PATH);
    expect(useAppStore.getState().loaded).toBe(true);
  });

  it('lets the learner through once onboarding was finished or skipped', async () => {
    await saveSettings(getDb(), { onboardedAt: new Date('2026-10-18T09:00:00Z') });
    expect(await firstLaunchGuard(url)).toBeNull();
  });

  it('uses the loaded settings without reading storage again', async () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, onboardedAt: new Date() },
      loaded: true,
    });
    expect(await firstLaunchGuard(url)).toBeNull();
  });
});
