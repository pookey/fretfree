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

  it('says what the optional account stores, where, why, and how to delete it', () => {
    renderScreen();
    const account = screen.getByRole('region', { name: 'If you sign in (optional)' });
    expect(account).toHaveTextContent('It’s never required');
    expect(account).toHaveTextContent('Your email address, used only to sign you in');
    expect(account).toHaveTextContent('a copy of your progress');
    expect(account).toHaveTextContent(
      'us-east-1: your email address in Amazon Cognito, and the copy of your progress in Amazon DynamoDB',
    );
    expect(account).toHaveTextContent('Amazon SES in the Europe (Ireland) region, eu-west-1');
    expect(account).toHaveTextContent('only hashed forms of your address');
    expect(account).toHaveTextContent('an anonymous marker');
    expect(within(account).getByRole('link', { name: 'Progress' })).toHaveAttribute(
      'href',
      '/progress',
    );
    const device = screen.getByRole('region', { name: 'What stays on your device' });
    expect(device).toHaveTextContent('this browser’s local storage');
    expect(device).toHaveTextContent('Export works whether or not you’re signed in');
  });

  it('covers hosting and other copies, with a way to ask', () => {
    renderScreen();
    expect(screen.getByRole('region', { name: 'Hosting' })).toHaveTextContent(
      'we keep no record of who visits',
    );
    expect(screen.getByRole('region', { name: 'Copies hosted by others' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/pookey/fretfree/issues',
    );
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });
});
