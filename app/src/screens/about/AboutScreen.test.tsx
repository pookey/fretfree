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

  it('covers privacy: no account, no analytics, local data', () => {
    renderAbout();
    const privacy = within(screen.getByRole('region', { name: 'Privacy' }));
    expect(privacy.getByText('No account.')).toBeInTheDocument();
    expect(privacy.getByText('No analytics.')).toBeInTheDocument();
    expect(privacy.getByText('Your data stays here.')).toBeInTheDocument();
    expect(privacy.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress');
  });

  it('sums it up in the context panel and links back', () => {
    renderAbout();
    expect(screen.getByRole('heading', { level: 2, name: 'In short' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Progress' })).toHaveAttribute(
      'href',
      '/progress',
    );
  });
});
