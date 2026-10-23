import { LearningLegend } from '../../components/learning-legend/LearningLegend';
import type { SkillStatus } from '../../engine';
import { TestOut } from '../../placement/TestOut';
import { MasteryRing } from './MasteryRing';
import { MODULE_STATE_LABEL, percent, type ModuleView } from './map-model';
import { SkillDetail } from './SkillDetail';
import styles from './Learn.module.css';

const TRACK_NOTE = {
  core: null,
  // Not "from day one": Ear waits for the first neck skill unless the learner starts with sound.
  parallel: 'A parallel track: it runs alongside the others, not after them.',
  optional: 'Optional: lower payoff, for when the core is solid.',
  future: 'A future track, planned for a later release.',
} as const;

/**
 * The right-hand pane (design §7 Learn): a module and the detail of its
 * skills. A locked module offers a test-out (M2-16) once `statuses` (the
 * derived skill statuses) are loaded; `onChange` reloads them after it.
 */
export function ModuleDetail({
  view,
  statuses,
  onChange,
}: {
  view: ModuleView;
  statuses?: ReadonlyMap<string, SkillStatus>;
  onChange?: () => void;
}) {
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
          You can look around this module now and try its examples. Its skills join your daily
          sessions on their own once you’re far enough along with what they build on: each skill
          below says what it’s waiting for.
        </p>
      )}
      {view.skills.length > 0 && (
        <TestOut
          key={module.id}
          module={module}
          offer={view.state === 'locked'}
          statuses={statuses}
          onSaved={onChange}
        />
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
          <LearningLegend />
          <p className={styles.muted}>
            A card becomes stable through reviews spread over several days, not one long session.
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
