import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { getDb } from '../../../storage';
import { PROGRESS_PANELS } from '../registry';
import { Panel, id, title } from './achievements';

afterEach(async () => {
  await getDb().achievements.clear();
});

describe('Progress achievements panel', () => {
  it('is registered under the stats panel', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids).toContain(id);
    expect(ids.indexOf(id)).toBe(ids.indexOf('stats') + 1);
    expect(title).toBe('Achievements');
  });

  it('lists the badges and updates live when one unlocks', async () => {
    render(<Panel revision={0} onDataChanged={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('achievement-string-5-master')).toHaveAttribute(
        'data-unlocked',
        'false',
      ),
    );
    await act(() => getDb().achievements.put({ id: 'string-5-master', unlockedAt: new Date() }));
    await waitFor(() =>
      expect(screen.getByTestId('achievement-string-5-master')).toHaveAttribute(
        'data-unlocked',
        'true',
      ),
    );
    expect(screen.getByTestId('achievement-tally')).toHaveTextContent(/^1 of \d+ unlocked$/);
  });
});
