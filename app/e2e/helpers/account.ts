import type { Page, Route } from '@playwright/test';

/** The hosted API the app calls unless the build sets VITE_SYNC_API_URL (app/src/account/api.ts). */
export const API_URL = 'https://api.fretfree.app';
export const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';

export const CODE = '424242';
export const LINK_TOKEN = 'e2e-link-token';

export interface MockAuth {
  /** Emails `POST /auth/start` accepted. */
  emails: string[];
  /** Every answer sent to `RespondToAuthChallenge`. */
  answers: string[];
  /** Replies the next `POST /auth/start` with 429 and this wait. */
  rateLimitNext(retryAfter: number): void;
  /** An email sent to `email` from another device or browser: its code and link are live. */
  emailed(email: string): void;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'retry-after',
};

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

/**
 * A fake sign-in server: the M7-02 API (`GET /config`, `POST /auth/start`) and
 * Cognito's JSON endpoint, with its rules. One emailed code and link per
 * address, single use; 3 answers per session; 5 code answers per email, and
 * link answers spend none. No real email is ever sent.
 */
export async function mockAuth(page: Page): Promise<MockAuth> {
  const state: MockAuth & { limitNext: number | null } = {
    emails: [],
    answers: [],
    limitNext: null,
    rateLimitNext(retryAfter) {
      state.limitNext = retryAfter;
    },
    emailed(email) {
      pending.set(email, { used: false, codeAnswers: 0 });
    },
  };
  // One pending sign-in per address, as the server keeps.
  const pending = new Map<string, { used: boolean; codeAnswers: number }>();
  const sessions = new Map<string, { email: string; answers: number }>();
  let nextSession = 0;

  await page.route(`${API_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path === '/config' && req.method() === 'GET') {
      return json(route, 200, {
        region: 'us-east-1',
        userPoolId: 'us-east-1_e2e',
        userPoolClientId: 'e2e-client',
      });
    }
    if (path === '/auth/start' && req.method() === 'POST') {
      const { email } = req.postDataJSON() as { email: string };
      if (state.limitNext !== null) {
        const retryAfter = state.limitNext;
        state.limitNext = null;
        return json(
          route,
          429,
          { error: 'rate-limited', retryAfter },
          {
            'retry-after': String(retryAfter),
          },
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(route, 400, { error: 'invalid-email' });
      }
      state.emails.push(email);
      state.emailed(email);
      return json(route, 202, { ok: true, expiresIn: 900 });
    }
    return json(route, 404, { error: 'not-found' });
  });

  await page.route(COGNITO_URL, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const target = req.headers()['x-amz-target'] ?? '';
    const body = req.postDataJSON() as Record<string, Record<string, string> | string>;
    const fail = (message: string) =>
      json(route, 400, { __type: 'NotAuthorizedException', message });

    if (target.endsWith('.InitiateAuth')) {
      const email = (body.AuthParameters as Record<string, string>).USERNAME!;
      const session = `session-${++nextSession}`;
      sessions.set(session, { email, answers: 0 });
      return json(route, 200, {
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: session,
        ChallengeParameters: { USERNAME: `user-${email}`, method: 'email-code-or-link' },
      });
    }
    if (target.endsWith('.RespondToAuthChallenge')) {
      const session = sessions.get(body.Session as string);
      if (!session) return fail('Invalid session for the user, session is expired.');
      const answer = (body.ChallengeResponses as Record<string, string>).ANSWER!;
      state.answers.push(answer);
      session.answers++;
      const issue = pending.get(session.email);
      const isCode = /^\d{6}$/.test(answer);
      if (issue && isCode) issue.codeAnswers++;
      const correct =
        !!issue &&
        !issue.used &&
        (isCode ? answer === CODE && issue.codeAnswers <= 5 : answer === LINK_TOKEN);
      if (correct) {
        issue.used = true;
        sessions.delete(body.Session as string);
        return json(route, 200, {
          AuthenticationResult: {
            IdToken: 'e2e-id',
            AccessToken: 'e2e-access',
            RefreshToken: 'e2e-refresh',
            ExpiresIn: 3600,
            TokenType: 'Bearer',
          },
          ChallengeParameters: {},
        });
      }
      if (session.answers >= 3) {
        sessions.delete(body.Session as string);
        return fail('Incorrect username or password.');
      }
      return json(route, 200, {
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: body.Session,
        ChallengeParameters: { USERNAME: `user-${session.email}` },
      });
    }
    if (target.endsWith('.RevokeToken')) return json(route, 200, {});
    return json(route, 400, { __type: 'InvalidParameterException', message: target });
  });

  return state;
}

/** Adds `count` finished practice sessions straight to IndexedDB. */
export async function seedFinishedSessions(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('sessionLogs', 'readwrite');
    const store = tx.objectStore('sessionLogs');
    for (let i = 0; i < n; i++) {
      const startedAt = new Date(Date.now() - (i + 1) * 86_400_000);
      store.add({
        startedAt,
        endedAt: new Date(startedAt.getTime() + 600_000),
        itemsSeen: 20,
        accuracy: 0.85,
        uid: `e2e-session-${i}`,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, count);
}
