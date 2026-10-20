import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { SIGN_IN } from './config';

/** A pending sign-in, as stored. Only hashes of the code and link token are kept. */
export interface PendingSignIn {
  codeHash: string;
  linkHash: string;
  /** Per-issue salt; also identifies this issue, so a used one can't be consumed twice. */
  salt: string;
  /** Epoch seconds. Also the DynamoDB TTL attribute. */
  expiresAt: number;
  /** Epoch seconds. */
  sentAt: number;
  /** Answers counted against this issue so far. */
  attempts: number;
}

export interface SecretSource {
  code(): string;
  token(): string;
  salt(): string;
}

export const cryptoSecrets: SecretSource = {
  code: () => String(randomInt(0, 10 ** SIGN_IN.codeDigits)).padStart(SIGN_IN.codeDigits, '0'),
  token: () => randomBytes(32).toString('base64url'),
  salt: () => randomBytes(16).toString('base64url'),
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const hashSecret = (salt: string, secret: string): string => sha256(`${salt}:${secret}`);

/** A fresh code and link token, and the record that verifies them. `now` is epoch seconds. */
export function issue(
  now: number,
  secrets: SecretSource = cryptoSecrets,
): { code: string; token: string; record: PendingSignIn } {
  const code = secrets.code();
  const token = secrets.token();
  const salt = secrets.salt();
  return {
    code,
    token,
    record: {
      codeHash: hashSecret(salt, code),
      linkHash: hashSecret(salt, token),
      salt,
      expiresAt: now + SIGN_IN.ttlSeconds,
      sentAt: now,
      attempts: 0,
    },
  };
}

const CODE = new RegExp(`^\\d{${SIGN_IN.codeDigits}}$`);

/** True when `answer` is this issue's code (spaces allowed) or its link token. */
export function answerMatches(record: PendingSignIn, answer: string): boolean {
  const compact = answer.replace(/\s+/g, '');
  const expected = CODE.test(compact) ? record.codeHash : record.linkHash;
  const actual = hashSecret(record.salt, compact);
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

// Deliberately loose: one @, no spaces, a dot in the domain. SES rejects the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed, or null when it isn't an email address. */
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** Store keys never hold an address in the clear. */
export const emailKey = (email: string): string => `signin#${sha256(email)}`;
export const rateKey = (kind: 'email' | 'ip', value: string, window: number): string =>
  `rate#${kind}#${sha256(value)}#${window}`;
