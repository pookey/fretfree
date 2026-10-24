import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AboutScreen } from './AboutScreen';

function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutScreen />
    </MemoryRouter>,
  );
}

describe('<AboutScreen>', () => {
  it('explains the evidence-based approach, not learning styles', () => {
    renderAbout();
    expect(screen.getByRole('heading', { level: 1, name: 'About FretFree' })).toBeInTheDocument();
    const approach = within(screen.getByRole('region', { name: 'How FretFree teaches' }));
    expect(approach.getByText(/not to a .learning style.\. Here.s why\./)).toBeInTheDocument();
    expect(approach.getByText(/Pashler et al\. 2008/)).toBeInTheDocument();
    for (const name of [/answer/, /Spaced/, /Mixed/, /Fast/, /Hard enough/, /Guides that fade/])
      expect(approach.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    expect(approach.getByText(/almost no controlled research/)).toBeInTheDocument();
  });

  it('covers privacy: an optional account, no analytics, local data', () => {
    renderAbout();
    const privacy = within(screen.getByRole('region', { name: 'Privacy' }));
    expect(privacy.getByText('An account is optional.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Privacy' })).toHaveTextContent(
      'we store your email address and that copy on Amazon Web Services in the US (us-east-1)',
    );
    expect(privacy.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress');
    expect(privacy.getByText('No analytics.')).toBeInTheDocument();
    expect(privacy.getByText('Your data stays here.')).toBeInTheDocument();
    expect(privacy.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(privacy.getByRole('link', { name: 'Read the full privacy page' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('sums it up in the context panel and links back', () => {
    renderAbout();
    expect(screen.getByRole('heading', { level: 2, name: 'In short' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('says what XP is for', () => {
    renderAbout();
    const xp = within(screen.getByRole('region', { name: 'What XP is for' }));
    expect(xp.getByText(/right or wrong.*count most/)).toBeInTheDocument();
    expect(xp.getByText(/buy parts for your guitar in the Garage/)).toBeInTheDocument();
  });

  it('notes the guitar trademarks and that FretFree is not affiliated', () => {
    renderAbout();
    const note = within(screen.getByRole('region', { name: 'Guitar names' }));
    expect(
      note.getByText(
        'Stratocaster, Telecaster and Jazzmaster are trademarks of Fender Musical Instruments Corporation. Les Paul, SG and ES-335 are trademarks of Gibson Brands, Inc. FretFree isn’t affiliated with or endorsed by either. The guitar drawings are our own.',
      ),
    ).toBeInTheDocument();
  });
});
