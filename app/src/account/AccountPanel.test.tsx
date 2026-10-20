import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { getDb } from '../storage';
import { AccountPanel } from './AccountPanel';
import type { SignIn } from './flow';
import { loadAccount, saveAccount, savePending } from './store';
import { fakeServer, fakeSignIn, TOKENS } from './test-fakes';

afterEach(() => {
  saveAccount(null);
  savePending(null);
  localStorage.clear();
});

function renderPanel(signIn: SignIn | null = fakeSignIn(fakeServer(), { now: Date.now() })) {
  render(
    <MemoryRouter>
      <AccountPanel signIn={signIn} />
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), signIn };
}

const pendingNow = (over = {}) => ({
  email: 'me@example.com',
  sentAt: Date.now(),
  expiresAt: Date.now() + 900_000,
  codeAnswers: 0,
  ...over,
});

describe('AccountPanel', () => {
  it('renders nothing when this build has no accounts', () => {
    const { container } = render(<AccountPanel signIn={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to save progress, optional and passwordless', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: 'Save your progress across devices' });
    expect(panel).toHaveTextContent('It’s optional: FretFree works fully without an account');
    expect(panel).toHaveTextContent('There’s no password');
    expect(within(panel).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('emails a code, then asks for it, explaining it is the way into the installed app', async () => {
    const { user } = renderPanel();
    await user.type(screen.getByLabelText('Email address'), 'Me@Example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'We sent a code and a link to me@example.com.',
    );
    const code = screen.getByLabelText('6-digit code');
    expect(code).toHaveFocus();
    expect(code).toHaveAccessibleDescription(
      /Using FretFree from your Home Screen\? Type the code here/,
    );
  });

  it('disables sending while the request is in flight', async () => {
    let finish!: () => void;
    const server = fakeServer();
    vi.mocked(server.api.start).mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ kind: 'sent', expiresIn: 900 }))),
    );
    const { user } = renderPanel(fakeSignIn(server, { now: Date.now() }));
    await user.type(screen.getByLabelText('Email address'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible();
  });

  it('explains a bad address and a rate limit', async () => {
    const server = fakeServer();
    vi.mocked(server.api.start).mockResolvedValueOnce({ kind: 'rate-limited', retryAfter: 1800 });
    const { user } = renderPanel(fakeSignIn(server, { now: Date.now() }));
    const email = screen.getByLabelText('Email address');
    await user.type(email, 'nope');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t look like an email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    await user.type(email, '@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 30 minutes');
    expect(screen.getByRole('button', { name: /Email me a code \(30 minutes\)/ })).toBeDisabled();
  });

  it('signs in with the code after a wrong one', async () => {
    savePending(pendingNow());
    const { user } = renderPanel();
    const code = screen.getByLabelText('6-digit code');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('4 tries left');
    await user.clear(code);
    await user.type(code, '123 456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const panel = await screen.findByRole('region', { name: 'Your account' });
    expect(panel).toHaveTextContent('Signed in as me@example.com.');
    expect(loadAccount()?.email).toBe('me@example.com');
  });

  it('points to the link once the code attempts are spent', () => {
    savePending(pendingNow({ codeAnswers: 5 }));
    renderPanel();
    expect(screen.getByLabelText('6-digit code')).toBeDisabled();
    expect(screen.getByLabelText('6-digit code')).toHaveAccessibleDescription(
      /Open the link in the same email instead, or send a new email/,
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('says when the code has expired', () => {
    savePending(pendingNow({ sentAt: Date.now() - 1_000_000, expiresAt: Date.now() - 1 }));
    renderPanel();
    expect(screen.getByText(/That code has expired/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send a new email' })).toBeEnabled();
  });

  it('holds a new email back for the cooldown', async () => {
    savePending(pendingNow());
    renderPanel();
    expect(screen.getByRole('button', { name: /Send a new email \(60 seconds\)/ })).toBeDisabled();
  });

  it('sends a new email once the cooldown is over', async () => {
    savePending(pendingNow({ sentAt: Date.now() - 61_000, codeAnswers: 2 }));
    const server = fakeServer();
    const { user } = renderPanel(fakeSignIn(server, { now: Date.now() }));
    await user.click(screen.getByRole('button', { name: 'Send a new email' }));
    expect(await screen.findByText(/We sent a new email to/)).toBeVisible();
    expect(server.api.start).toHaveBeenCalledWith('me@example.com');
  });

  it('goes back to the email step for a different address', async () => {
    savePending(pendingNow());
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email address')).toBeVisible();
  });

  it('signs out and keeps the progress on this device', async () => {
    const db = getDb();
    await db.reviewLogs.clear();
    await db.reviewLogs.add({ itemId: 'F1.alphabet:A' } as never);
    saveAccount({ email: 'me@example.com', tokens: TOKENS, signedInAt: 1 });
    const { user } = renderPanel();
    expect(screen.getByRole('region', { name: 'Your account' })).toHaveTextContent(
      'Signing out keeps everything on this device',
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('region', { name: 'Save your progress across devices' }),
    ).toBeVisible();
    expect(loadAccount()).toBeNull();
    expect(await db.reviewLogs.count()).toBe(1);
  });
});
