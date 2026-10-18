import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TodayScreen } from './TodayScreen';

describe('<TodayScreen>', () => {
  it('renders the given cards in the order given', () => {
    const cards = [
      { id: 'one', order: 1, Card: () => <p>First card</p> },
      { id: 'two', order: 2, Card: () => <p>Second card</p> },
    ];
    render(<TodayScreen cards={cards} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getAllByText(/card$/).map((p) => p.textContent)).toEqual([
      'First card',
      'Second card',
    ]);
  });

  it('renders the registered hero and stats by default', async () => {
    render(
      <MemoryRouter>
        <TodayScreen />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('start-session')).toHaveAttribute('href', '/session');
    await waitFor(() => expect(screen.getByTestId('new-count')).toHaveTextContent(/^\d+$/));
  });
});
