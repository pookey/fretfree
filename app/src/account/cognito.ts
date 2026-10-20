import { AccountApiError, type AuthConfig } from './api';

/** What a successful sign-in or refresh returns. `expiresAt` is epoch ms. */
export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface Challenge {
  session: string;
  /** The username Cognito answers to (the email is only an alias of it). */
  username: string;
}

export type AnswerResult =
  | { kind: 'signed-in'; tokens: Tokens }
  /** Wrong, and the session allows another answer. */
  | { kind: 'retry'; challenge: Challenge }
  /** Wrong, and the session is over: its answers are spent. */
  | { kind: 'failed' }
  /** The session expired before the answer was checked. */
  | { kind: 'session-expired' };

/**
 * The Cognito user-pool calls the app makes, over Cognito's public JSON API,
 * which needs no AWS credentials, only the app client ID. Sign-in is custom
 * auth: `InitiateAuth` opens a session with one challenge ("the code or the
 * link"), and `RespondToAuthChallenge` answers it (infra/lambda/auth/triggers.ts).
 */
export interface Cognito {
  begin(email: string): Promise<Challenge>;
  answer(challenge: Challenge, answer: string): Promise<AnswerResult>;
  refresh(refreshToken: string): Promise<Omit<Tokens, 'refreshToken'>>;
  revoke(refreshToken: string): Promise<void>;
}

interface CognitoError {
  type: string;
  message: string;
}

type Fetch = typeof fetch;

export function createCognito(
  config: AuthConfig,
  now: () => number = Date.now,
  fetchFn: Fetch = fetch,
): Cognito {
  const endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`;
  const clientId = config.userPoolClientId;

  async function call(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: CognitoError }> {
    let res: Response;
    try {
      res = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': `AWSCognitoIdentityProviderService.${action}`,
        },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new AccountApiError('network');
    }
    let data: Record<string, unknown> = {};
    try {
      data = ((await res.json()) as Record<string, unknown> | null) ?? {};
    } catch {
      // An empty body (RevokeToken) or a proxy's error page.
    }
    if (res.ok) return { ok: true, data };
    const rawType = typeof data.__type === 'string' ? data.__type : '';
    const message = typeof data.message === 'string' ? data.message : '';
    // `__type` may carry a namespace prefix: "com.amazonaws…#NotAuthorizedException".
    const type = rawType.slice(rawType.lastIndexOf('#') + 1);
    if (!type) throw new AccountApiError(action, res.status);
    return { ok: false, error: { type, message } };
  }

  const tokensFrom = (data: Record<string, unknown>) => {
    const result = data.AuthenticationResult as Record<string, unknown> | undefined;
    const idToken = result?.IdToken;
    const accessToken = result?.AccessToken;
    const expiresIn = typeof result?.ExpiresIn === 'number' ? result.ExpiresIn : 3600;
    if (typeof idToken !== 'string' || typeof accessToken !== 'string') return null;
    return {
      idToken,
      accessToken,
      refreshToken: typeof result?.RefreshToken === 'string' ? result.RefreshToken : '',
      expiresAt: now() + expiresIn * 1000,
    };
  };

  const challengeFrom = (data: Record<string, unknown>, fallback: string): Challenge | null => {
    const params = data.ChallengeParameters as Record<string, unknown> | undefined;
    if (data.ChallengeName !== 'CUSTOM_CHALLENGE' || typeof data.Session !== 'string') return null;
    return {
      session: data.Session,
      username: typeof params?.USERNAME === 'string' ? params.USERNAME : fallback,
    };
  };

  return {
    async begin(email) {
      const res = await call('InitiateAuth', {
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: clientId,
        AuthParameters: { USERNAME: email },
      });
      const challenge = res.ok ? challengeFrom(res.data, email) : null;
      if (!challenge) throw new AccountApiError(res.ok ? 'begin' : res.error.type);
      return challenge;
    },

    async answer(challenge, answer) {
      const res = await call('RespondToAuthChallenge', {
        ChallengeName: 'CUSTOM_CHALLENGE',
        ClientId: clientId,
        Session: challenge.session,
        ChallengeResponses: { USERNAME: challenge.username, ANSWER: answer },
      });
      if (!res.ok) {
        if (
          res.error.type !== 'NotAuthorizedException' &&
          res.error.type !== 'CodeMismatchException'
        )
          throw new AccountApiError(res.error.type);
        // Cognito says "Invalid session for the user, session is expired." when the
        // answer was never checked; any other refusal means the answer was wrong.
        return /session/i.test(res.error.message) && /expire/i.test(res.error.message)
          ? { kind: 'session-expired' }
          : { kind: 'failed' };
      }
      const tokens = tokensFrom(res.data);
      if (tokens) return { kind: 'signed-in', tokens };
      const next = challengeFrom(res.data, challenge.username);
      if (next) return { kind: 'retry', challenge: next };
      throw new AccountApiError('answer');
    },

    async refresh(refreshToken) {
      const res = await call('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      });
      const tokens = res.ok ? tokensFrom(res.data) : null;
      if (!tokens) throw new AccountApiError(res.ok ? 'refresh' : res.error.type);
      const { idToken, accessToken, expiresAt } = tokens;
      return { idToken, accessToken, expiresAt };
    },

    async revoke(refreshToken) {
      await call('RevokeToken', { ClientId: clientId, Token: refreshToken });
    },
  };
}
