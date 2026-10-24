import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { getAccountDeletion } from './delete-client';
import type { AccountDeletionFlow, DeletionStatus } from './delete';
import { useAccount } from './hooks';
import { loadDeletion, subscribe } from './store';
import { getDb } from '../storage';
import { downloadExport } from '../storage/download-export';
import styles from './account.module.css';
import manage from './manage.module.css';

export interface ManageAccountProps {
  /** Injected in tests; defaults to this build's deletion (null when accounts are off). */
  deletion?: AccountDeletionFlow | null;
  /** Downloads a backup of this device's progress. */
  exportBackup?: () => Promise<unknown>;
  /** Reloads FretFree from the start, after this device's progress is deleted. */
  restart?: () => void;
}

/**
 * Deleting the account (M7-06): the server copy and the email go for good,
 * and the learner chooses whether this device's progress goes too. Export
 * stays one tap away, signed in or not.
 */
export function ManageAccount({
  deletion = getAccountDeletion(),
  exportBackup = () => downloadExport(getDb()),
  restart = () => location.replace('/'),
}: ManageAccountProps) {
  if (!deletion) return null;
  return <Manage deletion={deletion} exportBackup={exportBackup} restart={restart} />;
}

function Manage({
  deletion,
  exportBackup,
  restart,
}: {
  deletion: AccountDeletionFlow;
  exportBackup: () => Promise<unknown>;
  restart: () => void;
}) {
  const account = useAccount();
  const pending = useSyncExternalStore(subscribe, loadDeletion, () => null);
  const status = useSyncExternalStore(deletion.subscribe, deletion.status);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [moved, setMoved] = useState(false);

  // A delete from before a reload, or from another tab, carries on here.
  useEffect(() => {
    if (pending) void deletion.resume();
  }, [pending, deletion]);

  // Each step after the learner acts takes focus, so it is never dropped on the page.
  useEffect(() => {
    if (moved) headingRef.current?.focus();
  }, [moved, status.phase]);

  const view = viewOf(status, pending?.email ?? null, account?.email ?? null);
  if (!view) return null;

  const heading = (text: string) => (
    <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
      {text}
    </h2>
  );

  return (
    <section className={styles.panel} aria-labelledby={headingId} data-testid="manage-account">
      {view.kind === 'signed-in' && (
        <>
          {heading('Delete account')}
          <DeleteStep
            email={view.email}
            exportBackup={exportBackup}
            onDelete={(keepLocal) => {
              setMoved(true);
              void deletion.request(keepLocal);
            }}
          />
        </>
      )}
      {view.kind === 'deleting' && (
        <>
          {heading('Deleting the account')}
          <Deleting status={view.status} email={view.email} />
        </>
      )}
      {view.kind === 'deleted' && (
        <>
          {heading('Account deleted')}
          <div className={styles.copy}>
            <p role="status">
              Your email address and the copy of your progress are gone from FretFree&rsquo;s
              server.{' '}
              {view.keepLocal
                ? 'Your progress is still here on this device, and FretFree works just as before, without an account.'
                : 'The progress on this device is deleted too, so FretFree will start again from the beginning.'}
            </p>
            <div className={styles.actions}>
              {view.keepLocal ? (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => deletion.dismiss()}
                >
                  Done
                </button>
              ) : (
                <button type="button" className={styles.primary} onClick={restart}>
                  Start again
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {view.kind === 'sign-in-again' && (
        <>
          {heading('The account isn’t deleted yet')}
          <div className={styles.copy}>
            <p role="alert">
              This device&rsquo;s sign-in ran out before FretFree&rsquo;s server confirmed the
              delete. Sign in again as <strong className={styles.email}>{view.email}</strong>, then
              delete your account once more. Your progress on this device is untouched.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => deletion.dismiss()}>
                OK
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type View =
  | { kind: 'signed-in'; email: string }
  | {
      kind: 'deleting';
      email: string;
      status: Extract<DeletionStatus, { phase: 'deleting' }> | null;
    }
  | { kind: 'deleted'; keepLocal: boolean }
  | { kind: 'sign-in-again'; email: string };

/** What the panel shows: a finished delete's message first, then one in flight, then the offer. */
export function viewOf(
  status: DeletionStatus,
  pendingEmail: string | null,
  accountEmail: string | null,
): View | null {
  if (status.phase === 'deleted') return { kind: 'deleted', keepLocal: status.keepLocal };
  if (status.phase === 'sign-in-again' && !accountEmail) {
    return { kind: 'sign-in-again', email: status.email };
  }
  if (status.phase === 'deleting') return { kind: 'deleting', email: status.email, status };
  if (pendingEmail) return { kind: 'deleting', email: pendingEmail, status: null };
  if (accountEmail) return { kind: 'signed-in', email: accountEmail };
  return null;
}

function DeleteStep({
  email,
  exportBackup,
  onDelete,
}: {
  email: string;
  exportBackup: () => Promise<unknown>;
  onDelete(keepLocal: boolean): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [keepLocal, setKeepLocal] = useState(true);
  const [exported, setExported] = useState<string | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const [focus, setFocus] = useState<'confirm' | 'open' | null>(null);
  const name = useId();

  useEffect(() => {
    if (focus === 'confirm') confirmRef.current?.focus();
    if (focus === 'open') openRef.current?.focus();
  }, [focus, confirming]);

  const exportNow = async () => {
    try {
      await exportBackup();
      setExported('Backup saved. Import it from Settings → Your data, on any device.');
    } catch {
      setExported('Couldn’t save the backup. Try again.');
    }
  };

  return (
    <div className={styles.columns}>
      <div className={styles.copy}>
        <p>
          Deleting your account removes your email address and the copy of your progress from
          FretFree&rsquo;s server, for good. Your other devices are signed out, and keep what they
          have.
        </p>
        <p className={styles.muted}>
          You choose what happens to your progress on this device.{' '}
          <Link to="/privacy">Privacy</Link>
        </p>
      </div>
      {confirming ? (
        <div className={styles.form}>
          <h3 ref={confirmRef} tabIndex={-1} className={styles.stepTitle}>
            Delete the account for <span className={styles.email}>{email}</span>?
          </h3>
          <fieldset className={manage.choices}>
            <legend>Your progress on this device</legend>
            <label className={manage.choice}>
              <input
                type="radio"
                name={name}
                checked={keepLocal}
                onChange={() => setKeepLocal(true)}
              />
              <span>
                <strong>Keep it on this device</strong>
                <span className={styles.muted}>Carry on practising here, without an account.</span>
              </span>
            </label>
            <label className={manage.choice}>
              <input
                type="radio"
                name={name}
                checked={!keepLocal}
                onChange={() => setKeepLocal(false)}
              />
              <span>
                <strong>Delete it from this device too</strong>
                <span className={styles.muted}>FretFree starts again from the beginning here.</span>
              </span>
            </label>
          </fieldset>
          <p className={styles.hint}>
            Want a copy first? A backup works with or without an account.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => void exportNow()}>
              Export a backup
            </button>
          </div>
          {exported && <p role="status">{exported}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.secondary} ${manage.destructive}`}
              onClick={() => onDelete(keepLocal)}
            >
              Delete my account
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setConfirming(false);
                setExported(null);
                setFocus('open');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          <button
            ref={openRef}
            type="button"
            className={styles.secondary}
            onClick={() => {
              setConfirming(true);
              setFocus('confirm');
            }}
          >
            Delete account…
          </button>
        </div>
      )}
    </div>
  );
}

function Deleting({
  status,
  email,
}: {
  status: Extract<DeletionStatus, { phase: 'deleting' }> | null;
  email: string;
}) {
  const text =
    status?.trouble === 'offline'
      ? 'You’re offline. FretFree will finish deleting your account when you’re back online, while this page is open.'
      : status?.trouble === 'server'
        ? 'FretFree’s server hasn’t finished yet. It keeps trying until the delete is done.'
        : 'Deleting your email address and the copy of your progress from FretFree’s server…';
  return (
    <div className={styles.copy}>
      <p role="status" data-testid="deletion-status">
        {text}
      </p>
      <p className={styles.muted}>
        <strong className={styles.email}>{email}</strong> is signed out on this device already, and
        nothing more is synced.
      </p>
    </div>
  );
}
