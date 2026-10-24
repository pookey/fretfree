import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ScreenLayout } from '../shell/ScreenLayout';
import { AccountPanel } from './AccountPanel';
import { getSignIn } from './client';
import { linkError } from './copy';
import type { LinkOutcome, SignIn } from './flow';
import { loadDeletion } from './store';
import styles from './account.module.css';

/** The address and token from an emailed link's fragment (`#email=…&token=…`). */
export function readLinkFragment(hash: string): { email: string; token: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const email = params.get('email');
  const token = params.get('token');
  return email && token ? { email, token } : null;
}

// One answer per token, however often the screen mounts (StrictMode mounts twice).
const answers = new Map<string, Promise<LinkOutcome>>();

type View =
  | { kind: 'checking' }
  | { kind: 'incomplete' }
  | { kind: 'unavailable' }
  /** An account delete is still waiting for the server: no signing in until it ends. */
  | { kind: 'deleting' }
  | LinkOutcome;

/**
 * `/account/verify` (M7-04): where an emailed sign-in link lands. It signs in
 * the browser the link opened in. The token is read from the fragment, which
 * never reaches a server log, and wiped from the address bar and history at
 * once.
 */
export function VerifyScreen({ signIn = getSignIn() }: { signIn?: SignIn | null }) {
  const [link, setLink] = useState(() => readLinkFragment(location.hash));
  const [view, setView] = useState<View>(() =>
    !signIn
      ? { kind: 'unavailable' }
      : loadDeletion()
        ? { kind: 'deleting' }
        : link
          ? { kind: 'checking' }
          : { kind: 'incomplete' },
  );
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (location.hash) history.replaceState(history.state, '', location.pathname);
    // The link isn't answered, so it still works once the delete is done.
    if (!link || !signIn || loadDeletion()) return;
    let live = true;
    let answer = answers.get(link.token);
    if (!answer) {
      answer = signIn.verifyLink(link.email, link.token);
      answers.set(link.token, answer);
    }
    void answer.then((outcome) => {
      // Network trouble checked nothing, so a retry may answer again.
      if (outcome.kind === 'error') answers.delete(link.token);
      if (live) setView(outcome);
    });
    return () => {
      live = false;
    };
  }, [link, signIn, attempt]);

  // A second link opened in the same tab changes only the fragment, so the screen stays mounted.
  useEffect(() => {
    const onHashChange = () => {
      const next = readLinkFragment(location.hash);
      if (!next || !signIn) return;
      setLink(next);
      setView(loadDeletion() ? { kind: 'deleting' } : { kind: 'checking' });
    };
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, [signIn]);

  useEffect(() => {
    if (view.kind !== 'checking') headingRef.current?.focus();
  }, [view.kind]);

  const heading =
    view.kind === 'checking'
      ? 'Signing you in…'
      : view.kind === 'signed-in'
        ? 'You’re signed in'
        : view.kind === 'incomplete'
          ? 'This link is incomplete'
          : view.kind === 'unavailable'
            ? 'Sign-in isn’t available here'
            : view.kind === 'deleting'
              ? 'Your account is being deleted'
              : 'That link didn’t work';

  return (
    <ScreenLayout title="Sign in">
      <div className={styles.verify}>
        <div className={styles.panel}>
          <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
            {heading}
          </h2>
          <div className={styles.copy} role="status">
            {view.kind === 'checking' && <p>Checking your sign-in link.</p>}
            {view.kind === 'signed-in' && (
              <>
                <p>
                  This browser is signed in as{' '}
                  <strong className={styles.email}>{view.account.email}</strong>.
                </p>
                <p className={styles.muted}>
                  Each email works once. To sign in to FretFree on your Home Screen, open it there,
                  send yourself a new email from Progress and type its code.
                </p>
                <p>
                  <Link to="/" className={styles.primary}>
                    Go to Today
                  </Link>
                </p>
              </>
            )}
            {view.kind === 'incomplete' && (
              <p>
                Part of the sign-in link is missing. Open it straight from the email, or send
                yourself a new one below.
              </p>
            )}
            {view.kind === 'unavailable' && (
              <p>
                This copy of FretFree has no account server. Everything still works on this device.
              </p>
            )}
            {view.kind === 'deleting' && (
              <>
                <p>
                  FretFree is still deleting an account on this device, so this link hasn&rsquo;t
                  signed you in. Once the delete has finished (Progress shows it), open the link
                  from the email again.
                </p>
                <p>
                  <Link to="/progress" className={styles.primary}>
                    Go to Progress
                  </Link>
                </p>
              </>
            )}
            {(view.kind === 'link-failed' || view.kind === 'error') && <p>{linkError(view)}</p>}
          </div>
          {view.kind === 'error' && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setView({ kind: 'checking' });
                setAttempt((a) => a + 1);
              }}
            >
              Try again
            </button>
          )}
        </div>
        {(view.kind === 'incomplete' || view.kind === 'link-failed') && (
          <AccountPanel signIn={signIn} email={link?.email} />
        )}
      </div>
    </ScreenLayout>
  );
}
