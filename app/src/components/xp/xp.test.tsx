import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { GarageBalance } from './GarageBalance';
import { GARAGE_PATH } from './garage-path';
import { XpExplainer } from './XpExplainer';

describe('<GarageBalance>', () => {
  it('is plain text until the Garage route exists', () => {
    render(
      <MemoryRouter>
        <GarageBalance toSpend={1240} garagePath={null} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('garage-balance')).toHaveTextContent('1,240 to spend in the Garage');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links to the Garage once it has a path', () => {
    render(
      <MemoryRouter>
        <GarageBalance toSpend={0} garagePath="/progress/garage" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '0 to spend in the Garage' })).toHaveAttribute(
      'href',
      '/progress/garage',
    );
  });

  it('reads the Garage path from its route file, if there is one', () => {
    expect(GARAGE_PATH === undefined || GARAGE_PATH.startsWith('/')).toBe(true);
  });
});

describe('<XpExplainer>', () => {
  it('is a titled region saying what XP is for', () => {
    render(<XpExplainer />);
    const region = screen.getByRole('region', { name: 'What XP is for' });
    expect(region).toHaveTextContent(/count most/);
    expect(region).toHaveTextContent(/buy parts for your guitar/);
  });
});
