import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SettingsScreen } from './SettingsScreen';

vi.mock('../../audio/audio', () => ({
  unlockAudio: vi.fn(() => Promise.resolve()),
  playNotes: vi.fn(() => Promise.resolve()),
}));

describe('<SettingsScreen>', () => {
  it('holds the settings cards, your data and the About and Privacy links', () => {
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Your guitar' })).toBeInTheDocument();
    const data = within(screen.getByRole('region', { name: 'Your data' }));
    expect(data.getByRole('button', { name: 'Export data' })).toBeInTheDocument();
    expect(data.getByRole('button', { name: 'Import data' })).toBeInTheDocument();
    const about = within(screen.getByRole('region', { name: 'About' }));
    expect(about.getByRole('link', { name: 'About FretFree' })).toHaveAttribute('href', '/about');
    expect(about.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
});
