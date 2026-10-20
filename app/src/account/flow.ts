import { AccountApiError, type AccountApi } from './api';
import type { Challenge, Cognito } from './cognito';
import { SIGN_IN_LIMITS } from './limits';
import {
  loadAccount,
  loadPending,
  saveAccount,
  savePending,
  type Account,
  type PendingSignIn,
} from './store';

// The server's own check (infra/lambda/auth/secrets.ts): one @, no spaces, a dot in the domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed, or null when it isn't an email address. */
export function normaliseEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** The 6 digits of a typed code (spaces and dashes allowed), or null. */
export function normaliseCode(input: string): string | null {
  const code = input.replace(/[\s-]+/g, '');
  return new RegExp(`^\\d{${SIGN_IN_LIMITS.codeDigits}}$`).test(code) ? code : null;
}

/** Whole seconds before another email can be sent, from the last send. */
export function cooldownLeft(pending: PendingSignIn | null, now: number): number {
  if (!pending) return 0;
  const ends = pending.sentAt + SIGN_IN_LIMITS.resendCooldownSeconds * 1000;
  return Math.max(0, Math.ceil((ends - now) / 1000));
}

/** Network and server trouble, apart from what the learner can fix. */
export type Trouble = 'offline' | 'server';

export type StartOutcome =
  | { kind: 'sent'; pending: PendingSignIn }
  | { kind: 'invalid-email' }
  | { kind: 'rate-limited'; retryAfter: number }
  | { kind: 'error'; trouble: Trouble };

export type CodeOutcome =
  | { kind: 'signed-in'; account: Account }
  /** Not 6 digits: nothing was sent and no attempt was spent. */
  | { kind: 'invalid-code' }
  /** Didn't match: a typo, or a code already used or replaced by a newer email. */
  | { kind: 'wrong'; attemptsLeft: number }
  /** Every code attempt for this email is spent. The emailed link still works. */
  | { kind: 'too-many' }
  | { kind: 'expired' }
  /** No email is waiting for a code. */
  | { kind: 'no-pending' }
  | { kind: 'error'; trouble: Trouble };

export type LinkOutcome =
  | { kind: 'signed-in'; account: Account }
  /** Used already, expired, or replaced by a newer email. The server doesn't say which. */
  | { kind: 'link-failed' }
  | { kind: 'error'; trouble: Trouble };

export interface SignInDeps {
  api: AccountApi;
  /** The Cognito client, once `GET /config` has said which pool to use. */
  cognito(): Promise<Cognito>;
  /** Epoch ms. */
  now(): number;
}

export interface SignIn {
  start(email: string): Promise<StartOutcome>;
  submitCode(code: string): Promise<CodeOutcome>;
  /** Answers with the token from an emailed link. Spends no code attempt. */
  verifyLink(email: string, token: string): Promise<LinkOutcome>;
  /** Back to the email step, keeping nothing of the pending sign-in. */
  cancel(): void;
  /** Signs out on this device. Local progress stays exactly as it is. */
  signOut(): Promise<void>;
  /** A current access token for the sync API, refreshed when it is about to expire. */
  accessToken(): Promise<string | null>;
}

const trouble = (error: unknown): Trouble =>
  error instanceof AccountApiError && error.message === 'network' ? 'offline' : 'server';

/** Refresh an access token this long before it expires. */
const REFRESH_EARLY_MS = 60_000;

/**
 * The sign-in flow (M7-04): `POST /auth/start` emails a code and a link, then
 * one Cognito custom-auth session answers with either. A session allows 3
 * answers and then fails; the next code answer opens a new one, up to the
 * email's 5 code answers (limits.ts).
 */
export function createSignIn(deps: SignInDeps): SignIn {
  // In memory: a session lasts minutes, and a new one is one request away.
  let live: { challenge: Challenge; openedAt: number; answers: number } | null = null;

  const signedIn = (email: string, tokens: Account['tokens']): Account => {
    const account = { email, tokens, signedInAt: deps.now() };
    saveAccount(account);
    savePending(null);
    live = null;
    return account;
  };

  async function openSession(cognito: Cognito, email: string) {
    const fresh =
      live &&
      live.answers < SIGN_IN_LIMITS.answersPerSession &&
      deps.now() - live.openedAt < SIGN_IN_LIMITS.sessionSeconds * 1000;
    if (!fresh) live = { challenge: await cognito.begin(email), openedAt: deps.now(), answers: 0 };
    return live!;
  }

  return {
    async start(input) {
      const email = normaliseEmail(input);
      if (!email) return { kind: 'invalid-email' };
      try {
        const res = await deps.api.start(email);
        if (res.kind !== 'sent') return res;
        const sentAt = deps.now();
        const ttl = res.expiresIn > 0 ? res.expiresIn : SIGN_IN_LIMITS.defaultTtlSeconds;
        const pending = { email, sentAt, expiresAt: sentAt + ttl * 1000, codeAnswers: 0 };
        savePending(pending);
        live = null;
        return { kind: 'sent', pending };
      } catch (error) {
        return { kind: 'error', trouble: trouble(error) };
      }
    },

    async submitCode(input) {
      const pending = loadPending();
      if (!pending) return { kind: 'no-pending' };
      if (deps.now() >= pending.expiresAt) return { kind: 'expired' };
      if (pending.codeAnswers >= SIGN_IN_LIMITS.codeAnswersPerEmail) return { kind: 'too-many' };
      const code = normaliseCode(input);
      if (!code) return { kind: 'invalid-code' };
      try {
        const cognito = await deps.cognito();
        const codeAnswers = pending.codeAnswers + 1;
        for (let tries = 0; ; tries++) {
          const session = await openSession(cognito, pending.email);
          // Counted before it is sent, as the server counts it.
          if (tries === 0) savePending({ ...pending, codeAnswers });
          session.answers++;
          const res = await cognito.answer(session.challenge, code);
          if (res.kind === 'signed-in')
            return { kind: 'signed-in', account: signedIn(pending.email, res.tokens) };
          if (res.kind === 'retry') session.challenge = res.challenge;
          else live = null;
          // An expired session never checked the code, so ask once more in a new one.
          if (res.kind === 'session-expired' && tries === 0) continue;
          break;
        }
        const attemptsLeft = SIGN_IN_LIMITS.codeAnswersPerEmail - codeAnswers;
        return attemptsLeft > 0 ? { kind: 'wrong', attemptsLeft } : { kind: 'too-many' };
      } catch (error) {
        return { kind: 'error', trouble: trouble(error) };
      }
    },

    async verifyLink(input, token) {
      const email = normaliseEmail(input);
      if (!email || !token) return { kind: 'link-failed' };
      try {
        const cognito = await deps.cognito();
        const challenge = await cognito.begin(email);
        const res = await cognito.answer(challenge, token);
        return res.kind === 'signed-in'
          ? { kind: 'signed-in', account: signedIn(email, res.tokens) }
          : { kind: 'link-failed' };
      } catch (error) {
        return { kind: 'error', trouble: trouble(error) };
      }
    },

    cancel() {
      savePending(null);
      live = null;
    },

    async signOut() {
      const account = loadAccount();
      saveAccount(null);
      savePending(null);
      live = null;
      // Best effort: the tokens are gone from this device either way.
      if (account?.tokens.refreshToken) {
        await deps
          .cognito()
          .then((c) => c.revoke(account.tokens.refreshToken))
          .catch(() => undefined);
      }
    },

    async accessToken() {
      const account = loadAccount();
      if (!account) return null;
      if (account.tokens.expiresAt - REFRESH_EARLY_MS > deps.now())
        return account.tokens.accessToken;
      const cognito = await deps.cognito();
      const fresh = await cognito.refresh(account.tokens.refreshToken);
      // Signed out (or in as someone else) while the refresh was in flight: keep that.
      if (loadAccount()?.email !== account.email) return null;
      saveAccount({ ...account, tokens: { ...account.tokens, ...fresh } });
      return fresh.accessToken;
    },
  };
}
