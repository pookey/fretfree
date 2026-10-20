/**
 * Every limit the sign-in Lambdas enforce. One email carries a 6-digit code and a
 * magic link; both open the same pending sign-in, which is single use.
 */
export const SIGN_IN = {
  codeDigits: 6,
  /** How long an emailed code and link stay valid. */
  ttlSeconds: 15 * 60,
  /** Answers checked against one emailed code, across every Cognito session. */
  maxAttempts: 5,
  /** Answers allowed in one Cognito auth session before it fails. */
  maxAnswersPerSession: 3,
  /** A second email to the same address waits this long. */
  resendCooldownSeconds: 60,
  /** Emails to one address per one-hour window. */
  emailsPerAddressPerHour: 5,
  /** Sign-in requests from one IP per one-hour window. */
  requestsPerIpPerHour: 30,
  /** The fixed rate-limit window. */
  windowSeconds: 60 * 60,
} as const;
