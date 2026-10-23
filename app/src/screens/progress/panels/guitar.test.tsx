import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogueItem } from '../../../engine/garage';
import { getDb, saveGamification } from '../../../storage';
import { purchase, saveGarage } from '../../../storage/garage-repo';
import { PROGRESS_PANELS } from '../registry';
import { Panel, id, title } from './guitar';

const BLUE_PRICE = catalogueItem('finish.blue')!.price!;

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.garage.clear(), db.garagePurchases.clear(), db.gamification.clear()]);
});

function renderPanel() {
  render(
    <MemoryRouter>
      <Panel revision={0} onDataChanged={() => {}} />
    </MemoryRouter>,
  );
}

const preview = () => screen.getAllByRole('img', { name: /^[^:]+: \w[\w ]* guitar, / })[0]!;

describe('Progress "Your guitar" panel', () => {
  it('is registered after the practice calendar', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids.indexOf(id)).toBe(ids.indexOf('calendar') + 1);
    expect(title).toBe('Your guitar');
  });

  it('previews the build with its name and balance, and opens the Garage', async () => {
    await saveGamification(getDb(), { xpTotal: 1240 });
    await saveGarage(getDb(), { name: 'Old Red' });
    renderPanel();
    expect(await screen.findByTestId('progress-guitar-name')).toHaveTextContent('Old Red');
    await waitFor(() =>
      expect(screen.getByTestId('progress-guitar-balance')).toHaveTextContent(
        '1,240 to spend in the Garage',
      ),
    );
    expect(preview()).toHaveAccessibleName(/^Old Red: Stratocaster guitar, red,/);
    expect(screen.getByRole('link', { name: 'Open the Garage' })).toHaveAttribute(
      'href',
      '/progress/garage',
    );
  });

  it('follows a purchase live: the new part and what is left to spend', async () => {
    await saveGamification(getDb(), { xpTotal: 1000 });
    renderPanel();
    await screen.findByTestId('progress-guitar-name');
    await waitFor(() =>
      expect(screen.getByTestId('progress-guitar-balance')).toHaveTextContent('1,000 to spend'),
    );
    await act(async () => {
      await purchase(getDb(), 'finish.blue', new Date('2026-10-23T09:00:00Z'), { equip: true });
    });
    await waitFor(() => expect(preview()).toHaveAccessibleName(/, blue,/));
    await waitFor(() =>
      expect(screen.getByTestId('progress-guitar-balance')).toHaveTextContent(
        `${(1000 - BLUE_PRICE).toLocaleString('en')} to spend`,
      ),
    );
  });
});
