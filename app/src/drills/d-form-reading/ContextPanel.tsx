import type { DrillContextPanelProps } from '../types';
import type { FormReadingAnswer, FormReadingPrompt } from './logic';
import { formReadingGuides } from './text';
import styles from './ContextPanel.module.css';

const INK = 'currentColor';

/** A sign as the staff draws it, small, for the legend. */
function Sign({ kind }: { kind: 'begin' | 'end' | 'endings' }) {
  return (
    <svg className={styles.sign} viewBox="0 0 48 32" aria-hidden="true" focusable="false">
      {kind !== 'endings' && <line x1={0} x2={48} y1={18} y2={18} stroke={INK} strokeWidth={1.6} />}
      {kind === 'begin' && (
        <>
          <rect x={14} y={6} width={4} height={24} fill={INK} />
          <line x1={22} x2={22} y1={6} y2={30} stroke={INK} strokeWidth={1.6} />
          <circle cx={27} cy={13} r={2.4} fill={INK} />
          <circle cx={27} cy={23} r={2.4} fill={INK} />
        </>
      )}
      {kind === 'end' && (
        <>
          <circle cx={21} cy={13} r={2.4} fill={INK} />
          <circle cx={21} cy={23} r={2.4} fill={INK} />
          <line x1={26} x2={26} y1={6} y2={30} stroke={INK} strokeWidth={1.6} />
          <rect x={30} y={6} width={4} height={24} fill={INK} />
        </>
      )}
      {kind === 'endings' && (
        <g fill="none" stroke={INK} strokeWidth={1.6}>
          <path d="M2 18 V4 H22 V18" />
          <path d="M26 18 V4 H46" />
          <text x={5} y={16} fill={INK} stroke="none" fontSize={10} fontWeight={700}>
            1.
          </text>
          <text x={29} y={16} fill={INK} stroke="none" fontSize={10} fontWeight={700}>
            2.
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * The form-reading drill's context panel (design §7): the rules for the
 * card's kind of form, and from level 2 the signs drawn and named. It never
 * names a card's answer (research/02 rule 4): the learner applies the rule.
 */
export function FormReadingContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<FormReadingPrompt, FormReadingAnswer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = formReadingGuides(prompt, guided ? 3 : guideLevel);
  const endings = prompt.bars.some((b) => b.ending);
  return (
    <div className={styles.panel}>
      <h2>{prompt.shape ? 'Repeats' : 'Pickups'}</h2>
      {guides.rules.map((rule) => (
        <p key={rule}>{rule}</p>
      ))}
      {guides.legend && (
        <ul className={styles.legend}>
          <li>
            <Sign kind="begin" /> Begin repeat
          </li>
          <li>
            <Sign kind="end" /> End repeat
          </li>
          {endings && (
            <li>
              <Sign kind="endings" /> 1st and 2nd endings
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
