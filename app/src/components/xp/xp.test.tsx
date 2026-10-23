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

  it('reads the Garage path from its route file', () => {
    expect(GARAGE_PATH).toBe('/progress/garage');
  });

  it('links by default, with a full-size tap target', () => {
    render(
      <MemoryRouter>
        <GarageBalance toSpend={380} className="extra" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '380 to spend in the Garage' });
    expect(link).toHaveAttribute('href', '/progress/garage');
    // The module class sets min-block-size: var(--tap); the caller's class is kept.
    expect(link.className).toMatch(/link/);
    expect(link).toHaveClass('extra');
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
