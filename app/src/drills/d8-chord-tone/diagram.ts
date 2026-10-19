import type { ChordVoicing } from '../../components/chord-diagram/model';
import { d8DegreeLabel, d8DegreeStyle, type D8Prompt } from './logic';

/**
 * The shape as a chord diagram for the context panel (design §7 "the current
 * chord diagram"). Before an answer it draws what the neck draws: plain dots,
 * with roots squared only where the neck squares them (`roots`). Once the
 * degree is no longer asked for (`reveal`), each dot takes its degree's
 * marker and label. A barre chord gets its barre at the shape's lowest fret.
 */
export function d8DiagramVoicing(prompt: D8Prompt, reveal: boolean): ChordVoicing {
  const notes = prompt.notes.map((n) => ({
    string: n.string,
    fret: n.fret,
    style: reveal
      ? d8DegreeStyle(n.degree)
      : n.degree === '1'
        ? ('root' as const)
        : ('tone' as const),
    label: d8DegreeLabel(n.degree),
  }));
  if (prompt.voicing !== 'barre') return { notes };
  const under = prompt.notes.filter((n) => n.fret === prompt.span.from).map((n) => n.string);
  if (under.length < 2 || prompt.span.from === 0) return { notes };
  return {
    notes,
    barres: [
      { fret: prompt.span.from, from: Math.min(...under), to: Math.max(...under), finger: 1 },
    ],
  };
}
