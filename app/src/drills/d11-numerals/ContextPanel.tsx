import type { DrillContextPanelProps } from '../types';
import {
  d11Guides,
  d11Hint,
  d11Pattern,
  d11Scale,
  prettyKey,
  type D11Answer,
  type D11Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/**
 * D11's context panel (design §7): how to find the chord, faded by guide
 * level (rule 9). Level 1 names the method (count up the scale), level 2
 * adds the key's quality pattern (I ii iii IV V vi vii°), and level 3 the
 * key's scale notes. The session hides the panel at level 0.
 */
export function NumeralsContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D11Prompt, D11Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = d11Guides(guided ? 3 : guideLevel);
  const mode = prompt.key.mode === 'major' ? 'major' : 'minor';
  return (
    <div className={styles.panel}>
      <h2>{prompt.kind === 'nashville' ? 'Nashville numbers' : 'Roman numerals'}</h2>
      {guides.hint && <p>{d11Hint(prompt)}</p>}
      {guides.pattern && (
        <>
          <p>
            Every {mode} key has the same pattern:{' '}
            {prompt.kind === 'nashville'
              ? 'm is minor, ° is diminished.'
              : 'upper case is major, lower case minor, ° diminished.'}
          </p>
          <ol className={styles.pattern} aria-label={`Chords in a ${mode} key`}>
            {d11Pattern(prompt).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </>
      )}
      {guides.scale && (
        <p data-testid="d11-scale">
          {prettyKey(prompt.key)}: <strong>{d11Scale(prompt).join(' ')}</strong>
        </p>
      )}
    </div>
  );
}
