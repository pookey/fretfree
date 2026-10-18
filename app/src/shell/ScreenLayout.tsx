import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useSizeClass } from './size-class';
import styles from './ScreenLayout.module.css';

/**
 * A screen with an optional context panel (design §7): alongside on the right
 * at regular-wide, below the main content at regular, and a sheet at compact.
 */
export function ScreenLayout({
  title,
  children,
  context,
  contextTitle = 'Context',
}: {
  title?: string;
  children: ReactNode;
  context?: ReactNode;
  contextTitle?: string;
}) {
  const sizeClass = useSizeClass();
  return (
    <div className={styles.layout} data-size-class={sizeClass} data-has-context={Boolean(context)}>
      <section className={styles.main}>
        {title && <h1 className={styles.title}>{title}</h1>}
        {children}
      </section>
      {context && sizeClass !== 'compact' && (
        <aside className={styles.context} aria-label={contextTitle} data-testid="context-panel">
          {context}
        </aside>
      )}
      {context && sizeClass === 'compact' && (
        <ContextSheet title={contextTitle}>{context}</ContextSheet>
      )}
    </div>
  );
}

/**
 * The compact context panel: a button that raises a bottom sheet over the
 * screen. It isn't modal, so the screen stays usable. The sheet's own Close
 * button, the toggle or Escape closes it, and focus returns to the toggle.
 */
export function ContextSheet({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (opened.current) toggleRef.current?.focus();
    opened.current = open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={styles.sheetToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
      >
        {open ? 'Hide' : 'Show'} {title.toLowerCase()}
      </button>
      {open && (
        <aside id={id} className={styles.sheet} aria-label={title} data-testid="context-sheet">
          <div className={styles.sheetHeader}>
            <h2>{title}</h2>
            <button
              ref={closeRef}
              type="button"
              className={styles.sheetClose}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          {children}
        </aside>
      )}
    </>
  );
}
