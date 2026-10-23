import { Fragment, useId, useState } from 'react';
import { Link } from 'react-router';
import { gatesOf, getSkill, isFrontier } from '../../engine';
import { useOutcomes } from '../../learn/outcomes/lazy';
import { practiseHref } from '../../learn/worked-examples/focus';
import { useWorkedExamples } from '../../learn/worked-examples/lazy';
import { MasteryRing } from './MasteryRing';
import { hasPreview, skillRingState, skillStatusLabel, type SkillView } from './map-model';
import styles from './Learn.module.css';
import local from './SkillDetail.module.css';

/** One sentence of the status copy, and the titles it lists one per line. */
interface Copy {
  text: string;
  needs: string[];
  label?: string;
}

/**
 * What a skill's status means for sessions (soft unlocking, design §3.4), and
 * for a locked skill the prerequisites it waits for: those to master and those
 * to be practising. Titles can hold their own "and", so two or more of a kind
 * are listed one per line rather than joined (M1-38).
 */
function statusCopy(view: SkillView): Copy[] {
  if (!view.practisable)
    return [
      {
        text: "Coming soon. Its drill isn't built yet, so it can't join your sessions.",
        needs: [],
      },
    ];
  if (view.status === 'mastered') return [{ text: 'Mastered. Reviews keep it fresh.', needs: [] }];
  if (isFrontier(view.status))
    return [{ text: 'Its new cards join your daily sessions, a few each day.', needs: [] }];
  const gates = gatesOf(view.skill);
  const titles = (ids: readonly string[]) => ids.map((id) => getSkill(id)?.title ?? id);
  const [master, practise] = [titles(gates.mastered), titles(gates.practising)];
  const lead = 'Preview only. It joins your sessions once';
  if (master.length > 0 && practise.length > 0) {
    if (master.length === 1 && practise.length === 1)
      return [
        {
          text: `${lead} you've mastered ${master[0]} and are practising ${practise[0]}.`,
          needs: [],
        },
      ];
    return [
      { text: `${lead} you've mastered:`, needs: master, label: 'Prerequisites to master' },
      { text: 'and are practising:', needs: practise, label: 'Prerequisites to practise' },
    ];
  }
  const [when, needs] =
    master.length > 0 ? ["you've mastered", master] : ["you're practising", practise];
  if (needs.length === 0) return [{ text: 'Preview only.', needs: [] }];
  return needs.length === 1
    ? [{ text: `${lead} ${when} ${needs[0]}.`, needs: [] }]
    : [{ text: `${lead} ${when}:`, needs, label: 'Prerequisites' }];
}

/**
 * Skill detail (design §7 Learn): what the skill lets you do (its outcome,
 * research/02 rule 15), status, a worked example that fades its guides, and
 * "Practise this now" for a focused session. The misconception
 * callout is the module's (`ModuleDetail`); examples add their own targeted
 * one when the learner falls for it. Practice is offered on the frontier only:
 * gating stays on (research/02 rule 7), while any example can be previewed.
 * Examples load on demand, so the toggle appears once they have.
 */
export function SkillDetail({ view }: { view: SkillView }) {
  const { skill } = view;
  const examples = useWorkedExamples();
  const example = examples?.exampleFor(skill);
  const previews = useOutcomes();
  const outcome = previews?.outcomeOf(skill.id);
  const previewable = hasPreview({
    loading: !previews || !examples,
    outcome,
    intro: previews?.hasIntro(skill) ?? false,
    example,
  });
  const [open, setOpen] = useState(false);
  const exampleId = useId();
  // A skill no built drill can test would open an empty session.
  const canPractise = isFrontier(view.status) && view.practisable;
  const copy = statusCopy(view);
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
        {outcome && (
          <p className={local.outcome} data-testid="skill-outcome">
            {outcome}
          </p>
        )}
        <p className={styles.skillMeta}>
          {skillStatusLabel(view.status, previewable)} ·{' '}
          <span data-testid="skill-progress">
            {view.learningCount} learning · {view.stableCount} stable of {view.itemCount}
          </span>
        </p>
        {copy.map(({ text, needs, label }) => (
          <Fragment key={text}>
            <p className={styles.skillCopy}>{text}</p>
            {needs.length > 0 && (
              // An explicit role: WebKit drops list semantics, and the label, from unbulleted lists.
              <ul className={`${styles.skillCopy} ${local.needs}`} role="list" aria-label={label}>
                {needs.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            )}
          </Fragment>
        ))}
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
