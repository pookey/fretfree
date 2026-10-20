import { SIGN_IN_LIMITS } from './limits';

/** `GET /config`: which Cognito pool and client to sign in with. */
export interface AuthConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

export type StartResult =
  | { kind: 'sent'; expiresIn: number }
  | { kind: 'invalid-email' }
  | { kind: 'rate-limited'; retryAfter: number };

/** The network failed or the server answered in a way the app doesn't expect. */
export class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AccountApiError';
  }
}

export interface AccountApi {
  config(): Promise<AuthConfig>;
  /** `POST /auth/start`: emails a sign-in code and link to `email`. */
  start(email: string): Promise<StartResult>;
}

type Fetch = typeof fetch;

async function request(fetchFn: Fetch, url: string, init?: RequestInit): Promise<Response> {
  try {
    // No credentials and no referrer: the API needs neither, and sends nothing back to track.
    return await fetchFn(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new AccountApiError('network');
  }
}

async function body(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await res.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createAccountApi(baseUrl: string, fetchFn: Fetch = fetch): AccountApi {
  let config: Promise<AuthConfig> | undefined;
  return {
    config() {
      config ??= (async () => {
        const res = await request(fetchFn, `${baseUrl}/config`);
        const data = await body(res);
        const { region, userPoolId, userPoolClientId } = data;
        if (
          !res.ok ||
          typeof region !== 'string' ||
          typeof userPoolId !== 'string' ||
          typeof userPoolClientId !== 'string' ||
          !region ||
          !userPoolClientId
        ) {
          throw new AccountApiError('config', res.status);
        }
        return { region, userPoolId, userPoolClientId };
      })();
      // A failed fetch isn't cached, so the next try asks again.
      config.catch(() => (config = undefined));
      return config;
    },

    async start(email) {
      const res = await request(fetchFn, `${baseUrl}/auth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await body(res);
      if (res.status === 202) {
        const expiresIn = typeof data.expiresIn === 'number' ? data.expiresIn : 0;
        return { kind: 'sent', expiresIn };
      }
      if (res.status === 400 && data.error === 'invalid-email') return { kind: 'invalid-email' };
      if (res.status === 429) {
        const header = Number(res.headers.get('retry-after') ?? NaN);
        const retryAfter =
          typeof data.retryAfter === 'number'
            ? data.retryAfter
            : Number.isFinite(header)
              ? header
              : SIGN_IN_LIMITS.resendCooldownSeconds;
        return { kind: 'rate-limited', retryAfter: Math.max(1, Math.ceil(retryAfter)) };
      }
      throw new AccountApiError('start', res.status);
    },
  };
}
