import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STARTER_BUILD, catalogueItem } from '../../engine/garage';
import { getDb, saveGamification } from '../../storage';
import { getGarage, listPurchases } from '../../storage/garage-repo';
import { GarageScreen } from './GarageScreen';

const BLUE_PRICE = catalogueItem('finish.blue')!.price!;
const now = new Date('2026-10-23T09:00:00Z');

afterEach(async () => {
  const db = getDb();
  await Promise.all([
    db.garage.clear(),
    db.garagePurchases.clear(),
    db.gamification.clear(),
    db.achievements.clear(),
  ]);
});

async function renderGarage(xp: number) {
  await saveGamification(getDb(), { xpTotal: xp });
  render(
    <MemoryRouter>
      <GarageScreen now={() => now} />
    </MemoryRouter>,
  );
  await screen.findByTestId('garage-balance');
}

const balance = () => screen.getByTestId('garage-balance');
const preview = () => screen.getAllByRole('img', { name: /^[^:]+: \w[\w ]* guitar, / })[0]!;
const swatch = (name: RegExp) => screen.getByRole('button', { name });
const panel = () => screen.getByTestId('context-panel');

describe('GarageScreen', () => {
  it('shows the build, the balance and the parts panel', async () => {
    await renderGarage(1234);
    expect(screen.getByRole('heading', { name: 'Garage', level: 1 })).toBeInTheDocument();
    expect(balance()).toHaveTextContent('1,234 to spend');
    expect(screen.getByLabelText('Guitar name')).toHaveValue(STARTER_BUILD.name);
    expect(within(panel()).getByRole('tablist', { name: 'Part categories' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Progress' })).toHaveAttribute('href', '/progress');
    await waitFor(() => expect(preview()).toHaveAccessibleName(/Stratocaster guitar, red/));
  });

  it('tries a part on for free, and resets to the build', async () => {
    await renderGarage(1000);
    const reset = screen.getByRole('button', { name: 'Reset to my build' });
    expect(reset).toBeDisabled();
    fireEvent.click(swatch(/^Blue/));
    await waitFor(() => expect(preview()).toHaveAccessibleName(/, blue,/));
    expect(screen.getByText('Trying on: Blue finish. Nothing is spent.')).toBeInTheDocument();
    expect(balance()).toHaveTextContent('1,000 to spend');
    expect(await listPurchases(getDb())).toEqual([]);
    expect((await getGarage(getDb())).spec.finish).toBe('finish.red');

    fireEvent.click(reset);
    await waitFor(() => expect(preview()).toHaveAccessibleName(/, red,/));
    expect(reset).toBeDisabled();
  });

  it('buys and equips a part, and the balance updates live', async () => {
    await renderGarage(1000);
    fireEvent.click(swatch(/^Blue/));
    fireEvent.click(screen.getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` }));
    await waitFor(() =>
      expect(balance()).toHaveTextContent(`${(1000 - BLUE_PRICE).toLocaleString('en')} to spend`),
    );
    expect((await getGarage(getDb())).spec.finish).toBe('finish.blue');
    expect(within(screen.getByTestId('selected-part')).getByText('Owned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to my build' })).toBeDisabled();
  });

  it('re-equips an owned part for free', async () => {
    await renderGarage(1000);
    fireEvent.click(swatch(/^Blue/));
    fireEvent.click(screen.getByRole('button', { name: /^Buy/ }));
    await waitFor(async () => expect((await getGarage(getDb())).spec.finish).toBe('finish.blue'));
    fireEvent.click(swatch(/^Red/));
    await waitFor(async () => expect((await getGarage(getDb())).spec.finish).toBe('finish.red'));
    // And again once the screen has caught up with the purchase.
    await waitFor(() => expect(swatch(/^Blue/)).toHaveTextContent('Owned'));
    fireEvent.click(swatch(/^Blue/));
    await waitFor(async () => expect((await getGarage(getDb())).spec.finish).toBe('finish.blue'));
    fireEvent.click(swatch(/^Red/));
    await waitFor(async () => expect((await getGarage(getDb())).spec.finish).toBe('finish.red'));
    expect(await listPurchases(getDb())).toHaveLength(1);
    expect(balance()).toHaveTextContent(`${(1000 - BLUE_PRICE).toLocaleString('en')} to spend`);
  });

  it('keeps a try-on when a purchase is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderGarage(BLUE_PRICE);
    fireEvent.click(swatch(/^Blue/));
    // Spent elsewhere before this tap lands: the repo re-checks and refuses.
    await act(() => getDb().garagePurchases.add({ itemId: 'finish.black', price: 1, at: now }));
    const buy = screen.getByRole('button', { name: /^Buy/ });
    await waitFor(() => expect(buy).toBeDisabled());
    expect(preview()).toHaveAccessibleName(/, blue,/);
    warn.mockRestore();
  });

  it('saves the name on blur, trimmed', async () => {
    await renderGarage(0);
    const input = screen.getByLabelText('Guitar name');
    expect(input).toHaveAttribute('maxLength', '40');
    fireEvent.change(input, { target: { value: '  Blue Moon  ' } });
    expect(input).toHaveValue('  Blue Moon  ');
    fireEvent.blur(input);
    expect(input).toHaveValue('Blue Moon');
    await waitFor(async () => expect((await getGarage(getDb())).name).toBe('Blue Moon'));
    await waitFor(() => expect(preview()).toHaveAccessibleName(/^Blue Moon: /));
  });

  it('saves the name on Enter, and falls back to the default when emptied', async () => {
    await saveGamification(getDb(), { xpTotal: 0 });
    await getDb().garage.put({ ...STARTER_BUILD, name: 'Old name', key: 'singleton' });
    render(
      <MemoryRouter>
        <GarageScreen />
      </MemoryRouter>,
    );
    const input = await screen.findByLabelText('Guitar name');
    await waitFor(() => expect(input).toHaveValue('Old name'));
    input.focus();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(async () => expect((await getGarage(getDb())).name).toBe(STARTER_BUILD.name));
    expect(input).toHaveValue(STARTER_BUILD.name);
  });

  it('does not save an unchanged name', async () => {
    await renderGarage(0);
    const input = screen.getByLabelText('Guitar name');
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: STARTER_BUILD.name } });
    fireEvent.blur(input);
    expect(await getDb().garage.get('singleton')).toBeUndefined();
  });
});
