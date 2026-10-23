import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PrivacyScreen } from './PrivacyScreen';

function renderScreen() {
  return render(
    <MemoryRouter>
      <PrivacyScreen />
    </MemoryRouter>,
  );
}

describe('<PrivacyScreen>', () => {
  it('says what stays on the device and what is never collected', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    const device = within(screen.getByRole('region', { name: 'What stays on your device' }));
    expect(device.getByText('Your progress.')).toBeInTheDocument();
    expect(device.getByRole('link', { name: 'export a backup from Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    const not = within(screen.getByRole('region', { name: 'What we don’t collect' }));
    expect(not.getByText('No cookies, no analytics, no ads.')).toBeInTheDocument();
  });

  it('covers hosting, the planned sign-in and other copies, with a way to ask', () => {
    renderScreen();
    expect(screen.getByRole('region', { name: 'Hosting' })).toHaveTextContent(
      'we keep no record of who visits',
    );
    expect(
      screen.getByRole('region', { name: 'Optional sign-in (not available yet)' }),
    ).toHaveTextContent('It will never be required.');
    expect(screen.getByRole('region', { name: 'Copies hosted by others' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/pookey/fretfree/issues',
    );
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });
});
