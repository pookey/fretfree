import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AccountApiError } from './api';
import type { SignIn } from './flow';
import { loadAccount, saveAccount, savePending } from './store';
import { fakeServer, fakeSignIn } from './test-fakes';
import { readLinkFragment, VerifyScreen } from './VerifyScreen';

afterEach(() => {
  saveAccount(null);
  savePending(null);
  localStorage.clear();
  history.replaceState(null, '', '/');
});

function open(hash: string, signIn: SignIn | null = fakeSignIn()) {
  history.replaceState(null, '', `/account/verify${hash}`);
  render(
    <MemoryRouter>
      <VerifyScreen signIn={signIn} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const LINK = '#email=me%40example.com&token=link-token';

describe('readLinkFragment', () => {
  it('reads the address and token, and nothing less', () => {
    expect(readLinkFragment(LINK)).toEqual({ email: 'me@example.com', token: 'link-token' });
    expect(readLinkFragment('#email=me%40example.com')).toBeNull();
    expect(readLinkFragment('')).toBeNull();
  });
});

describe('<VerifyScreen>', () => {
  it('signs this browser in and wipes the token from the address bar', async () => {
    open(LINK);
    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/account/verify');
    expect(await screen.findByRole('heading', { name: 'You’re signed in' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'This browser is signed in as me@example.com.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'To sign in to FretFree on your Home Screen',
    );
    expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '/');
    expect(loadAccount()?.email).toBe('me@example.com');
  });

  it('answers once, however often it mounts', async () => {
    const server = fakeServer({ token: 'once-token' });
    const signIn = fakeSignIn(server);
    open('#email=a%40b.co&token=once-token', signIn);
    await screen.findByRole('heading', { name: 'You’re signed in' });
    expect(server.cognito.answer).toHaveBeenCalledTimes(1);
  });

  it('explains a used or expired link and offers a new email, prefilled', async () => {
    open('#email=me%40example.com&token=used');
    expect(await screen.findByRole('heading', { name: 'That link didn’t work' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('already been used or has expired');
    expect(screen.getByLabelText('Email address')).toHaveValue('me@example.com');
    expect(loadAccount()).toBeNull();
  });

  it('explains an incomplete link', async () => {
    open('#email=me%40example.com');
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeVisible();
    expect(screen.getByLabelText('Email address')).toBeVisible();
    expect(location.hash).toBe('');
  });

  it('offers a retry after network trouble', async () => {
    const server = fakeServer({ token: 'retry-token' });
    vi.mocked(server.cognito.begin).mockRejectedValueOnce(new AccountApiError('network'));
    const user = open('#email=a%40b.co&token=retry-token', fakeSignIn(server));
    expect(await screen.findByRole('status')).toHaveTextContent('Check you’re online');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'You’re signed in' })).toBeVisible();
  });

  it('says so when this copy has no accounts', () => {
    open(LINK, null);
    expect(screen.getByRole('heading', { name: 'Sign-in isn’t available here' })).toBeVisible();
    expect(location.hash).toBe('');
  });
});
