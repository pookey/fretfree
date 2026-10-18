import { Link, useSearchParams } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { EXPLORE_VIEWS, type ExploreView } from './registry';
import styles from '../screens.module.css';

/**
 * Explore (design §7): reference tools, no grading. Lists the registered views
 * and shows the one named by `?view=`, or the first.
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
          <active.View />
        </section>
      ) : (
        <p className={styles.muted}>Nothing to explore yet.</p>
      )}
    </ScreenLayout>
  );
}
