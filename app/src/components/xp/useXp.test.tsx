import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FretworkDB, saveGamification } from '../../storage';
import { useXp } from './useXp';

let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`use-xp-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('useXp', () => {
  it('loads, then follows XP and purchases without a reload', async () => {
    const { result } = renderHook(() => useXp(db));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ earned: 0, toSpend: 0 }));

    await act(async () => {
      await saveGamification(db, { xpTotal: 500 });
    });
    await waitFor(() => expect(result.current).toEqual({ earned: 500, toSpend: 500 }));

    await act(async () => {
      await db.garagePurchases.add({ itemId: 'finish.blue', price: 120, at: new Date(0) });
    });
    await waitFor(() => expect(result.current).toEqual({ earned: 500, toSpend: 380 }));
  });

  it('shows a balance an offline merge overdrew as 0, and XP earned unchanged', async () => {
    await saveGamification(db, { xpTotal: 100 });
    await db.garagePurchases.bulkAdd([
      { itemId: 'finish.blue', price: 80, at: new Date(0) },
      { itemId: 'finish.green', price: 80, at: new Date(1) },
    ]);
    const { result } = renderHook(() => useXp(db));
    await waitFor(() => expect(result.current).toEqual({ earned: 100, toSpend: 0 }));
  });
});
