import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { getDb, saveGamification } from '../../../storage';
import { Panel } from './stats';

describe('stats panel', () => {
  it('shows XP earned and the Garage balance, live, with what XP is for', async () => {
    const db = getDb();
    await saveGamification(db, { xpTotal: 1240 });
    await db.garagePurchases.add({ itemId: 'finish.blue', price: 240, at: new Date(0) });
    render(<Panel revision={0} onDataChanged={() => {}} />);

    expect(screen.getByText('XP earned')).toBeInTheDocument();
    expect(screen.getByText('To spend in the Garage')).toBeInTheDocument();
    expect(await screen.findByText('1,240')).toHaveAttribute('data-testid', 'xp-earned');
    expect(screen.getByTestId('xp-to-spend')).toHaveTextContent('1,000');

    const explainer = screen.getByRole('region', { name: 'What XP is for' });
    expect(explainer).toHaveTextContent(/due .* new .* count most/);
    expect(explainer).toHaveTextContent(/buy parts for your guitar/);

    await act(async () => {
      await saveGamification(db, { xpTotal: 1300 });
    });
    expect(await screen.findByText('1,300')).toHaveAttribute('data-testid', 'xp-earned');
    expect(screen.getByTestId('xp-to-spend')).toHaveTextContent('1,060');
  });
});
