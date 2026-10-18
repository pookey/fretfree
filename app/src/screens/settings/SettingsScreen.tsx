import { Link } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { SettingsGroups } from './SettingsGroups';
import { YourData } from './YourData';
import styles from '../screens.module.css';
import local from './settings.module.css';

/**
 * Settings (design §7): its own section. The settings cards, export and
 * import of the learner's data, and the About and Privacy pages.
 */
export function SettingsScreen() {
  return (
    <ScreenLayout title="Settings">
      <div className={styles.panels}>
        <SettingsGroups />
        <section aria-labelledby="settings-data">
          <h2 id="settings-data" className={styles.sectionTitle}>
            Your data
          </h2>
          <YourData />
        </section>
        <section aria-labelledby="settings-about">
          <h2 id="settings-about" className={styles.sectionTitle}>
            About
          </h2>
          <p className={local.links}>
            <Link to="/about">About FretFree</Link>
            <span className={styles.muted}>How it teaches, and why.</span>
          </p>
          <p className={local.links}>
            <Link to="/privacy">Privacy</Link>
            <span className={styles.muted}>What&rsquo;s stored, where, and what isn&rsquo;t.</span>
          </p>
        </section>
      </div>
    </ScreenLayout>
  );
}
