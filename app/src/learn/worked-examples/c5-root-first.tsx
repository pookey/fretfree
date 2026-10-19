import {
  cagedShape,
  chordToneOf,
  chromaOf,
  midiAt,
  triadCore,
  type CagedShapeName,
  type ChordDegree,
  type Degree,
  type Position,
  type TriadQuality,
} from '../../theory';
import type { ExampleStep, WorkedExample } from './types';

const HALF_STEPS = { major: 'four', minor: 'three' } as const;

const DEGREE_WORD: Readonly<Record<Degree, string>> = {
  R: 'root',
  '3': '3rd',
  b3: '3rd',
  '5': '5th',
  b7: '♭7th',
};

/** Semitones from `low` up to `high`, octave-reduced to 0–11. */
const upFrom = (low: Position, high: Position) => (((midiAt(high) - midiAt(low)) % 12) + 12) % 12;

/** A shape note's name, spelt from the chord (B minor's 3rd is D, never C##). */
function toneName(root: string, quality: TriadQuality, degree: Degree, at: Position): string {
  const name = chordToneOf(root, quality, (degree === 'R' ? '1' : degree) as ChordDegree);
  // The spelling has to name the note the template put there.
  if (!name || chromaOf(name) !== midiAt(at) % 12) {
    throw new Error(
      `${root} ${quality}'s ${degree} is not at string ${at.string}, fret ${at.fret}`,
    );
  }
  return name;
}

/**
 * "Major or minor?" read off the triad core of a CAGED shape: find the root,
 * then the 3rd above it decides (D8, D36). The core is the step's shape and
 * its 3rd the answer. When the lowest note isn't the root, the trap is the
 * note a 3rd above that bass note: the one a learner who takes the bass for
 * the root would tap. `showRoot` marks the root, for the worked stage.
 */
export function rootFirstStep(
  shape: CagedShapeName,
  root: string,
  quality: TriadQuality,
  opts: { minFret?: number; showRoot?: boolean } = {},
): ExampleStep {
  const core = triadCore(cagedShape(shape, root, { quality, minFret: opts.minFret }));
  const r = core.notes.find((n) => n.degree === 'R');
  const third = core.notes.find((n) => n.degree === '3' || n.degree === 'b3');
  const bass = core.notes[0];
  if (!r || !third || !bass) throw new Error(`${shape} shape of ${root} has no root or 3rd`);
  const at = (p: Position): Position => ({ string: p.string, fret: p.fret });
  const name = (n: Position & { degree: Degree }) => toneName(root, quality, n.degree, n);
  const step: ExampleStep = {
    prompt: 'Major or minor? Find the root, then tap its 3rd.',
    given: opts.showRoot ? [at(r)] : [],
    answer: at(third),
    explain:
      `Root first: ${root} on string ${r.string}, fret ${r.fret}. Its 3rd is ${name(third)}, on string ${third.string}: ` +
      `${root} to ${name(third)} is ${HALF_STEPS[quality]} half steps, a ${quality} 3rd, so the chord is ${root} ${quality}.`,
    hint: `Root first: in the ${shape} shape it’s on string ${r.string}. Then count up to the 3rd: four half steps is major, three is minor.`,
    shape: core.notes,
  };
  if (bass.degree === 'R') return step;
  const misread = core.notes.find(
    (n) => n !== third && n !== bass && [3, 4].includes(upFrom(bass, n)),
  );
  if (!misread) return step;
  return {
    ...step,
    trap: {
      at: at(misread),
      name: name(misread),
      message: `That's ${name(misread)}, the ${DEGREE_WORD[misread.degree]}. It's a 3rd above the lowest note, ${name(bass)}, but the lowest note isn't always the root. Find the root first: here it's ${root}, on string ${r.string}.`,
    },
  };
}

/**
 * C5 (and D36's "what chord is this?"): read a chord's quality from its 3rd,
 * which means finding its root first. The shapes are CAGED triad cores where
 * the lowest note is often not the root.
 */
const example: WorkedExample = {
  id: 'c5-root-first',
  for: ['C5.tones-triads', 'C5.triads'],
  title: 'Find the root first',
  idea: 'The 3rd tells major from minor, but only counted from the root. Find the root first; it isn’t always the lowest note.',
  // One window for every shape, so where the neck starts says nothing about the root.
  range: { from: 1, to: 9 },
  steps: [
    rootFirstStep('E', 'A', 'major', { showRoot: true }),
    rootFirstStep('E', 'B', 'minor'),
    rootFirstStep('C', 'D', 'major'),
  ],
};

export default example;
