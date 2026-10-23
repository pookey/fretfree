import type { FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition } from '../../theory';
import {
  d8DegreeLabel,
  d8DegreeSpoken,
  d8DegreeStyle,
  d8Display,
  d8NoteAt,
  d8Targets,
  type D8Answer,
  type D8Prompt,
  type ToneNote,
} from './logic';

/** Every marker of the shape shares this group, so the neck outlines it (guide levels 2–3). */
export const D8_GROUP = 'd8-shape';

/** A note drawn by its degree, in shape, colour and label, as the context panel's legend draws it. */
function byDegree(n: ToneNote): FretMarker {
  return {
    string: n.string,
    fret: n.fret,
    group: D8_GROUP,
    style: d8DegreeStyle(n.degree),
    label: d8DegreeLabel(n.degree),
    spokenLabel: d8DegreeSpoken(n.degree),
    forceLabel: true,
  };
}

/**
 * The markers before an answer. A worked example draws every note by its
 * degree, matching the legend, and rings the notes to tap (or the note to
 * name) on top of their shapes (rule 8). A recall prompt draws the shape in
 * letter names as the guides allow, with the roots as guides allow, and
 * never labels the ringed note.
 */
export function d8PromptMarkers(prompt: D8Prompt, roots: boolean, guided: boolean): FretMarker[] {
  const asked = new Set(guided ? d8Targets(prompt) : []);
  return prompt.notes.map((n): FretMarker => {
    const ringed = prompt.ringed && samePosition(n, prompt.ringed);
    const target = ringed || (prompt.mode === 'tap' && asked.has(n));
    if (guided) return target ? { ...byDegree(n), emphasis: true } : byDegree(n);
    const base = { string: n.string, fret: n.fret, group: D8_GROUP, label: d8Display(n.name) };
    if (target) return { string: n.string, fret: n.fret, group: D8_GROUP, style: 'target' };
    if (roots && n.degree === '1') return { ...base, style: 'root' };
    return { ...base, style: prompt.mode === 'name' ? 'ghost' : 'tone' };
  });
}

/** After an answer: every note by its degree, the answer marked correct and a wrong tap marked. */
export function d8FeedbackMarkers(
  prompt: D8Prompt,
  answer: D8Answer,
  correct: boolean,
): FretMarker[] {
  const tap = typeof answer === 'string' ? null : answer;
  const isAnswer = (n: ToneNote) =>
    prompt.ringed ? samePosition(n, prompt.ringed) : n.degree === prompt.degree;
  const markers = prompt.notes.map((n): FretMarker => {
    const marker = byDegree(n);
    if (!correct && tap && samePosition(n, tap)) return { ...marker, style: 'wrong' };
    if (isAnswer(n)) return { ...marker, style: 'correct' };
    return marker;
  });
  if (tap && !correct && !d8NoteAt(prompt, tap)) {
    const name = noteAt(tap, prompt.tuning, prompt.accidentalPref).pc;
    markers.push({ ...tap, style: 'wrong', label: d8Display(name), forceLabel: true });
  }
  return markers;
}
