import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProgressScreen } from './ProgressScreen';
import type { PanelProps } from './registry';

describe('<ProgressScreen>', () => {
  it('renders titled panels as labelled sections and shares data changes', () => {
    const panels = [
      {
        id: 'writer',
        order: 1,
        title: 'Writer',
        Panel: ({ onDataChanged }: PanelProps) => (
          <button type="button" onClick={onDataChanged}>
            Change data
          </button>
        ),
      },
      {
        id: 'reader',
        order: 2,
        Panel: ({ revision }: PanelProps) => <p data-testid="revision">{revision}</p>,
      },
    ];
    render(<ProgressScreen panels={panels} />);
    expect(screen.getByRole('region', { name: 'Writer' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByTestId('revision')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'Change data' }));
    expect(screen.getByTestId('revision')).toHaveTextContent('1');
  });

  it('keeps the other panels when one throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const panels = [
      {
        id: 'broken',
        order: 1,
        title: 'Broken',
        Panel: () => {
          throw new TypeError('Type error');
        },
      },
      { id: 'fine', order: 2, title: 'Fine', Panel: () => <p>Still here</p> },
    ];
    render(<ProgressScreen panels={panels} />);
    expect(screen.getByRole('region', { name: 'Broken' })).toHaveTextContent(/couldn’t be shown/);
    expect(screen.getByText('Still here')).toBeInTheDocument();
    error.mockRestore();
  });
});
