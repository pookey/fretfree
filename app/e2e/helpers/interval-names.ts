/**
 * D5's interval buttons show the short name (`M3`) and carry the name in
 * words too (`M3, major 3rd`), so a screen reader says what the abbreviation
 * means (M10-06). An independent key: deliberately not imported from app code.
 */
const LONG: Record<string, string> = {
  P1: 'perfect unison',
  m2: 'minor 2nd',
  M2: 'major 2nd',
  m3: 'minor 3rd',
  M3: 'major 3rd',
  P4: 'perfect 4th',
  TT: 'tritone',
  P5: 'perfect 5th',
  m6: 'minor 6th',
  M6: 'major 6th',
  m7: 'minor 7th',
  M7: 'major 7th',
  P8: 'perfect octave',
};

/** The accessible name of D5's button for an interval: `M3` → `M3, major 3rd`. */
export function d5ButtonName(short: string): string {
  const long = LONG[short];
  if (!long) throw new Error(`Not an interval name: ${short}`);
  return `${short}, ${long}`;
}
