import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillLoadFailed } from './DrillLoadFailed';

function Offline(): never {
  throw new Error('Failed to fetch dynamically imported module');
}

describe('<DrillLoadFailed>', () => {
  it('renders the drill while it loads', () => {
    render(
      <DrillLoadFailed title="Name the note">
        <p>Drill</p>
      </DrillLoadFailed>,
    );
    expect(screen.getByText('Drill')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says a view failed to download and offers a reload', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DrillLoadFailed title="Name the note" className="msg" buttonClassName="btn">
        <Offline />
      </DrillLoadFailed>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load Name the note. Check your connection');
    expect(alert).toHaveClass('msg');
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveClass('btn');
    error.mockRestore();
  });
});
