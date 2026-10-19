import { Component, Suspense, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { useSizeClass } from '../../shell/size-class';
import { TOOLS, toolPath, type Tool } from './registry';
import styles from './ToolsScreen.module.css';

/**
 * Tools (design §7): practice utilities, no grading. A grid of tool cards at
 * regular widths, a list on compact.
 */
export function ToolsScreen({ tools = TOOLS }: { tools?: readonly Tool[] }) {
  const layout = useSizeClass() === 'compact' ? 'list' : 'grid';
  return (
    <ScreenLayout title="Tools">
      {tools.length > 0 ? (
        <ul className={styles.tools} data-layout={layout} aria-label="Tools">
          {tools.map((t) => (
            <li key={t.id}>
              <Link to={toolPath(t.id)} className={styles.card}>
                <span className={styles.icon} aria-hidden>
                  {t.icon}
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{t.name}</span>
                  <span className={styles.purpose}>{t.purpose}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No tools yet.</p>
      )}
    </ScreenLayout>
  );
}

/** One tool, named by the `:tool` route param. Its view loads on demand. */
export function ToolScreen({ tools = TOOLS }: { tools?: readonly Tool[] }) {
  const { tool: id } = useParams();
  const tool = tools.find((t) => t.id === id);
  const back = (
    <Link to="/tools" className={styles.back}>
      ← All tools
    </Link>
  );
  if (!tool)
    return (
      <ScreenLayout title="Tool not found">
        <p className={styles.muted}>There’s no tool called “{id}”.</p>
        {back}
      </ScreenLayout>
    );
  return (
    <ScreenLayout title={tool.name}>
      {back}
      <section aria-label={tool.name} data-tool={tool.id} className={styles.view}>
        <LoadFailed key={tool.id} name={tool.name}>
          <Suspense
            fallback={
              <p role="status" className={styles.muted}>
                Loading {tool.name}…
              </p>
            }
          >
            <tool.View />
          </Suspense>
        </LoadFailed>
      </section>
    </ScreenLayout>
  );
}

/**
 * Catches a tool whose chunk failed to download (e.g. offline before the
 * service worker cached it). A failed lazy import stays failed, so the way
 * back is a reload.
 */
class LoadFailed extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert">
        <p>Couldn’t load {this.props.name}. Check your connection, then reload.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
