import { vi } from 'vitest';
import type { AccountApi, StartResult } from './api';
import type { AnswerResult, Challenge, Cognito, Tokens } from './cognito';
import { createSignIn, type SignIn } from './flow';

export const TOKENS: Tokens = {
  idToken: 'id',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 0,
};

/**
 * A fake server for the sign-in flow: `code` signs in, `token` signs in by
 * link, anything else is wrong. Sessions allow 3 answers, as Cognito's do.
 */
export function fakeServer(opts: { code?: string; token?: string; start?: StartResult } = {}) {
  const code = opts.code ?? '123456';
  const token = opts.token ?? 'link-token';
  let sessions = 0;
  const answersIn = new Map<string, number>();
  const api: AccountApi = {
    config: vi.fn(async () => ({ region: 'us-east-1', userPoolId: 'p', userPoolClientId: 'c' })),
    start: vi.fn(async () => opts.start ?? { kind: 'sent' as const, expiresIn: 900 }),
  };
  const cognito: Cognito = {
    begin: vi.fn(async (email: string): Promise<Challenge> => {
      const session = `s${++sessions}`;
      answersIn.set(session, 0);
      return { session, username: email };
    }),
    answer: vi.fn(async (c: Challenge, answer: string): Promise<AnswerResult> => {
      if (answer === code || answer === token) return { kind: 'signed-in', tokens: TOKENS };
      const n = (answersIn.get(c.session) ?? 0) + 1;
      answersIn.set(c.session, n);
      return n >= 3 ? { kind: 'failed' } : { kind: 'retry', challenge: c };
    }),
    refresh: vi.fn(async () => ({ idToken: 'id2', accessToken: 'access2', expiresAt: 0 })),
    revoke: vi.fn(async () => undefined),
  };
  return { api, cognito };
}

/** A sign-in flow against `fakeServer`, on a clock the test moves. */
export function fakeSignIn(server = fakeServer(), clock = { now: 1_800_000_000_000 }): SignIn {
  return createSignIn({
    api: server.api,
    cognito: async () => server.cognito,
    now: () => clock.now,
  });
}
