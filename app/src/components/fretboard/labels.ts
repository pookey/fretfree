import { cellLabel, noteAt, type AccidentalPref, type Position, type Tuning } from '../../theory';
import { displayPc, spokenDegree, spokenPc } from '../../theory/pitch-display';

/**
 * The neck's text (design §8): marker labels and open-string names show the
 * music glyphs (`F♯`, `B♭`, `♭3`), as the drills around the neck do, while
 * screen readers hear the words (`F sharp`, `flat 3`). Callers may pass
 * tonal's ASCII spelling; the learner's sharp/flat preference has already
 * chosen the name.
 */

const DEGREE = /^(##|#|bb|b)?(\d+)$/;
const DEGREE_GLYPH: Readonly<Record<string, string>> = { '##': '𝄪', '#': '♯', bb: '𝄫', b: '♭' };
const GLYPHS = /[♯♭𝄪𝄫]/u;
const PITCH_CLASS = /^[A-G](##|#|bb|b|♯|♭|𝄪|𝄫)?$/u;
const GLYPH_DEGREE = /^(♯|♭|𝄪|𝄫)?\d+$/u;

/** A label as the neck shows it: `F#` → `F♯`, `Bb` → `B♭`, `b3` → `♭3`, `bb7` → `𝄫7`. */
export function neckText(label: string): string {
  const degree = DEGREE.exec(label);
  if (degree) return `${DEGREE_GLYPH[degree[1] ?? ''] ?? ''}${degree[2]}`;
  return displayPc(label);
}

/**
 * How a screen reader should say neck text, which not every voice does for
 * the glyphs: `F♯` → `F sharp`, `♭3` → `flat 3`, `F♯ / G♭` → `F sharp / G
 * flat`. Undefined when the text reads as written.
 *
 * Its inputs are the neck's labels: pitch classes, degrees, fingers and fret
 * numbers (the last two never carry a glyph). Anything else, such as a chord
 * name (`B♭m`, `C7♯9`), is undefined too rather than half spoken ("B flatm"):
 * a caller labelling chords passes the marker's own `spokenLabel`.
 */
export function spokenNeckText(text: string): string | undefined {
  if (!GLYPHS.test(text)) return undefined;
  const parts = text.split(/(\s+|\/)/);
  const spoken = parts.map((part) => {
    if (/^(\s+|\/)?$/.test(part)) return part;
    if (PITCH_CLASS.test(part)) return spokenPc(part);
    if (GLYPH_DEGREE.test(part) || DEGREE.test(part)) return spokenDegree(part);
    return null;
  });
  return spoken.includes(null) ? undefined : spoken.join('');
}

/**
 * A cell's accessible name, e.g. `string 1, fret 2, F sharp` when notes are
 * revealed: the pitch spoken in words, as the markers are.
 */
export function cellName(
  pos: Position,
  opts: { tuning?: Tuning; pref?: AccidentalPref; revealNote?: boolean } = {},
): string {
  const base = cellLabel(pos);
  if (!opts.revealNote) return base;
  return `${base}, ${spokenPc(noteAt(pos, opts.tuning, opts.pref).pc)}`;
}
