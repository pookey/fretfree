import type { CodeOutcome, LinkOutcome, StartOutcome, Trouble } from './flow';
import { SIGN_IN_LIMITS } from './limits';

const TROUBLE: Record<Trouble, string> = {
  offline: 'Couldn’t reach FretFree. Check you’re online, then try again.',
  server: 'Something went wrong on our side. Try again in a minute.',
};

/** "45 seconds", "60 seconds", "2 minutes": seconds up to a minute, for countdowns. */
export function waitFor(seconds: number): string {
  if (seconds <= 60) return seconds === 1 ? '1 second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** What to tell the learner when sending the email didn't work, or null when it did. */
export function startError(outcome: StartOutcome): string | null {
  switch (outcome.kind) {
    case 'sent':
      return null;
    case 'invalid-email':
      return 'That doesn’t look like an email address. Check it and try again.';
    case 'rate-limited':
      return `That’s a lot of emails for one address. Try again in ${waitFor(outcome.retryAfter)}.`;
    case 'error':
      return TROUBLE[outcome.trouble];
  }
}

const minutes = Math.round(SIGN_IN_LIMITS.defaultTtlSeconds / 60);

/** What to tell the learner when a code didn't sign them in, or null when it did. */
export function codeError(outcome: CodeOutcome): string | null {
  switch (outcome.kind) {
    case 'signed-in':
      return null;
    case 'invalid-code':
      return `Type the ${SIGN_IN_LIMITS.codeDigits}-digit code from the email.`;
    case 'wrong':
      return (
        'That code didn’t work. Check it against the newest email: each code works once, ' +
        `and a new email replaces the last one. ${
          outcome.attemptsLeft === 1 ? '1 try' : `${outcome.attemptsLeft} tries`
        } left.`
      );
    case 'too-many':
      return 'That’s too many tries for this code. Open the link in the same email instead, or send a new email.';
    case 'expired':
      return `That code has expired: codes last ${minutes} minutes. Send a new email for a fresh one.`;
    case 'no-pending':
      return 'Send yourself an email first, then type its code here.';
    case 'error':
      return TROUBLE[outcome.trouble];
  }
}

/** What to tell the learner when an emailed link didn't sign them in, or null when it did. */
export function linkError(outcome: LinkOutcome): string | null {
  switch (outcome.kind) {
    case 'signed-in':
      return null;
    case 'link-failed':
      return (
        'This link has already been used or has expired. Each link works once, lasts ' +
        `${minutes} minutes, and a newer email replaces it. Send yourself a new one below.`
      );
    case 'error':
      return TROUBLE[outcome.trouble];
  }
}
