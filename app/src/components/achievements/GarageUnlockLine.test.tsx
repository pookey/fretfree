import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GarageUnlockLine } from './GarageUnlockLine';

vi.mock('./garage-unlocks', () => ({
  garageUnlocks: (id: string) =>
    id === 'two'
      ? [
          { id: 'finish.a', name: 'A', noun: 'finish' },
          { id: 'inlay.b', name: 'B', noun: 'inlays' },
        ]
      : id === 'three'
        ? [
            { id: 'finish.a', name: 'A', noun: 'finish' },
            { id: 'finish.b', name: 'B', noun: 'finish' },
            { id: 'finish.c', name: 'C', noun: 'finish' },
          ]
        : [],
}));

describe('<GarageUnlockLine>', () => {
  it('joins two parts with "and"', () => {
    render(<GarageUnlockLine badgeId="two" />);
    expect(screen.getByTestId('garage-unlock')).toHaveTextContent(
      'Unlocks the A finish and the B inlays in the Garage',
    );
  });

  it('lists three parts with commas, then "and"', () => {
    render(<GarageUnlockLine badgeId="three" />);
    expect(screen.getByTestId('garage-unlock')).toHaveTextContent(
      'Unlocks the A finish, the B finish and the C finish in the Garage',
    );
  });

  it('renders nothing for a badge that unlocks nothing', () => {
    const { container } = render(<GarageUnlockLine badgeId="none" />);
    expect(container).toBeEmptyDOMElement();
  });
});
