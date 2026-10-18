import { useId, useState } from 'react';
import { Link } from 'react-router';
import { getSkill, isFrontier } from '../../engine';
import { practiseHref } from '../../learn/worked-examples/focus';
import { exampleFor } from '../../learn/worked-examples';
import { WorkedExample } from '../../learn/worked-examples/WorkedExample';
import { MasteryRing } from './MasteryRing';
import { SKILL_STATUS_LABEL, skillRingState, type SkillView } from './map-model';
import styles from './Learn.module.css';
import local from './SkillDetail.module.css';

/** What a skill's status means for sessions (soft unlocking, design §3.4). */
function statusCopy(view: SkillView): string {
  if (view.status === 'mastered') return 'Mastered. Reviews keep it fresh.';
  if (isFrontier(view.status)) return 'Its new items join your daily sessions.';
  const needs = view.skill.prerequisites.map((id) => getSkill(id)?.title ?? id).join(' and ');
  return view.skill.softUnlock
    ? `Preview only. It joins your sessions once you're practising ${needs}.`
    : `Preview only. It joins your sessions once you've mastered ${needs}.`;
}

/**
 * Skill detail (design §7 Learn): status, a worked example that fades its
 * guides, and "Practise this now" for a focused session. The misconception
 * callout is the module's (`ModuleDetail`); examples add their own targeted
 * one when the learner falls for it. Practice is offered on the frontier only:
 * gating stays on (research/02 rule 7), while any example can be previewed.
 */
export function SkillDetail({ view }: { view: SkillView }) {
  const { skill } = view;
  const example = exampleFor(skill);
  const [open, setOpen] = useState(false);
  const exampleId = useId();
  const canPractise = isFrontier(view.status);
  return (
    <li
      className={`${styles.skill} ${local.skill}`}
      data-status={view.status}
      data-testid={`skill-${skill.id}`}
    >
      <MasteryRing
        learning={view.learning}
        stable={view.mastery}
        state={skillRingState(view.status)}
        label={skill.title}
      />
      <div className={local.body}>
        <h4 className={styles.skillTitle}>{skill.title}</h4>
        <p className={styles.skillMeta}>
          <span className={styles.topic}>{skill.topic}</span> {SKILL_STATUS_LABEL[view.status]} ·{' '}
          <span data-testid="skill-progress">
            {view.learningCount} learning · {view.stableCount} stable of {view.itemCount}
          </span>
        </p>
        <p className={styles.skillCopy}>{statusCopy(view)}</p>
        {(example || canPractise) && (
          <div className={local.actions}>
            {example && (
              <button
                type="button"
                className={local.toggle}
                aria-expanded={open}
                aria-controls={open ? exampleId : undefined}
                onClick={() => setOpen((o) => !o)}
              >
                {open ? 'Hide worked example' : 'Worked example'}
              </button>
            )}
            {canPractise && (
              <Link to={practiseHref(skill.id)} className={local.practise}>
                Practise this now
              </Link>
            )}
          </div>
        )}
      </div>
      {example && open && (
        <div id={exampleId} className={local.example}>
          <WorkedExample example={example} />
        </div>
      )}
    </li>
  );
}
