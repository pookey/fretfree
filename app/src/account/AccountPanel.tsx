import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link } from 'react-router';
import { getSignIn } from './client';
import { codeError, startError, waitFor } from './copy';
import { cooldownLeft, type SignIn } from './flow';
import { useAccount, useNow, usePending } from './hooks';
import { SIGN_IN_LIMITS } from './limits';
import type { PendingSignIn } from './store';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../storage/sync/engine';
import styles from './account.module.css';

/** The anchor Today's offer links to (`/progress#account`). */
export const ACCOUNT_ANCHOR = 'account';

export interface AccountPanelProps {
  /** Injected in tests; defaults to this build's flow (null when accounts are off). */
  signIn?: SignIn | null;
  /** Prefills the email step, e.g. after a link that didn't work. */
  email?: string;
}

/** Where focus goes after the panel changes step, so it is never dropped on the page. */
type FocusTarget = 'email' | 'code' | 'heading' | null;

/**
 * "Save your progress across devices" (M7-04): optional email sign-in, never a
 * gate (design §1 principle 8). An email carries a 6-digit code and a link.
 * The code is the way into the installed iPad app, whose storage is separate
 * from Safari's, so links (which open in Safari) can't sign it in.
 */
export function AccountPanel({ signIn = getSignIn(), email }: AccountPanelProps) {
  const account = useAccount();
  const pending = usePending();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Only a step the learner just moved to takes focus: opening Progress with a
  // code pending mustn't raise the keyboard.
  const [focus, setFocus] = useState<FocusTarget>(null);
  useEffect(() => {
    if (focus === 'heading') headingRef.current?.focus();
  }, [focus, account]);
  if (!signIn) return null;

  return (
    <section id={ACCOUNT_ANCHOR} className={styles.panel} aria-labelledby={headingId}>
      {account ? (
        <>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
            Your account
          </h2>
          <SignedIn email={account.email} signIn={signIn} onSignedOut={() => setFocus('heading')} />
        </>
      ) : (
        <>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
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
              <CodeStep
                pending={pending}
                signIn={signIn}
                autoFocus={focus === 'code'}
                onCancel={() => setFocus('email')}
                onSignedIn={() => setFocus('heading')}
              />
            ) : (
              <EmailStep
                signIn={signIn}
                email={email}
                autoFocus={focus === 'email'}
                onSent={() => setFocus('code')}
              />
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
  onSent,
}: {
  signIn: SignIn;
  email?: string;
  autoFocus: boolean;
  onSent(): void;
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
    if (outcome.kind === 'sent') onSent();
    else inputRef.current?.focus();
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

function CodeStep({
  pending,
  signIn,
  autoFocus,
  onCancel,
  onSignedIn,
}: {
  pending: PendingSignIn;
  signIn: SignIn;
  autoFocus: boolean;
  onCancel(): void;
  onSignedIn(): void;
}) {
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

  // Just sent: put the learner straight in the code field.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('code');
    setError(null);
    setSent(false);
    const outcome = await signIn.submitCode(code);
    if (outcome.kind === 'signed-in') return onSignedIn();
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
          onClick={() => {
            signIn.cancel();
            onCancel();
          }}
          disabled={busy !== null}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}

function SignedIn({
  email,
  signIn,
  onSignedOut,
}: {
  email: string;
  signIn: SignIn;
  onSignedOut(): void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.columns}>
      <div className={styles.copy}>
        <p role="status">
          Signed in as <strong className={styles.email}>{email}</strong>.
        </p>
        <SyncStatusLine />
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
            onSignedOut();
            await signIn.signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** How long ago, in words: "just now", "5 minutes ago", "on 20 Oct". */
export function syncedAgo(at: Date, now: number): string {
  const minutes = Math.floor((now - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** The sync status line (M7-05): when progress last synced, or why it can't now. */
export function syncStatusText({ phase, lastSyncedAt }: SyncStatus, now: number): string {
  const last = lastSyncedAt ? `Last synced ${syncedAgo(lastSyncedAt, now)}.` : '';
  switch (phase) {
    case 'synced':
      return last || 'Synced.';
    case 'offline':
      return `Offline. Your progress is saved on this device and syncs when you’re back online. ${last}`.trim();
    case 'error':
      return `Couldn’t sync just now. FretFree will try again soon. ${last}`.trim();
    case 'syncing':
      return last ? `${last} Syncing…` : 'Syncing your progress…';
    default:
      // Not running (its code didn't load): no line rather than a false "Syncing".
      return '';
  }
}

function SyncStatusLine() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  // "5 minutes ago" moves on while the panel is open.
  const now = useNow(true);
  const text = syncStatusText(status, now);
  if (!text) return null;
  return (
    <p role="status" className={styles.muted} data-testid="sync-status">
      {text}
    </p>
  );
}
