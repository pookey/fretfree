import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AccountApiError } from './api';
import { createAccountDeletion, type DeletionDeps } from './delete';
import { ManageAccount, viewOf } from './ManageAccount';
import { loadAccount, loadDeletion, saveAccount, saveDeletion, savePending } from './store';
import { TOKENS } from './test-fakes';

const EMAIL = 'me@example.com';
const LIVE = { ...TOKENS, expiresAt: Date.now() + 3_600_000 };

afterEach(() => {
  saveAccount(null);
  savePending(null);
  saveDeletion(null);
  localStorage.clear();
});

/** A deletion whose server answers as `answer` says; `release` lets a held answer through. */
function fakeDeletion(answer: () => Promise<void> = async () => undefined) {
  const deps: DeletionDeps = {
    deleteAccount: vi.fn(answer),
    cognito: vi.fn(),
    now: Date.now,
    stopSync: vi.fn(),
    restartSync: vi.fn(),
    clearLocal: vi.fn(async () => undefined),
    wait: () => new Promise(() => undefined),
  };
  return { deps, flow: createAccountDeletion(deps) };
}

function renderPanel(deletion = fakeDeletion().flow, exportBackup = vi.fn(async () => 'f.json')) {
  const restart = vi.fn();
  render(
    <MemoryRouter>
      <ManageAccount deletion={deletion} exportBackup={exportBackup} restart={restart} />
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), exportBackup, restart };
}

const signIn = () => saveAccount({ email: EMAIL, tokens: LIVE, signedInAt: Date.now() });
const panel = () => screen.getByTestId('manage-account');

describe('ManageAccount', () => {
  it('renders nothing when this build has no accounts, or nobody is signed in', () => {
    const { container } = render(<ManageAccount deletion={null} />);
    expect(container).toBeEmptyDOMElement();
    renderPanel();
    expect(screen.queryByTestId('manage-account')).toBeNull();
  });

  it('says what deleting removes, and asks before doing it', async () => {
    signIn();
    const { user } = renderPanel();
    const region = screen.getByRole('region', { name: 'Delete account' });
    expect(region).toHaveTextContent('removes your email address and the copy of your progress');
    expect(within(region).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(within(region).queryByRole('button', { name: 'Delete my account' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete account…' }));
    expect(screen.getByRole('heading', { name: `Delete the account for ${EMAIL}?` })).toHaveFocus();
    const choice = screen.getByRole('group', { name: 'Your progress on this device' });
    expect(within(choice).getByRole('radio', { name: /Keep it on this device/ })).toBeChecked();
    // Cancel comes before the irreversible button, which is last.
    const buttons = within(region)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(['Cancel', 'Delete my account']);
    expect(region).toHaveTextContent(
      'Amazon SES, which sends the sign-in emails, keeps the address',
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete account…' })).toHaveFocus();
    expect(loadAccount()).not.toBeNull();
  });

  it('keeps this device’s progress by default, and says the account is gone', async () => {
    signIn();
    const { deps, flow } = fakeDeletion();
    const { user } = renderPanel(flow);
    await user.click(screen.getByRole('button', { name: 'Delete account…' }));
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByRole('heading', { name: 'Account deleted' })).toHaveFocus();
    expect(panel()).toHaveTextContent('Your progress is still here on this device');
    expect(deps.stopSync).toHaveBeenCalled();
    expect(deps.clearLocal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('manage-account')).toBeNull();
  });

  it('clears this device when asked, then offers to start again', async () => {
    signIn();
    const { deps, flow } = fakeDeletion();
    const { user, restart } = renderPanel(flow);
    await user.click(screen.getByRole('button', { name: 'Delete account…' }));
    await user.click(screen.getByRole('radio', { name: /Delete it from this device too/ }));
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText(/The progress on this device is deleted too/)).toBeVisible();
    expect(deps.clearLocal).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(restart).toHaveBeenCalled();
  });

  it('exports a backup from the confirm step, and says if that failed', async () => {
    signIn();
    const exportBackup = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('f.json')
      .mockRejectedValueOnce(new Error('blocked'));
    const { user } = renderPanel(undefined, exportBackup);
    await user.click(screen.getByRole('button', { name: 'Delete account…' }));
    await user.click(screen.getByRole('button', { name: 'Export a backup' }));
    expect(await screen.findByText(/Backup saved/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Export a backup' }));
    expect(await screen.findByText('Couldn’t save the backup. Try again.')).toBeVisible();
    expect(loadAccount()).not.toBeNull();
  });

  it('shows the delete in flight, and why it hasn’t finished', async () => {
    signIn();
    const { flow } = fakeDeletion(async () => {
      throw new AccountApiError('network');
    });
    const { user } = renderPanel(flow);
    await user.click(screen.getByRole('button', { name: 'Delete account…' }));
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('heading', { name: 'Deleting the account' })).toHaveFocus();
    expect(await screen.findByText(/You’re offline/)).toBeVisible();
    expect(panel()).toHaveTextContent(`${EMAIL} is signed out on this device already`);
  });

  it('carries on with a delete from before a reload', async () => {
    saveDeletion({ email: EMAIL, tokens: LIVE, keepLocal: true, requestedAt: Date.now() });
    let release!: () => void;
    const { deps, flow } = fakeDeletion(() => new Promise((r) => (release = r)));
    renderPanel(flow);
    expect(screen.getByRole('heading', { name: 'Deleting the account' })).toBeVisible();
    expect(screen.getByTestId('deletion-status')).toHaveTextContent('Deleting your email address');
    await vi.waitFor(() => expect(deps.deleteAccount).toHaveBeenCalledWith('access'));
    await act(async () => release());
    expect(await screen.findByRole('heading', { name: 'Account deleted' })).toBeVisible();
    expect(loadDeletion()).toBeNull();
  });

  it('says the account is gone when Cognito no longer knows the sign-in', async () => {
    saveDeletion({
      email: EMAIL,
      tokens: { ...TOKENS, expiresAt: 0 },
      keepLocal: true,
      requestedAt: Date.now(),
    });
    const { deps, flow } = fakeDeletion();
    deps.cognito = async () => ({
      begin: vi.fn(),
      answer: vi.fn(),
      revoke: vi.fn(),
      refresh: async () => {
        throw new AccountApiError('NotAuthorizedException');
      },
    });
    const { user } = renderPanel(flow);
    expect(await screen.findByRole('heading', { name: 'Account deleted' })).toBeVisible();
    expect(panel()).toHaveTextContent('Your account is gone from FretFree’s server');
    expect(panel()).toHaveTextContent('If the account ever shows up again');
    expect(panel()).toHaveTextContent('Your progress is still here on this device');
    expect(deps.clearLocal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('manage-account')).toBeNull();
  });
});

describe('viewOf', () => {
  it('shows a finished delete first, then one in flight, then the offer', () => {
    expect(
      viewOf({ phase: 'deleted', email: EMAIL, keepLocal: true, confirmed: true }, null, EMAIL),
    ).toEqual({ kind: 'deleted', keepLocal: true, confirmed: true });
    expect(viewOf({ phase: 'idle' }, EMAIL, null)).toMatchObject({ kind: 'deleting' });
    expect(viewOf({ phase: 'idle' }, null, EMAIL)).toEqual({ kind: 'signed-in', email: EMAIL });
    expect(viewOf({ phase: 'idle' }, null, null)).toBeNull();
  });
});
