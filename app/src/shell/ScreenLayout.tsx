import { useState, type ReactNode } from 'react';
import { useSizeClass } from './size-class';
import styles from './ScreenLayout.module.css';

/**
 * A screen with an optional context panel (design §7): alongside on the right
 * at regular-wide, below the main content at regular, and a toggleable sheet
 * at compact.
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
  const [sheetOpen, setSheetOpen] = useState(false);
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
        <>
          <button
            type="button"
            className={styles.sheetToggle}
            onClick={() => setSheetOpen((o) => !o)}
          >
            {sheetOpen ? 'Hide' : 'Show'} {contextTitle.toLowerCase()}
          </button>
          {sheetOpen && (
            <aside className={styles.sheet} aria-label={contextTitle} data-testid="context-sheet">
              {context}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
