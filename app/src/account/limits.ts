/**
 * The sign-in limits the app works within. The server enforces them
 * (infra/lambda/auth/config.ts); the app mirrors them so it can explain a
 * failure before the server has to, and never sends a request that must fail.
 */
export const SIGN_IN_LIMITS = {
  codeDigits: 6,
  /** Code answers one email allows, across every Cognito session. Link answers spend none. */
  codeAnswersPerEmail: 5,
  /** Answers one Cognito auth session allows before it fails. */
  answersPerSession: 3,
  /** Cognito's auth session lifetime (the app client's `authSessionValidity`). */
  sessionSeconds: 15 * 60,
  /** A second email to the same address waits this long. */
  resendCooldownSeconds: 60,
  /** How long a code stays valid when the server doesn't say. */
  defaultTtlSeconds: 15 * 60,
} as const;

/** Completed sessions before Today offers to save progress (design §1 principle 8: never a gate). */
export const OFFER_AFTER_SESSIONS = 3;
