import { useId, useState } from 'react';
import { Link } from 'react-router';
import { getSkill, isFrontier } from '../../engine';
import { practiseHref } from '../../learn/worked-examples/focus';
import { useWorkedExamples } from '../../learn/worked-examples/lazy';
import { MasteryRing } from './MasteryRing';
import { SKILL_STATUS_LABEL, skillRingState, type SkillView } from './map-model';
import styles from './Learn.module.css';
import local from './SkillDetail.module.css';

/**
 * What a skill's status means for sessions (soft unlocking, design §3.4), and
 * for a locked skill the prerequisites it waits for. Titles can hold their own
 * "and", so two or more are listed one per line rather than joined (M1-38).
 */
function statusCopy(view: SkillView): { text: string; needs: string[] } {
  if (!view.practisable)
    return {
      text: "Coming soon. Its drill isn't built yet, so it can't join your sessions.",
      needs: [],
    };
  if (view.status === 'mastered') return { text: 'Mastered. Reviews keep it fresh.', needs: [] };
  if (isFrontier(view.status))
    return { text: 'Its new items join your daily sessions.', needs: [] };
  const titles = view.skill.prerequisites.map((id) => getSkill(id)?.title ?? id);
  if (titles.length === 0) return { text: 'Preview only.', needs: [] };
  const when = view.skill.softUnlock ? "once you're practising" : "once you've mastered";
  const text = `Preview only. It joins your sessions ${when}`;
  return titles.length === 1
    ? { text: `${text} ${titles[0]}.`, needs: [] }
    : { text: `${text}:`, needs: titles };
}

/**
 * Skill detail (design §7 Learn): status, a worked example that fades its
 * guides, and "Practise this now" for a focused session. The misconception
 * callout is the module's (`ModuleDetail`); examples add their own targeted
 * one when the learner falls for it. Practice is offered on the frontier only:
 * gating stays on (research/02 rule 7), while any example can be previewed.
 * Examples load on demand, so the toggle appears once they have.
 */
export function SkillDetail({ view }: { view: SkillView }) {
  const { skill } = view;
  const examples = useWorkedExamples();
  const example = examples?.exampleFor(skill);
  const [open, setOpen] = useState(false);
  const exampleId = useId();
  // A skill no built drill can test would open an empty session.
  const canPractise = isFrontier(view.status) && view.practisable;
  const { text, needs } = statusCopy(view);
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
        <p className={styles.skillCopy}>{text}</p>
        {needs.length > 0 && (
          // An explicit role: WebKit drops list semantics, and the label, from unbulleted lists.
          <ul
            className={`${styles.skillCopy} ${local.needs}`}
            role="list"
            aria-label="Prerequisites"
          >
            {needs.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        )}
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
      {examples && example && open && (
        <div id={exampleId} className={local.example}>
          <examples.View example={example} />
        </div>
      )}
    </li>
  );
}
