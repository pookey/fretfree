import { json, jsonBody, type HttpEvent, type HttpResult } from '../shared/http';
import { SIGN_IN } from './config';
import { signInEmail, signInLink, type SignInEmail } from './email';
import { emailKey, issue, normaliseEmail, rateKey, type SecretSource } from './secrets';
import type { SignInStore } from './store';

export interface StartDeps {
  store: SignInStore;
  /** Creates the Cognito user for `email` if there isn't one. */
  ensureUser(email: string): Promise<void>;
  sendEmail(to: string, message: SignInEmail): Promise<void>;
  /** Epoch milliseconds. */
  now(): number;
  /** e.g. https://fretfree.app. The link lands on its /account/verify. */
  siteUrl: string;
  brand: string;
  secrets?: SecretSource;
}

/**
 * `POST /auth/start` with `{ email }`: emails a sign-in code and link. The reply
 * is the same whether or not the address already has an account, so it can't be
 * used to find out who has one.
 */
export function createStartHandler(deps: StartDeps): (event: HttpEvent) => Promise<HttpResult> {
  return async (event) => {
    const body = jsonBody(event) as { email?: unknown } | undefined;
    const email = normaliseEmail(body?.email);
    if (!email) return json(400, { error: 'invalid-email' });

    const now = Math.floor(deps.now() / 1000);
    const window = Math.floor(now / SIGN_IN.windowSeconds);
    const windowEnds = (window + 1) * SIGN_IN.windowSeconds;
    const limited = (retryAfter: number) =>
      json(429, { error: 'rate-limited', retryAfter }, { 'retry-after': String(retryAfter) });

    const ip = event.requestContext?.http?.sourceIp ?? 'unknown';
    if (
      (await deps.store.increment(rateKey('ip', ip, window), windowEnds)) >
      SIGN_IN.requestsPerIpPerHour
    ) {
      return limited(windowEnds - now);
    }
    const key = emailKey(email);
    const pending = await deps.store.get(key);
    const cooldownEnds = (pending?.sentAt ?? 0) + SIGN_IN.resendCooldownSeconds;
    if (cooldownEnds > now) return limited(cooldownEnds - now);
    if (
      (await deps.store.increment(rateKey('email', email, window), windowEnds)) >
      SIGN_IN.emailsPerAddressPerHour
    ) {
      return limited(windowEnds - now);
    }

    await deps.ensureUser(email);
    const { code, token, record } = issue(now, deps.secrets);
    await deps.store.put(key, record);
    await deps.sendEmail(
      email,
      signInEmail({
        brand: deps.brand,
        code,
        link: signInLink(deps.siteUrl, email, token),
        minutes: Math.round(SIGN_IN.ttlSeconds / 60),
      }),
    );
    return json(202, { ok: true, expiresIn: SIGN_IN.ttlSeconds });
  };
}
