import { Link } from 'react-router';
import { ScreenLayout } from '../../shell/ScreenLayout';
import screens from '../screens.module.css';
import styles from './About.module.css';

/** What works, for everyone (research/02 summary and evidence base). */
const PRINCIPLES = [
  {
    title: 'You answer; you don’t re-read',
    body: 'Every note is a question you answer before you see it. Pulling an answer from memory makes it stick far better than reading it again.',
    source: 'Roediger & Karpicke 2006; Adesope et al. 2017',
  },
  {
    title: 'Spaced over days',
    body: 'A scheduler (FSRS, the one modern Anki uses) brings each note back just before you’d forget it, so a few minutes a day beat a long cram.',
    source: 'Cepeda et al. 2006; Dunlosky et al. 2013',
  },
  {
    title: 'Mixed, not blocked',
    body: 'New notes get a few reps on their own, then they’re mixed with ones that are easy to confuse, like E and F. It feels harder, and that’s why it works.',
    source: 'Bjork & Bjork 2011; Brunmair & Richter 2019',
  },
  {
    title: 'Fast as well as right',
    body: 'A note you have to count up to isn’t learned yet. Every answer is timed against a target built from your own tap time.',
    source: 'Binder 1996',
  },
  {
    title: 'Hard enough, not too hard',
    body: 'The practice widens or narrows to keep you getting about 8 or 9 in 10 right.',
    source: 'Wilson et al. 2019 (a model result we use as a tuning target)',
  },
  {
    title: 'Guides that fade',
    body: 'Dots, labels and inlays help at first, then fade as you improve. Players who learned with a light-up guitar lost their gains once the lights went off.',
    source: 'Winstein & Schmidt 1990; Keebler et al. 2014',
  },
] as const;

/** The context panel: the whole page in four lines. */
function InShort() {
  return (
    <div className={screens.contextCopy}>
      <h2>In short</h2>
      <ul className={styles.short}>
        <li>No learning styles: what works, works for everyone.</li>
        <li>Spaced, mixed, timed recall, kept at 80–90% right.</li>
        <li>No account and no analytics.</li>
        <li>Your data stays on this device.</li>
      </ul>
    </div>
  );
}

/**
 * About (design §1, §4, §10): the evidence behind the approach, said
 * honestly, and what happens to the learner's data. Reached from Progress →
 * Settings.
 */
export function AboutScreen() {
  return (
    <ScreenLayout title="About Fretwork" context={<InShort />} contextTitle="In short">
      <div className={styles.about}>
        <section aria-labelledby="about-approach">
          <h2 id="about-approach" className={screens.sectionTitle}>
            How Fretwork teaches
          </h2>
          <p className={styles.lead}>
            This app adapts to what you know and what you want, not to a &lsquo;learning
            style&rsquo;. Here&rsquo;s why.
          </p>
          <p>
            Matching lessons to a &ldquo;visual&rdquo; or &ldquo;auditory&rdquo; learner
            doesn&rsquo;t help people learn: careful studies keep finding no benefit (Pashler et al.
            2008; Rogowsky et al. 2015). What does work is the same for everyone:
          </p>
          <ul className={styles.principles}>
            {PRINCIPLES.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                <p className={styles.source}>{p.source}</p>
              </li>
            ))}
          </ul>
          <p>
            What we do tailor is what genuinely differs between people: what you already know, your
            goal, how much time you have, and whether you read tab or standard notation. The choices
            are yours, but none of them switches off the spacing or the recall.
          </p>
          <p>
            Streaks, XP and badges reward short daily practice and real mastery. There are no hearts
            to lose for mistakes and no public leaderboards: mistakes are part of learning.
          </p>
          <p className={screens.muted}>
            To be honest about the limits: there&rsquo;s almost no controlled research on learning
            the fretboard itself. Choices like teaching CAGED are reasoned from the general
            principles above.
          </p>
        </section>

        <section aria-labelledby="about-privacy">
          <h2 id="about-privacy" className={screens.sectionTitle}>
            Privacy
          </h2>
          <ul className={styles.privacy}>
            <li>
              <strong>No account.</strong> You never sign up or log in.
            </li>
            <li>
              <strong>No analytics.</strong> No tracking, no ads, and nothing about how you practise
              is sent anywhere.
            </li>
            <li>
              <strong>Your data stays here.</strong> Your progress, settings and every answer are
              stored in this browser on this device. Fretwork works offline.
            </li>
            <li>
              <strong>Mic mode listens, but doesn&rsquo;t record.</strong> When you switch it on,
              the sound is analysed on this device to find the pitch, and it&rsquo;s never saved or
              sent.
            </li>
            <li>
              <strong>Keep a backup.</strong> Clearing this site&rsquo;s data deletes your progress.
              Export it from <Link to="/progress">Progress</Link> → Your data, and import it on
              another device.
            </li>
          </ul>
          <p className={screens.muted}>Fretwork is open source under the MIT licence.</p>
        </section>

        <p>
          <Link to="/progress" className={screens.secondaryButton}>
            Back to Progress
          </Link>
        </p>
      </div>
    </ScreenLayout>
  );
}
