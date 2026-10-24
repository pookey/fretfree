import { Link } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import screens from '../screens.module.css';
import styles from '../about/About.module.css';

export const LAST_UPDATED = '24 October 2026';
const ISSUES_URL = 'https://github.com/pookey/fretfree/issues';

/** The context panel: the policy in four lines. */
function InShort() {
  return (
    <div className={screens.contextCopy}>
      <h2>In short</h2>
      <ul className={styles.short}>
        <li>Your progress stays on this device unless you sign in.</li>
        <li>An account is optional: just your email and a copy of your progress.</li>
        <li>Delete the account any time, from Progress.</li>
        <li>No cookies, no analytics, nothing loaded from anyone else.</li>
      </ul>
    </div>
  );
}

/**
 * Privacy (design §1 principle 8): what the hosted app at fretfree.app stores,
 * where, and what it doesn't, with and without the optional account (M7-06).
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
              XP and settings are stored in this browser on this device (IndexedDB). They
              don&rsquo;t leave it unless you sign in to sync, below.
            </li>
            <li>
              <strong>The app itself.</strong> Its files are cached so FretFree works offline.
            </li>
            <li>
              <strong>A few small preferences.</strong> Whether you dismissed the &ldquo;Add to Home
              Screen&rdquo; hint, and similar choices, kept in local storage.
            </li>
            <li>
              <strong>Your sign-in, if you sign in.</strong> The tokens that keep you signed in are
              kept in this browser&rsquo;s local storage. Signing out removes them and leaves your
              progress here as it was.
            </li>
            <li>
              <strong>Deleting it.</strong> Clear this site&rsquo;s data in your browser settings.
              That deletes your progress on this device for good, so{' '}
              <Link to="/settings">export a backup from Settings</Link> first if you want to keep
              it. Export works whether or not you&rsquo;re signed in.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-account">
          <h2 id="privacy-account" className={screens.sectionTitle}>
            If you sign in (optional)
          </h2>
          <ul className={styles.privacy}>
            <li>
              <strong>Why.</strong> Only to keep a copy of your progress, so you can carry on from
              another device. It&rsquo;s never required: FretFree works fully without an account,
              offline, on one device.
            </li>
            <li>
              <strong>What we store.</strong> Your email address, used only to sign you in: never
              for news or marketing, and never shared. And a copy of your progress, the same things
              a backup export holds.
            </li>
            <li>
              <strong>Where.</strong> On Amazon Web Services in the US East (N. Virginia) region,
              us-east-1: your email address in Amazon Cognito, and the copy of your progress in
              Amazon DynamoDB. Sign-in emails are sent through Amazon SES in the Europe (Ireland)
              region, eu-west-1.
            </li>
            <li>
              <strong>Signing in.</strong> There&rsquo;s no password. While a sign-in waits, the
              server keeps only hashed forms of your address and of the emailed code and link, and
              they expire after 15 minutes. Counts that limit how many emails can be sent are hashed
              too, and expire within an hour.
            </li>
            <li>
              <strong>Backups and logs.</strong> The progress copy has AWS point-in-time backups for
              35 days, so anything deleted is gone from them within 35 days. The servers&rsquo; logs
              are deleted after a month.
            </li>
            <li>
              <strong>Deleting your account.</strong> In <Link to="/progress">Progress</Link>,
              choose &ldquo;Delete account&rdquo;. That removes your email address and the copy of
              your progress from the server, and you choose whether this device keeps its progress.
              All that remains is an anonymous marker: the account&rsquo;s random ID and a
              &ldquo;closed&rdquo; flag, with no email and no learning data, so a device that was
              offline can&rsquo;t bring the account back.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-not">
          <h2 id="privacy-not" className={screens.sectionTitle}>
            What we don&rsquo;t collect
          </h2>
          <ul className={styles.privacy}>
            <li>
              <strong>No account needed.</strong> You never have to sign up or log in.
            </li>
            <li>
              <strong>No cookies, no analytics, no ads.</strong> There&rsquo;s no tracking of any
              kind. Nothing about how you practise is sent anywhere, apart from the copy of your
              progress if you sign in.
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
            don&rsquo;t turn on access logging, so we keep no record of who visits. Sign-in and sync
            go to api.fretfree.app, which also runs on AWS, and only when you use them.
          </p>
        </section>

        <section aria-labelledby="privacy-copies">
          <h2 id="privacy-copies" className={screens.sectionTitle}>
            Copies hosted by others
          </h2>
          <p>
            FretFree is open source under the MIT licence, so anyone can host a copy. This page
            covers fretfree.app. A copy elsewhere is run by whoever hosts it. If that copy offers
            sign-in, your email and progress go to its host&rsquo;s server, not ours.
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
