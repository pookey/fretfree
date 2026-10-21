/**
 * Display spelling for pitch names. The model, item IDs and stored answers
 * keep tonal's ASCII spelling (`F#`, `Bb`); anything a learner reads uses the
 * music glyphs (`F♯`, `B♭`), as printed music does.
 */

/**
 * The display form of a pitch class, note, chord or key name: `F#` → `F♯`,
 * `Bb3` → `B♭3`, `Bbm7b5` → `B♭m7♭5`, `C7#9` → `C7♯9`, `Eb major` → `E♭ major`,
 * `C##` → `C𝄪`. A `b` is a flat only after a note letter or before a degree
 * number, so `Bdim` and `Bm` keep theirs. Already-displayed text is unchanged.
 */
export function displayPc(name: string): string {
  return name
    .replace(/(?<![A-Za-z])([A-G])bb/g, '$1𝄫')
    .replace(/(?<![A-Za-z])([A-G])b/g, '$1♭')
    .replace(/b(?=\d)/g, '♭')
    .replace(/##/g, '𝄪')
    .replace(/#/g, '♯');
}

/**
 * A pitch class as a screen reader should say it, which not every
 * voice does for the glyphs: `F#` or `F♯` → `F sharp`, `Bb` → `B flat`,
 * `C##` → `C double sharp`.
 */
export function spokenPc(name: string): string {
  const m = /^([A-G])(##|𝄪|#|♯|bb|𝄫|b|♭)?(.*)$/u.exec(name);
  if (!m) return name;
  const [, letter, accidental = '', rest = ''] = m;
  const said: Record<string, string> = {
    '##': ' double sharp',
    '𝄪': ' double sharp',
    '#': ' sharp',
    '♯': ' sharp',
    bb: ' double flat',
    '𝄫': ' double flat',
    b: ' flat',
    '♭': ' flat',
  };
  return `${letter}${said[accidental] ?? ''}${rest}`;
}
