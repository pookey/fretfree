import { diatonicChords, keyName, majorKey } from '../../theory';
import styles from './DiatonicChords.module.css';

/** Display form: `F#m` → `F♯m`, `Bbdim` → `B♭dim`. */
function pretty(symbol: string): string {
  return symbol.replace(
    /^([A-G])([#b]*)/,
    (_, letter: string, acc: string) => letter + acc.replace(/#/g, '♯').replace(/b/g, '♭'),
  );
}

export interface DiatonicChordsProps {
  /** The major key's tonic, e.g. `F#`. */
  tonic: string;
  /**
   * Name each chord. The chords spell the scale (their roots are its notes),
   * so a spelling prompt shows only the numerals until it is answered
   * (research/02 rule 4).
   */
  reveal: boolean;
}

/**
 * The key and its diatonic triads for the session's context panel (design §7):
 * the numerals I ii iii IV V vi vii° always, and each chord's name once it is
 * no longer the answer. Built on `theory/harmony`.
 */
export function DiatonicChords({ tonic, reveal }: DiatonicChordsProps) {
  const key = majorKey(tonic);
  const name = pretty(keyName(key));
  return (
    <ol
      className={styles.chords}
      aria-label={reveal ? `Chords in ${name}` : 'Chords in a major key'}
      data-testid="diatonic-chords"
      data-reveal={reveal ? 'true' : undefined}
    >
      {diatonicChords(key).map((c) => (
        <li key={c.degree}>
          <span className={styles.roman}>{c.roman}</span>
          {reveal && <span className={styles.symbol}>{pretty(c.symbol)}</span>}
        </li>
      ))}
    </ol>
  );
}
