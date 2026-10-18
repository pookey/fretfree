import { ENGINE_CONFIG } from '../../engine';
import { MasteryRing } from './MasteryRing';
import { MODULE_STATE_LABEL, percent, type ModuleView } from './map-model';
import { SkillDetail } from './SkillDetail';
import styles from './Learn.module.css';

const TRACK_NOTE = {
  core: null,
  parallel: 'A parallel track: it runs alongside the others from day one.',
  optional: 'Optional: lower payoff, for when the core is solid.',
  future: 'A future track, planned for a later release.',
} as const;

/** The right-hand pane (design §7 Learn): a module and the detail of its skills. */
export function ModuleDetail({ view }: { view: ModuleView }) {
  const { module } = view;
  const track = TRACK_NOTE[module.track];
  return (
    <article
      className={styles.detail}
      aria-labelledby="module-detail-title"
      data-testid="module-detail"
    >
      <header className={styles.detailHeader}>
        <MasteryRing
          learning={view.learning}
          stable={view.mastery}
          state={view.state}
          label={module.title}
          size="large"
        />
        <div>
          <h2 id="module-detail-title" className={styles.detailTitle}>
            {module.title}
          </h2>
          <p className={styles.detailState} data-testid="module-state">
            {MODULE_STATE_LABEL[view.state]}
          </p>
          {view.skills.length > 0 && (
            <p className={styles.detailProgress} data-testid="module-progress">
              {percent(view.learning)}% learning · {percent(view.mastery)}% stable
            </p>
          )}
        </div>
      </header>
      <p>{module.summary}</p>
      {module.unlocksAfter && (
        <p className={styles.muted}>
          Builds on: <strong>{module.unlocksAfter}</strong>
        </p>
      )}
      {track && <p className={styles.muted}>{track}</p>}
      {view.state === 'locked' && (
        <p className={styles.note} data-testid="preview-note">
          You can preview this module now. Its skills start feeding your sessions once you've made
          progress on what they build on.
        </p>
      )}
      {module.misconception && (
        <aside className={styles.callout} aria-label="Watch out for">
          <h3>Watch out for</h3>
          <p>{module.misconception}</p>
        </aside>
      )}
      <h3 className={styles.skillsHeading}>Skills</h3>
      {view.skills.length > 0 ? (
        <>
          <ul className={styles.skills}>
            {view.skills.map((s) => (
              <SkillDetail key={s.skill.id} view={s} />
            ))}
          </ul>
          <p className={styles.muted}>
            An item is learning while your latest answer to it is right. It becomes stable once
            you'd still recall it {ENGINE_CONFIG.mastery.stabilityDays} days later, which takes
            spaced reviews over several days, not one long session. A skill is mastered when{' '}
            {Math.round(ENGINE_CONFIG.mastery.itemShare * 100)}% of its items are stable and you
            answer within your speed target.
          </p>
        </>
      ) : (
        <p className={styles.muted} data-testid="coming-soon">
          Coming soon. Its skills and drills aren’t built yet.
        </p>
      )}
    </article>
  );
}
