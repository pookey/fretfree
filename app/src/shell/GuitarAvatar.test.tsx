import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, saveGamification } from '../storage';
import { purchase, saveGarage } from '../storage/garage-repo';
import { GuitarAvatar } from './GuitarAvatar';

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.garage.clear(), db.garagePurchases.clear(), db.gamification.clear()]);
});

function renderAvatar(variant: 'full' | 'icon') {
  render(
    <MemoryRouter>
      <GuitarAvatar variant={variant} />
    </MemoryRouter>,
  );
  return screen.findByRole('link', { name: /^Your guitar: / });
}

const viewBox = (link: HTMLElement) =>
  waitFor(() => {
    const svg = link.querySelector('svg');
    expect(svg).not.toBeNull();
    return svg!.getAttribute('viewBox');
  });

describe('<GuitarAvatar>', () => {
  it('links the whole guitar and its name to the Garage', async () => {
    await saveGarage(getDb(), { name: 'Old Red' });
    const link = await renderAvatar('full');
    expect(link).toHaveAccessibleName('Your guitar: Old Red');
    expect(link).toHaveAttribute('href', '/progress/garage');
    expect(link).toHaveAttribute('data-variant', 'full');
    expect(link).toHaveAccessibleDescription(/^Stratocaster guitar, red,/);
    expect(link).toHaveTextContent('Your guitar');
    expect(link).toHaveTextContent('Old Red');
    expect(await viewBox(link)).toBe('-185 -200 370 1010');
  });

  it('shrinks to the body, with no name, in the icon sidebar', async () => {
    const link = await renderAvatar('icon');
    expect(link).toHaveAccessibleName('Your guitar: My guitar');
    expect(link).toHaveAttribute('data-variant', 'icon');
    expect(link).not.toHaveTextContent('My guitar');
    expect(await viewBox(link)).toBe('-185 300 370 502');
  });

  it('redraws when a part is equipped', async () => {
    await saveGamification(getDb(), { xpTotal: 1000 });
    const link = await renderAvatar('full');
    expect(link).toHaveAccessibleDescription(/, red,/);
    await act(async () => {
      await purchase(getDb(), 'finish.blue', new Date('2026-10-23T09:00:00Z'), { equip: true });
    });
    await waitFor(() => expect(link).toHaveAccessibleDescription(/, blue,/));
  });
});
