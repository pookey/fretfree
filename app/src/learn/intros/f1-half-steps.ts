import type { ConceptIntro } from './types';

/** F1: sharps and flats, and that one note can have two names (research/03: enharmonic spelling). */
const intro: ConceptIntro = {
  id: 'f1-half-steps',
  for: ['F1.half-steps'],
  title: 'Sharps and flats',
  text: 'A half step is one fret. A half step up from a letter is its sharp (#): C to C#. A half step down is its flat (b): D to Db. C# and Db are one note with two names.',
  diagram: { kind: 'wheel', guideLevel: 3, start: 'C' },
};

export default intro;
