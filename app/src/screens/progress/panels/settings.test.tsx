import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '../../../app-store';
import { DEFAULT_SETTINGS } from '../../../engine/model';
import { getDb, getSettings } from '../../../storage';
import { Panel } from './settings';

afterEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS });
});

describe('Progress settings panel', () => {
  it('turns blind mode on and off, and saves it', async () => {
    render(<Panel />);
    const blind = screen.getByRole('checkbox', { name: 'Blind mode' });
    expect(blind).not.toBeChecked();
    expect(blind).toHaveAccessibleDescription(/hide the fret inlays/);

    await userEvent.click(blind);
    await waitFor(() => expect(blind).toBeChecked());
    expect((await getSettings(getDb())).blindMode).toBe(true);

    await userEvent.click(blind);
    await waitFor(() => expect(blind).not.toBeChecked());
    expect((await getSettings(getDb())).blindMode).toBe(false);
  });
});
