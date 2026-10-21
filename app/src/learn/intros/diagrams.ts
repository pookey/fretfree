import type { FretMarker, MarkerStyle } from '../../components/fretboard/Fretboard';
import { noteAt } from '../../theory';

/** Named notes on one string, labelled at every guide level. */
export function notesOn(string: number, frets: readonly number[], style: MarkerStyle = 'tone') {
  return frets.map((fret): FretMarker => ({
    string,
    fret,
    style,
    label: noteAt({ string, fret }).pc,
    forceLabel: true,
  }));
}
