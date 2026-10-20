import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { getSignIn } from './client';
import { codeError, startError, waitFor } from './copy';
import { cooldownLeft, type SignIn } from './flow';
import { useAccount, useNow, usePending } from './hooks';
import { SIGN_IN_LIMITS } from './limits';
import type { PendingSignIn } from './store';
import styles from './account.module.css';

/** The anchor Today's offer links to (`/progress#account`). */
export const ACCOUNT_ANCHOR = 'account';

export interface AccountPanelProps {
  /** Injected in tests; defaults to this build's flow (null when accounts are off). */
  signIn?: SignIn | null;
  /** Prefills the email step, e.g. after a link that didn't work. */
  email?: string;
  /** Focus the first field on mount. */
  autoFocus?: boolean;
}

/**
 * "Save your progress across devices" (M7-04): optional email sign-in, never a
 * gate (design §1 principle 8). An email carries a 6-digit code and a link.
 * The code is the way into the installed iPad app, whose storage is separate
 * from Safari's, so links (which open in Safari) can't sign it in.
 */
export function AccountPanel({ signIn = getSignIn(), email, autoFocus }: AccountPanelProps) {
  const account = useAccount();
  const pending = usePending();
  const headingId = useId();
  if (!signIn) return null;

  return (
    <section id={ACCOUNT_ANCHOR} className={styles.panel} aria-labelledby={headingId}>
      {account ? (
        <>
          <h2 id={headingId} className={styles.title}>
            Your account
          </h2>
          <SignedIn email={account.email} signIn={signIn} />
        </>
      ) : (
        <>
          <h2 id={headingId} className={styles.title}>
            Save your progress across devices
          </h2>
          <div className={styles.columns}>
            <div className={styles.copy}>
              <p>
                Sign in with your email to keep a copy of your progress and carry on from another
                device. It’s optional: FretFree works fully without an account, offline, on this
                device.
              </p>
              <p className={styles.muted}>
                There’s no password. We email you a {SIGN_IN_LIMITS.codeDigits}-digit code and a
                link, and your email is used only to sign you in. <Link to="/privacy">Privacy</Link>
              </p>
            </div>
            {pending ? (
              <CodeStep pending={pending} signIn={signIn} />
            ) : (
              <EmailStep signIn={signIn} email={email} autoFocus={autoFocus} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** A rate limit from the server: no sending until `until`, counted from `at` (epoch ms). */
const NOT_BLOCKED = { until: 0, at: 0 };
function blockFor(seconds: number) {
  const at = Date.now();
  return { until: at + seconds * 1000, at };
}

function EmailStep({
  signIn,
  email: initial = '',
  autoFocus,
}: {
  signIn: SignIn;
  email?: string;
  autoFocus?: boolean;
}) {
  const [email, setEmail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(NOT_BLOCKED);
  // The clock ticks once a second, so never count from before the block began.
  const now = Math.max(useNow(blocked.until > 0), blocked.at);
  const wait = Math.max(0, Math.ceil((blocked.until - now) / 1000));
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (autoFocus || location.hash === `#${ACCOUNT_ANCHOR}`) {
      inputRef.current?.focus({ preventScroll: !autoFocus });
      if (!autoFocus) inputRef.current?.closest('section')?.scrollIntoView?.({ block: 'start' });
    }
  }, [autoFocus]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || wait > 0) return;
    setBusy(true);
    setError(null);
    const outcome = await signIn.start(email);
    setBusy(false);
    if (outcome.kind === 'rate-limited') setBlocked(blockFor(outcome.retryAfter));
    setError(startError(outcome));
    if (outcome.kind !== 'sent') inputRef.current?.focus();
  }

  return (
    <form className={styles.form} onSubmit={send} noValidate>
      <label className={styles.field}>
        <span>Email address</span>
        <input
          ref={inputRef}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button type="submit" className={styles.primary} disabled={busy || wait > 0}>
        {busy ? 'Sending…' : wait > 0 ? `Email me a code (${waitFor(wait)})` : 'Email me a code'}
      </button>
    </form>
  );
}

function CodeStep({ pending, signIn }: { pending: PendingSignIn; signIn: SignIn }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'code' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [blocked, setBlocked] = useState(NOT_BLOCKED);
  const now = Math.max(useNow(true), blocked.at, pending.sentAt);
  const wait = Math.max(cooldownLeft(pending, now), Math.ceil((blocked.until - now) / 1000));
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();
  const hintId = useId();
  const spent = pending.codeAnswers >= SIGN_IN_LIMITS.codeAnswersPerEmail;
  const expired = now >= pending.expiresAt;
  // Shown before any answer, e.g. after a reload: why the code can't be used now.
  const note = spent
    ? codeError({ kind: 'too-many' })
    : expired
      ? codeError({ kind: 'expired' })
      : null;

  // Moving from the email step to here: say so, and put the learner in the code field.
  useEffect(() => {
    inputRef.current?.focus();
  }, [pending.sentAt]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('code');
    setError(null);
    setSent(false);
    const outcome = await signIn.submitCode(code);
    setBusy(null);
    const message = codeError(outcome);
    setError(message);
    if (message) {
      if (outcome.kind === 'wrong' || outcome.kind === 'invalid-code') inputRef.current?.select();
      else headingRef.current?.focus();
    }
  }

  async function resend() {
    if (busy || wait > 0) return;
    setBusy('resend');
    setError(null);
    setSent(false);
    const outcome = await signIn.start(pending.email);
    setBusy(null);
    if (outcome.kind === 'rate-limited') setBlocked(blockFor(outcome.retryAfter));
    setError(startError(outcome));
    if (outcome.kind === 'sent') {
      setCode('');
      setSent(true);
    }
  }

  return (
    <div className={styles.form}>
      <h3 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
        Check your email
      </h3>
      <p role="status" className={styles.status}>
        {sent ? 'We sent a new email to ' : 'We sent a code and a link to '}
        <strong className={styles.email}>{pending.email}</strong>.
      </p>
      <form onSubmit={submit} noValidate className={styles.form}>
        <label className={styles.field}>
          <span>{SIGN_IN_LIMITS.codeDigits}-digit code</span>
          <input
            ref={inputRef}
            className={styles.code}
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={SIGN_IN_LIMITS.codeDigits + 2}
            value={code}
            disabled={spent || expired}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, error || note ? errorId : null].filter(Boolean).join(' ')}
          />
        </label>
        <p id={hintId} className={styles.hint}>
          Using FretFree from your Home Screen? Type the code here: email links open in Safari,
          which keeps a separate copy of FretFree. The link signs in the browser it opens in.
        </p>
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : (
          note && (
            <p id={errorId} className={styles.error}>
              {note}
            </p>
          )
        )}
        <button
          type="submit"
          className={styles.primary}
          disabled={busy !== null || spent || expired}
        >
          {busy === 'code' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={resend}
          disabled={busy !== null || wait > 0}
        >
          {busy === 'resend'
            ? 'Sending…'
            : wait > 0
              ? `Send a new email (${waitFor(wait)})`
              : 'Send a new email'}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => signIn.cancel()}
          disabled={busy !== null}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}

function SignedIn({ email, signIn }: { email: string; signIn: SignIn }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.columns}>
      <div className={styles.copy}>
        <p role="status">
          Signed in as <strong className={styles.email}>{email}</strong>.
        </p>
        <p className={styles.muted}>
          Signing out keeps everything on this device: your progress stays here, just as it was.
        </p>
      </div>
      <div className={styles.form}>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signIn.signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
