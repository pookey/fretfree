import { Component, Suspense, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { EXPLORE_VIEWS, type ExploreView } from './registry';
import styles from '../screens.module.css';

/**
 * Explore (design §7): reference tools, no grading. Lists the registered views
 * and shows the one named by `?view=`, or the first. Views load on demand, so
 * the section shows a status while one downloads.
 */
export function ExploreScreen({ views = EXPLORE_VIEWS }: { views?: readonly ExploreView[] }) {
  const [params] = useSearchParams();
  const active = views.find((v) => v.id === params.get('view')) ?? views[0];
  return (
    <ScreenLayout title="Explore">
      <nav className={styles.viewList} aria-label="Explore views">
        {views.map((v) => (
          <Link
            key={v.id}
            to={{ search: `?view=${v.id}` }}
            aria-current={v === active ? 'page' : undefined}
          >
            {v.title}
          </Link>
        ))}
      </nav>
      {active ? (
        <section aria-label={active.title} data-explore-view={active.id}>
          <LoadFailed key={active.id} title={active.title}>
            <Suspense
              fallback={
                <p role="status" className={styles.muted}>
                  Loading {active.title}…
                </p>
              }
            >
              <active.View />
            </Suspense>
          </LoadFailed>
        </section>
      ) : (
        <p className={styles.muted}>Nothing to explore yet.</p>
      )}
    </ScreenLayout>
  );
}

/**
 * Catches a view whose chunk failed to download (e.g. offline before the
 * service worker cached it). A failed lazy import stays failed, so the way
 * back is a reload.
 */
class LoadFailed extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert">
        <p>Couldn’t load {this.props.title}. Check your connection, then reload.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
