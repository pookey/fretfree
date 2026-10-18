import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toLocalDate } from '../../engine/gamification/local-date';
import { emptyDailyProgress } from '../../engine/gamification/daily';
import { FretworkDB, saveDailyProgress, saveGamification } from '../../storage';
import { useStreakSummary } from './useStreakSummary';

let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`use-streak-summary-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('useStreakSummary', () => {
  it('loads, then follows writes without a reload', async () => {
    const { result } = renderHook(() => useStreakSummary(db));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.streak).toBe(0));

    await act(async () => {
      await saveGamification(db, { streakCurrent: 3, freezesHeld: 1 });
      await saveDailyProgress(db, { ...emptyDailyProgress(toLocalDate(new Date())), minutes: 5 });
    });
    await waitFor(() => expect(result.current?.streak).toBe(3));
    expect(result.current?.freezesHeld).toBe(1);
    await waitFor(() => expect(result.current?.goal.minutes).toBe(5));
  });

  it('re-reads today when the app comes back to the foreground', async () => {
    const { result } = renderHook(() => useStreakSummary(db));
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current?.goal.minutes).toBe(0));
  });
});
