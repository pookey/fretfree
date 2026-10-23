import { Link } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import screens from '../screens.module.css';
import styles from '../about/About.module.css';

export const LAST_UPDATED = '23 October 2026';
const ISSUES_URL = 'https://github.com/pookey/fretfree/issues';

/** The context panel: the policy in four lines. */
function InShort() {
  return (
    <div className={screens.contextCopy}>
      <h2>In short</h2>
      <ul className={styles.short}>
        <li>We collect nothing about you.</li>
        <li>Your progress stays on this device.</li>
        <li>No account, no cookies, no analytics.</li>
        <li>Nothing is loaded from anyone else.</li>
      </ul>
    </div>
  );
}

/**
 * Privacy (design §1 principle 8): what the hosted app at fretfree.app stores,
 * where, and what it doesn't. M7-06 extends it before optional sign-in ships.
 */
export function PrivacyScreen() {
  return (
    <ScreenLayout title="Privacy" context={<InShort />} contextTitle="In short">
      <div className={styles.about}>
        <section aria-labelledby="privacy-device">
          <h2 id="privacy-device" className={screens.sectionTitle}>
            What stays on your device
          </h2>
          <ul className={styles.privacy}>
            <li>
              <strong>Your progress.</strong> Every answer and its timing, your schedule, streaks,
              XP and settings are stored in this browser on this device (IndexedDB). They never
              leave it.
            </li>
            <li>
              <strong>The app itself.</strong> Its files are cached so FretFree works offline.
            </li>
            <li>
              <strong>One small preference.</strong> Whether you dismissed the &ldquo;Add to Home
              Screen&rdquo; hint, kept in local storage.
            </li>
            <li>
              <strong>Deleting it.</strong> Clear this site&rsquo;s data in your browser settings.
              That deletes your progress for good, so{' '}
              <Link to="/settings">export a backup from Settings</Link> first if you want to keep
              it.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-not">
          <h2 id="privacy-not" className={screens.sectionTitle}>
            What we don&rsquo;t collect
          </h2>
          <ul className={styles.privacy}>
            <li>
              <strong>No account.</strong> You never sign up or log in.
            </li>
            <li>
              <strong>No cookies, no analytics, no ads.</strong> Nothing about how you practise is
              sent anywhere, and there&rsquo;s no tracking of any kind.
            </li>
            <li>
              <strong>Nothing from third parties.</strong> No outside scripts, fonts or embeds:
              every file comes from fretfree.app.
            </li>
            <li>
              <strong>Mic mode listens, but doesn&rsquo;t record.</strong> The sound is analysed on
              this device to find the pitch, and it&rsquo;s never saved or sent.
            </li>
            <li>
              <strong>Sharing your guitar is up to you.</strong> Nothing is shared unless you tap
              &ldquo;Share my guitar&rdquo; in the Garage. The picture is made on this device and
              goes only where you send it.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-hosting">
          <h2 id="privacy-hosting" className={screens.sectionTitle}>
            Hosting
          </h2>
          <p>
            fretfree.app is served from Amazon Web Services (S3 and CloudFront). To deliver a page,
            AWS necessarily handles your IP address and the request, as any web host does. We
            don&rsquo;t turn on access logging, so we keep no record of who visits.
          </p>
        </section>

        <section aria-labelledby="privacy-signin">
          <h2 id="privacy-signin" className={screens.sectionTitle}>
            Optional sign-in (not available yet)
          </h2>
          <p>
            We plan an optional email sign-in to sync progress across devices. It will never be
            required. Before it launches, this page will say exactly what it stores (your email
            address and a copy of your progress), where, and how to delete it. Nothing changes
            unless you choose to sign in.
          </p>
        </section>

        <section aria-labelledby="privacy-copies">
          <h2 id="privacy-copies" className={screens.sectionTitle}>
            Copies hosted by others
          </h2>
          <p>
            FretFree is open source under the MIT licence, so anyone can host a copy. This page
            covers fretfree.app. A copy elsewhere is run by whoever hosts it, though the app itself
            sends nothing anywhere, wherever it runs.
          </p>
        </section>

        <section aria-labelledby="privacy-questions">
          <h2 id="privacy-questions" className={screens.sectionTitle}>
            Questions
          </h2>
          <p>
            Ask by opening an issue on <a href={ISSUES_URL}>GitHub</a>.
          </p>
          <p className={screens.muted}>Last updated {LAST_UPDATED}.</p>
        </section>

        <p>
          <Link to="/settings" className={screens.secondaryButton}>
            Back to Settings
          </Link>
        </p>
      </div>
    </ScreenLayout>
  );
}
