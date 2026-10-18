import styles from './Onboarding.module.css';

/**
 * The honest About copy (design §4, research/02 "Personalisation"): we adapt
 * to what the learner knows and wants, not to a "learning style".
 */
export function About() {
  return (
    <section className={styles.about} aria-labelledby="about-fretfree">
      <h2 id="about-fretfree">About FretFree</h2>
      <p className={styles.lead}>
        This app adapts to what you know and what you want, not to a &lsquo;learning style&rsquo;.
        Here&rsquo;s why.
      </p>
      <p>
        Matching lessons to a &ldquo;visual&rdquo; or &ldquo;auditory&rdquo; learner doesn&rsquo;t
        help people learn: careful studies keep finding no benefit. What does work, for everyone, is
        recalling answers yourself, spaced out over days, with similar things mixed together, until
        they come quickly.
      </p>
      <p>
        So every note you learn is something you answer, not something you read. FretFree keeps the
        practice hard enough that you get about 8 or 9 in 10 right, brings each note back just
        before you&rsquo;d forget it, and takes the guides away as you improve.
      </p>
    </section>
  );
}
